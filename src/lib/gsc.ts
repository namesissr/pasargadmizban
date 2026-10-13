import { SignJWT, importPKCS8, type KeyLike } from 'jose';
import { env } from './env';

/**
 * گوگل سرچ کنسول.
 *
 * داده‌ای که اینجا می‌خوانیم، تنها منبع واقعی «جایگاه ما در گوگل» است: هر
 * عدد دیگری در هر ابزاری، تقریب است. احراز هویت با سرویس‌اکانت انجام می‌شود
 * (بدون ورود دستی و بدون نیاز به توکن تازه‌سازی): یک JWT امضا می‌کنیم و با
 * آن توکن دسترسی می‌گیریم.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

type TokenCache = { token: string; expires: number };
let tokenCache: TokenCache | null = null;

export class GscError extends Error {
  constructor(
    message: string,
    readonly status = 500,
  ) {
    super(message);
    this.name = 'GscError';
  }
}

export function gscConfigured(): boolean {
  return env.gsc.enabled;
}

/** توکن دسترسی گوگل؛ تا یک دقیقه پیش از انقضا از کش خوانده می‌شود */
async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.expires > Date.now() + 60_000) return tokenCache.token;
  if (!env.gsc.enabled) throw new GscError('سرچ کنسول تنظیم نشده است.', 503);

  let key: KeyLike;
  try {
    key = await importPKCS8(env.gsc.privateKey, 'RS256');
  } catch {
    throw new GscError('کلید خصوصی سرویس‌اکانت معتبر نیست؛ مقدار GSC_PRIVATE_KEY را بررسی کنید.', 500);
  }

  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(env.gsc.clientEmail)
    .setSubject(env.gsc.clientEmail)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new GscError(`گرفتن توکن گوگل ناموفق بود (${res.status}): ${body.slice(0, 200)}`, 502);
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new GscError('پاسخ گوگل توکن نداشت.', 502);

  tokenCache = { token: data.access_token, expires: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return tokenCache.token;
}

/**
 * گوگل برای ۴۰۳ دو علت کاملاً متفاوت دارد و راه‌حلشان هم فرق می‌کند:
 *   ۱) Search Console API در پروژه سرویس‌اکانت روشن نیست
 *   ۲) سرویس‌اکانت به این پراپرتی دسترسی ندارد (اضافه نشده، یا GSC_SITE_URL
 *      دقیقاً با نشانی پراپرتی یکی نیست)
 * پیام را از روی پاسخ خود گوگل می‌سازیم و در حالت دوم، پراپرتی‌هایی را که
 * سرویس‌اکانت واقعاً می‌بیند هم نشان می‌دهیم تا مقدار درست معلوم باشد.
 */
