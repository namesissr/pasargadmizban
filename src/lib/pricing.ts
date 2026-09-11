import prisma from './prisma';
import { getSettings, type SettingsShape } from './settings';
import { roundUpTo, mulFloat } from './money';
import type { HPrice } from './hetzner';

/**
 * موتور قیمت‌گذاری.
 *
 * فرمول: قیمت هتزنر (یورو، با احتساب VAT هتزنر = gross)
 *        × نرخ یورو به تومان
 *        × (۱ + درصد سود)
 *        + مبلغ ثابت
 *        − تخفیف کاربر
 *        + مالیات داخلی
 *        سپس گرد شدن به بالا
 *
 * قوانین قیمت‌گذاری (PricingRule) به ترتیب اولویت اعمال می‌شوند:
 *   USER > SERVER_TYPE > LOCATION > GLOBAL
 */

export type PriceBreakdown = {
  /** قیمت خام هتزنر به یورو */
  eurHourly: number;
  eurMonthly: number;
  /** قیمت نهایی به تومان */
  hourly: bigint;
  monthly: bigint;
  /** قیمت ماهانه معادل ساعتی (۷۳۰ ساعت) — برای مقایسه */
  hourlyMonthlyCap: bigint;
  markupPercent: number;
  markupFixed: bigint;
  eurRate: number;
  includedTraffic: bigint;
};

export type ServerTypePrices = {
  name: string;
  location: string;
  price: PriceBreakdown;
};

/** میانگین ساعات ماه که هتزنر برای سقف صورتحساب ساعتی استفاده می‌کند */
export const HOURS_PER_MONTH = 730;

type RuleRow = {
  scope: string;
  targetKey: string | null;
  markupPercent: number;
  markupFixed: bigint;
  priority: number;
};

let ruleCache: { rows: RuleRow[]; expires: number } | null = null;

async function loadRules(): Promise<RuleRow[]> {
  if (ruleCache && ruleCache.expires > Date.now()) return ruleCache.rows;
  let rows: RuleRow[] = [];
  try {
    rows = await prisma.pricingRule.findMany({
      where: { active: true },
      orderBy: { priority: 'desc' },
      select: { scope: true, targetKey: true, markupPercent: true, markupFixed: true, priority: true },
    });
  } catch {
    rows = [];
  }
  ruleCache = { rows, expires: Date.now() + 15_000 };
  return rows;
}

export function invalidatePricingCache() {
  ruleCache = null;
}

function resolveMarkup(
  rules: RuleRow[],
  settings: SettingsShape,
  serverTypeName: string,
  locationName: string,
  userId?: string,
): { percent: number; fixed: bigint } {
  const order: { scope: string; key: string | null }[] = [
    { scope: 'USER', key: userId ?? null },
    { scope: 'SERVER_TYPE', key: serverTypeName },
    { scope: 'LOCATION', key: locationName },
    { scope: 'GLOBAL', key: null },
  ];

  for (const step of order) {
    if (step.scope === 'USER' && !step.key) continue;
    const hit = rules.find(
      (r) => r.scope === step.scope && (step.scope === 'GLOBAL' || r.targetKey === step.key),
    );
    if (hit) return { percent: hit.markupPercent, fixed: hit.markupFixed };
  }
  return { percent: settings.markupPercent, fixed: BigInt(settings.markupFixed) };
}

function eurToToman(eur: number, rate: number): bigint {
  return BigInt(Math.round(eur * rate));
}

/** محاسبه قیمت یک نوع سرور در یک لوکیشن */
export async function computePrice(params: {
  hetznerPrice: HPrice;
  serverTypeName: string;
  locationName: string;
  userId?: string;
  /** تخفیف درصدی اختصاصی کاربر */
  userDiscountPct?: number;
  includedTraffic?: bigint;
}): Promise<PriceBreakdown> {
  const settings = await getSettings();
  const rules = await loadRules();
  const { percent, fixed } = resolveMarkup(
    rules,
    settings,
    params.serverTypeName,
    params.locationName,
    params.userId,
  );

  const eurHourly = Number(params.hetznerPrice.price_hourly.gross);
  const eurMonthly = Number(params.hetznerPrice.price_monthly.gross);

  const discount = Math.max(0, Math.min(90, params.userDiscountPct ?? 0));
  const factor = (1 + percent / 100) * (1 - discount / 100) * (1 + settings.vatPercent / 100);

  const rawHourly = mulFloat(eurToToman(eurHourly, settings.eurRate), factor);
  const rawMonthly = mulFloat(eurToToman(eurMonthly, settings.eurRate), factor) + fixed;

  const hourly = roundUpTo(rawHourly, BigInt(settings.roundHourly || 1));
  const monthly = roundUpTo(rawMonthly, BigInt(settings.roundMonthly || 1));

  return {
    eurHourly,
    eurMonthly,
    hourly: hourly > 0n ? hourly : 1n,
    monthly,
    hourlyMonthlyCap: hourly * BigInt(HOURS_PER_MONTH),
    markupPercent: percent,
    markupFixed: fixed,
    eurRate: settings.eurRate,
    includedTraffic:
      params.includedTraffic ??
      BigInt(params.hetznerPrice.included_traffic ?? 0),
  };
}

