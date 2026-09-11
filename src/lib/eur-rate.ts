import prisma from './prisma';
import { getSettings, setSettings, type SettingsShape } from './settings';
import { invalidatePricingCache } from './pricing';
import { notifyStaff } from './notify';

/**
 * دریافت خودکار نرخ یورو.
 *
 * نرخ آزاد یورو مبنای همه قیمت‌های پنل است. به‌روزرسانی دستی آن هم فراموش می‌شود
 * و هم دیر؛ اگر یورو بالا برود و نرخ پنل قدیمی بماند، هر فروش ضرر است. این ماژول
 * نرخ را از منبعی که مدیر انتخاب کرده می‌گیرد، حاشیه دلخواه او را رویش می‌کشد و
 * در بازه زمانی قابل تنظیم اعمال می‌کند.
 *
 * چون یک عدد غلط می‌تواند قیمت همه پلن‌ها را خراب کند، چند محافظ دارد:
 *   • کران مطلق: نرخ خارج از بازه منطقی هرگز پذیرفته نمی‌شود
 *   • سقف تغییر: جهش بیش از حد مجاز اعمال نمی‌شود و فقط به مدیر خبر می‌رسد
 *   • تاریخچه کامل هر دریافت در جدول EurRateLog می‌ماند
 */

/** کران‌های مطلق عقل سلیم (تومان به ازای هر یورو) */
const HARD_MIN = 5_000;
const HARD_MAX = 20_000_000;

export type FetchedRate = {
  /** نرخ خام منبع، تبدیل‌شده به تومان */
  rate: number;
  source: string;
  /** توضیح کوتاه برای نمایش، مثل نام منبع و واحد */
  detail: string;
};

/** خواندن یک مقدار از JSON با مسیر نقطه‌ای مثل «eur.value» یا «current.price_eur.p» */
function digJson(data: unknown, path: string): unknown {
  let cur: unknown = data;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** «۱۲۳٬۴۵۶» یا "123,456.7" یا 123456 → عدد */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const normalized = value
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٬,\s]/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