async function forbiddenError(res: Response, token: string): Promise<GscError> {
  const raw = await res.text();
  let message = '';
  let reasons: string[] = [];
  let apiError = false;
  try {
    const body = JSON.parse(raw) as { error?: { message?: string; details?: { reason?: string }[] } };
    apiError = Boolean(body.error);
    message = body.error?.message ?? '';
    reasons = (body.error?.details ?? []).map((d) => d.reason ?? '').filter(Boolean);
  } catch {
    message = raw;
  }

  // ۴۰۳ بدون پاسخ JSON یعنی درخواست پیش از رسیدن به خود API رد شده است؛
  // نه مشکل دسترسی سرچ کنسول است و نه روشن نبودن API
  if (!apiError) {
    const text = message.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    return new GscError(
      `گوگل درخواست را پیش از رسیدن به Search Console API رد کرد (۴۰۳ بدون توضیح API)${text ? `: «${text}»` : ''}. معمولاً یعنی گوگل این سرویس را برای نشانی IP این سرور ارائه نمی‌دهد؛ تنظیمات سرچ کنسول و گوگل کلاد مشکلی ندارند.`,
      403,
    );
  }

  if (reasons.includes('SERVICE_DISABLED') || /has not been used|is disabled/i.test(message)) {
    const link = raw.match(/https:\/\/console\.developers\.google\.com[^"\s]*/)?.[0];
    return new GscError(
      `Search Console API در پروژه گوگل کلادی که این سرویس‌اکانت در آن ساخته شده روشن نیست${link ? ` — روشن کردن: ${link}` : ''}. اگر API را روشن کرده‌اید، احتمالاً در پروژه دیگری بوده؛ چند دقیقه پس از روشن کردن هم طول می‌کشد تا اثر کند.`,
      403,
    );
  }

  const sites = await listSites(token).catch(() => null);
  const seen =
    sites === null
      ? ` فهرست پراپرتی‌های سرویس‌اکانت هم خوانده نشد. پیام گوگل: «${message.slice(0, 200)}»`
      : sites.length
        ? ` پراپرتی‌هایی که این سرویس‌اکانت می‌بیند: ${sites.map((s) => `«${s}»`).join('، ')} — GSC_SITE_URL باید دقیقاً یکی از این‌ها باشد.`
        : ' این سرویس‌اکانت هیچ پراپرتی‌ای نمی‌بیند؛ ایمیلش را در سرچ کنسول (Settings ← Users and permissions) با دسترسی Full اضافه کنید.';
  return new GscError(
    `سرویس‌اکانت ${env.gsc.clientEmail} به پراپرتی «${env.gsc.siteUrl}» دسترسی ندارد.${seen}`,
    403,
  );
}

/** نشانی پراپرتی‌هایی که سرویس‌اکانت در سرچ کنسول به آن‌ها دسترسی دارد */
export async function listSites(token?: string): Promise<string[]> {
  const bearer = token ?? (await accessToken());
  const res = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites', {
    headers: { authorization: `Bearer ${bearer}` },
  });
  if (!res.ok) throw new GscError(`خواندن فهرست پراپرتی‌ها ناموفق بود (${res.status})`, 502);
  const data = (await res.json()) as { siteEntry?: { siteUrl: string }[] };
  return (data.siteEntry ?? []).map((s) => s.siteUrl);
}

async function gscFetch<T>(path: string, body: unknown): Promise<T> {
  const token = await accessToken();
  const property = encodeURIComponent(env.gsc.siteUrl);

  const res = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${property}/${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status === 403) throw await forbiddenError(res, token);
  if (!res.ok) {
    const text = await res.text();
    throw new GscError(`خطای سرچ کنسول (${res.status}): ${text.slice(0, 200)}`, 502);
  }
  return (await res.json()) as T;
}

export type SearchRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type QueryOptions = {
  startDate: string;
  endDate: string;
  dimensions?: ('query' | 'page' | 'date' | 'country' | 'device')[];
  /** محدود کردن به یک آدرس مشخص */
  page?: string;
  rowLimit?: number;
};

/** داده خام Search Analytics */
export async function searchAnalytics(opts: QueryOptions): Promise<SearchRow[]> {
  const body: Record<string, unknown> = {
    startDate: opts.startDate,
    endDate: opts.endDate,
    dimensions: opts.dimensions ?? [],
    rowLimit: opts.rowLimit ?? 100,
    dataState: 'all',
  };
  if (opts.page) {
    body.dimensionFilterGroups = [
      { filters: [{ dimension: 'page', operator: 'equals', expression: opts.page }] },
    ];
  }

  const data = await gscFetch<{ rows?: SearchRow[] }>('searchAnalytics/query', body);
  return data.rows ?? [];
}