/** قیمت پشتیبان‌گیری خودکار — هتزنر ۲۰٪ قیمت سرور را می‌گیرد */
export const BACKUP_PERCENTAGE = 0.2;

export function backupPrice(base: PriceBreakdown, percentage = BACKUP_PERCENTAGE) {
  return {
    hourly: mulFloat(base.hourly, percentage),
    monthly: mulFloat(base.monthly, percentage),
  };
}

/** قیمت اسنپ‌شات به ازای هر گیگابایت در ماه */
export async function snapshotPricePerGb(): Promise<bigint> {
  const settings = await getSettings();
  const rules = await loadRules();
  const { percent } = resolveMarkup(rules, settings, '__snapshot__', '__any__');
  // نرخ هتزنر: ۰.۰۱۱۹ یورو بر گیگابایت در ماه (gross) — از تنظیمات قابل بازنویسی است
  const eurPerGb = 0.0119;
  return roundUpTo(
    mulFloat(eurToToman(eurPerGb, settings.eurRate), 1 + percent / 100),
    BigInt(settings.roundMonthly || 1),
  );
}

/** جدول کامل قیمت برای نمایش در صفحه ساخت سرور */
export async function buildCatalogPrices(userId?: string, userDiscountPct = 0) {
  const [serverTypes, locations, datacenters] = await Promise.all([
    prisma.hetznerServerType.findMany({
      where: { enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { cores: 'asc' }, { memory: 'asc' }],
    }),
    prisma.hetznerLocation.findMany({ where: { enabled: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.hetznerDatacenter.findMany(),
  ]);

  const availabilityByLocation = new Map<string, Set<string>>();
  for (const dc of datacenters) {
    const loc = locations.find((l) => l.id === dc.locationId);
    if (!loc) continue;
    const set = availabilityByLocation.get(loc.name) ?? new Set<string>();
    for (const name of (dc.available as string[]) ?? []) set.add(name);
    availabilityByLocation.set(loc.name, set);
  }

  const out: {
    serverType: (typeof serverTypes)[number];
    prices: Record<string, PriceBreakdown & { available: boolean }>;
  }[] = [];

  for (const st of serverTypes) {
    const rawPrices = (st.prices as unknown as HPrice[]) ?? [];
    const prices: Record<string, PriceBreakdown & { available: boolean }> = {};
    for (const loc of locations) {
      const hp = rawPrices.find((p) => p.location === loc.name);
      if (!hp) continue;
      const price = await computePrice({
        hetznerPrice: hp,
        serverTypeName: st.name,
        locationName: loc.name,
        userId,
        userDiscountPct,
        includedTraffic: st.includedTraffic,
      });
      prices[loc.name] = {
        ...price,
        available: availabilityByLocation.get(loc.name)?.has(st.name) ?? false,
      };
    }
    if (Object.keys(prices).length) out.push({ serverType: st, prices });
  }

  return { items: out, locations };
}

/** قیمت یک ترکیب مشخص — برای ساخت سرور و صورتحساب */
export async function priceFor(
  serverTypeName: string,
  locationName: string,
  userId?: string,
  userDiscountPct = 0,
): Promise<PriceBreakdown> {
  const st = await prisma.hetznerServerType.findUnique({ where: { name: serverTypeName } });
  if (!st) throw new Error(`نوع سرور «${serverTypeName}» در کاتالوگ یافت نشد.`);
  const rawPrices = (st.prices as unknown as HPrice[]) ?? [];
  const hp = rawPrices.find((p) => p.location === locationName);
  if (!hp) throw new Error(`قیمت «${serverTypeName}» برای لوکیشن «${locationName}» موجود نیست.`);
  return computePrice({
    hetznerPrice: hp,
    serverTypeName,
    locationName,
    userId,
    userDiscountPct,
    includedTraffic: st.includedTraffic,
  });
}