async function fetchJson(url: string, timeoutMs = 15_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'PasargadMizban/1.0', Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`پاسخ ${res.status} از منبع نرخ`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * دریافت نرخ از منبع پیکربندی‌شده.
 * خروجی همیشه «تومان به ازای هر یورو» است.
 */
export async function fetchEurRate(settings?: SettingsShape): Promise<FetchedRate> {
  const s = settings ?? (await getSettings());

  if (s.eurAutoSource === 'navasan') {
    if (!s.eurAutoApiKey) {
      throw new Error('برای منبع نوسان باید کلید API را در تنظیمات وارد کنید (ثبت‌نام رایگان در navasan.tech).');
    }
    const data = await fetchJson(
      `https://api.navasan.tech/latest/?api_key=${encodeURIComponent(s.eurAutoApiKey)}&item=eur`,
    );
    const value = toNumber(digJson(data, 'eur.value'));
    if (value === null) throw new Error('پاسخ نوسان قابل خواندن نبود؛ کلید API را بررسی کنید.');
    // نوسان به تومان گزارش می‌دهد
    return { rate: value, source: 'navasan', detail: 'نوسان (تومان)' };
  }

  if (s.eurAutoSource === 'tgju') {
    const data = await fetchJson('https://call1.tgju.org/ajax.json');
    const value = toNumber(digJson(data, 'current.price_eur.p'));
    if (value === null) throw new Error('پاسخ tgju قابل خواندن نبود.');
    // tgju به ریال گزارش می‌دهد
    return { rate: Math.round(value / 10), source: 'tgju', detail: 'tgju.org (ریال ÷ ۱۰)' };
  }

  // منبع دلخواه
  if (!s.eurAutoUrl || !s.eurAutoJsonPath) {
    throw new Error('برای منبع دلخواه، آدرس و مسیر JSON را در تنظیمات وارد کنید.');
  }
  const data = await fetchJson(s.eurAutoUrl);
  const value = toNumber(digJson(data, s.eurAutoJsonPath));
  if (value === null) {
    throw new Error(`مقداری در مسیر «${s.eurAutoJsonPath}» پیدا نشد یا عدد نبود.`);
  }
  const rate = s.eurAutoUnit === 'rial' ? Math.round(value / 10) : Math.round(value);
  return {
    rate,
    source: 'custom',
    detail: `${new URL(s.eurAutoUrl).hostname} (${s.eurAutoUnit === 'rial' ? 'ریال ÷ ۱۰' : 'تومان'})`,
  };
}

/** اعمال حاشیه مدیر و گرد کردن */
export function applyMargin(rate: number, s: SettingsShape): number {
  const withPercent = rate * (1 + s.eurAutoMarkupPercent / 100);
  const withFixed = withPercent + s.eurAutoMarkupFixed;
  const step = Math.max(1, s.eurAutoRoundTo);
  return Math.round(withFixed / step) * step;
}

export type RateUpdateResult = {
  status: 'applied' | 'unchanged' | 'rejected' | 'error' | 'disabled' | 'not-due';
  fetched?: number;
  finalRate?: number;
  previous?: number;
  message: string;
};

/**
 * یک دور کامل: دریافت، اعتبارسنجی، اعمال.
 * با force=true بازه زمانی نادیده گرفته می‌شود (برای دکمه «همین حالا» در پنل).
 */
export async function runEurRateUpdate(force = false): Promise<RateUpdateResult> {
  const settings = await getSettings(true);

  if (!settings.eurAutoEnabled && !force) {
    return { status: 'disabled', message: 'دریافت خودکار نرخ خاموش است.' };
  }

  // آیا زمانش رسیده؟
  if (!force) {
    const last = await prisma.eurRateLog.findFirst({
      where: { applied: true },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const dueAt = last ? last.createdAt.getTime() + settings.eurAutoIntervalHours * 3600_000 : 0;
    if (Date.now() < dueAt) {
      return { status: 'not-due', message: 'هنوز زمان به‌روزرسانی بعدی نرسیده است.' };
    }
  }

  const previous = settings.eurRate;

  let fetched: FetchedRate;
  try {
    fetched = await fetchEurRate(settings);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'خطای نامشخص در دریافت نرخ';
    await prisma.eurRateLog.create({
      data: { fetchedRate: 0, previousRate: previous, source: settings.eurAutoSource, applied: false, error: message },
    });
    await maybeWarnRepeatedFailures();
    return { status: 'error', previous, message };
  }

  const finalRate = applyMargin(fetched.rate, settings);

  // ── محافظ‌ها ──
  if (finalRate < HARD_MIN || finalRate > HARD_MAX) {
    const message = `نرخ دریافتی (${finalRate.toLocaleString('fa-IR')} تومان) خارج از بازه منطقی است و اعمال نشد.`;
    await prisma.eurRateLog.create({
      data: { fetchedRate: fetched.rate, previousRate: previous, source: fetched.source, applied: false, error: message },
    });
    await notifyStaff({
      kind: 'security',
      type: 'error',
      title: 'نرخ خودکار یورو غیرمنطقی بود',
      body: `${message}\nمنبع: ${fetched.detail}`,
      dedupeHours: 3,
      wait: true,
    }).catch(() => null);
    return { status: 'rejected', fetched: fetched.rate, finalRate, previous, message };
  }

  const changePercent = previous > 0 ? Math.abs((finalRate - previous) / previous) * 100 : 0;
  if (previous > 0 && changePercent > settings.eurAutoMaxChangePercent) {
    const message =
      `نرخ تازه ${finalRate.toLocaleString('fa-IR')} تومان است؛ ` +
      `${changePercent.toFixed(1)}٪ با نرخ فعلی (${previous.toLocaleString('fa-IR')}) فرق دارد و از سقف ` +
      `${settings.eurAutoMaxChangePercent}٪ می‌گذرد. برای اطمینان اعمال نشد.`;
    await prisma.eurRateLog.create({
      data: { fetchedRate: fetched.rate, previousRate: previous, source: fetched.source, applied: false, error: message },
    });
    await notifyStaff({
      kind: 'security',
      type: 'warning',
      title: 'جهش نرخ یورو — نیاز به تایید دستی',
      body: `${message}\nاگر درست است، نرخ را دستی در بخش قیمت‌گذاری وارد کنید یا سقف تغییر را بالا ببرید.`,
      dedupeHours: 3,
      email: true,
      wait: true,
    }).catch(() => null);
    return { status: 'rejected', fetched: fetched.rate, finalRate, previous, message };
  }

  await prisma.eurRateLog.create({
    data: {
      fetchedRate: fetched.rate,
      appliedRate: finalRate,
      previousRate: previous,
      source: fetched.source,
      applied: true,
    },
  });

  if (finalRate === previous) {
    return { status: 'unchanged', fetched: fetched.rate, finalRate, previous, message: 'نرخ تغییری نکرده است.' };
  }

  await setSettings({ eurRate: finalRate });
  invalidatePricingCache();

  return {
    status: 'applied',
    fetched: fetched.rate,
    finalRate,
    previous,
    message:
      `نرخ یورو از ${previous.toLocaleString('fa-IR')} به ${finalRate.toLocaleString('fa-IR')} تومان ` +
      `به‌روزرسانی شد و همه قیمت‌ها با آن حساب می‌شوند.`,
  };
}

/** اگر چند دریافت پیاپی شکست خورد، به مدیر خبر بده تا قیمت‌ها روی نرخ کهنه نمانند */
async function maybeWarnRepeatedFailures(): Promise<void> {
  const recent = await prisma.eurRateLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: { applied: true, error: true },
  });
  if (recent.length === 3 && recent.every((r) => !r.applied && r.error)) {
    await notifyStaff({
      kind: 'security',
      type: 'error',
      title: 'دریافت خودکار نرخ یورو سه بار پیاپی شکست خورد',
      body: 'قیمت‌ها روی نرخ قدیمی مانده‌اند. تنظیمات منبع نرخ را بررسی کنید یا نرخ را دستی وارد کنید.',
      dedupeHours: 12,
      email: true,
      wait: true,
    }).catch(() => null);
  }
}

/** تاریخچه اخیر برای پنل مدیریت */
export async function rateHistory(limit = 20) {
  return prisma.eurRateLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
}