export function daysAgo(days: number): string {
  const d = new Date(Date.now() - days * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

export type Totals = { clicks: number; impressions: number; ctr: number; position: number };

function sumRows(rows: SearchRow[]): Totals {
  if (!rows.length) return { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  // جایگاه را وزنی با نمایش میانگین می‌گیریم، وگرنه صفحه‌های کم‌نمایش عدد را خراب می‌کنند
  const weighted = rows.reduce((s, r) => s + r.position * r.impressions, 0);
  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: impressions ? weighted / impressions : 0,
  };
}

export type SitePerformance = {
  range: { start: string; end: string };
  current: Totals;
  previous: Totals;
  topQueries: SearchRow[];
  topPages: SearchRow[];
  daily: SearchRow[];
};

/** عملکرد کل سایت در بازه دلخواه، همراه مقایسه با بازه قبل */
export async function sitePerformance(days = 28): Promise<SitePerformance> {
  const [current, previous, topQueries, topPages, daily] = await Promise.all([
    searchAnalytics({ startDate: daysAgo(days + 2), endDate: daysAgo(2) }),
    searchAnalytics({ startDate: daysAgo(days * 2 + 2), endDate: daysAgo(days + 3) }),
    searchAnalytics({ startDate: daysAgo(days + 2), endDate: daysAgo(2), dimensions: ['query'], rowLimit: 25 }),
    searchAnalytics({ startDate: daysAgo(days + 2), endDate: daysAgo(2), dimensions: ['page'], rowLimit: 25 }),
    searchAnalytics({ startDate: daysAgo(days + 2), endDate: daysAgo(2), dimensions: ['date'], rowLimit: 60 }),
  ]);

  return {
    range: { start: daysAgo(days + 2), end: daysAgo(2) },
    current: sumRows(current),
    previous: sumRows(previous),
    topQueries,
    topPages,
    daily,
  };
}

export type PagePerformance = {
  totals: Totals;
  queries: SearchRow[];
};

/** عملکرد یک آدرس مشخص */
export async function pagePerformance(url: string, days = 28): Promise<PagePerformance> {
  const [totals, queries] = await Promise.all([
    searchAnalytics({ startDate: daysAgo(days + 2), endDate: daysAgo(2), page: url }),
    searchAnalytics({
      startDate: daysAgo(days + 2),
      endDate: daysAgo(2),
      page: url,
      dimensions: ['query'],
      rowLimit: 20,
    }),
  ]);
  return { totals: sumRows(totals), queries };
}

/** عملکرد همه صفحه‌ها در یک کوئری — برای جدول مقاله‌ها */
export async function allPagesPerformance(days = 28, limit = 500): Promise<Map<string, Totals>> {
  const rows = await searchAnalytics({
    startDate: daysAgo(days + 2),
    endDate: daysAgo(2),
    dimensions: ['page'],
    rowLimit: limit,
  });

  const map = new Map<string, Totals>();
  for (const row of rows) {
    const url = row.keys[0];
    if (!url) continue;
    map.set(url.replace(/\/$/, ''), {
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    });
  }
  return map;
}

export type IndexStatus = {
  /** وضعیت پوشش گوگل، مثل Submitted and indexed */
  coverageState: string | null;
  /** آیا گوگل اجازه ایندکس دیده است */
  indexingState: string | null;
  robotsTxtState: string | null;
  lastCrawlTime: string | null;
  verdict: string | null;
};

/**
 * وضعیت ایندکس یک آدرس (URL Inspection).
 * سهمیه روزانه این endpoint محدود است (حدود ۲۰۰۰ درخواست)، پس فقط هنگام
 * درخواست مدیر برای یک مقاله صدا زده می‌شود، نه برای همه مقاله‌ها.
 */
export async function inspectUrl(url: string): Promise<IndexStatus> {
  const token = await accessToken();
  const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ inspectionUrl: url, siteUrl: env.gsc.siteUrl, languageCode: 'fa' }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new GscError(`بررسی وضعیت ایندکس ناموفق بود (${res.status}): ${text.slice(0, 200)}`, 502);
  }

  const data = (await res.json()) as {
    inspectionResult?: {
      indexStatusResult?: {
        coverageState?: string;
        indexingState?: string;
        robotsTxtState?: string;
        lastCrawlTime?: string;
        verdict?: string;
      };
    };
  };

  const r = data.inspectionResult?.indexStatusResult ?? {};
  return {
    coverageState: r.coverageState ?? null,
    indexingState: r.indexingState ?? null,
    robotsTxtState: r.robotsTxtState ?? null,
    lastCrawlTime: r.lastCrawlTime ?? null,
    verdict: r.verdict ?? null,
  };
}
