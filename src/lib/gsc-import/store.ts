import prisma from '../prisma';
import { env } from '../env';
import { ApiError } from '../errors';
import { getSettings } from '../settings';
import { normalizeFa } from '../seo-score';
import { readTables } from './tables';
import { ZipError } from './zip';
import { parseExport, totalsOf, type Metrics, type MetricRow } from './parse';

/**
 * ذخیره و خواندن خروجی‌های بارگذاری‌شده سرچ کنسول.
 *
 * نشانی‌های داخل خروجی به مقاله‌ها وصل می‌شوند (با نشانی‌های قدیمی هر
 * مقاله هم، تا آمار پیش از تغییر اسلاگ گم نشود).
 */

const MAX_ROWS = 1000;

export type ImportSummary = {
  id: string;
  scope: string;
  fileName: string;
  rangeLabel: string | null;
  startDate: string | null;
  endDate: string | null;
  clicks: number;
  impressions: number;
  postId: string | null;
  pageUrl: string | null;
  createdAt: Date;
};

const SUMMARY_SELECT = {
  id: true,
  scope: true,
  fileName: true,
  rangeLabel: true,
  startDate: true,
  endDate: true,
  clicks: true,
  impressions: true,
  postId: true,
  pageUrl: true,
  createdAt: true,
} as const;

/** میزبان و مسیر یک نشانی، یکدست‌شده برای مقایسه */
export function urlKey(url: string): { host: string; path: string } | null {
  try {
    const u = new URL(url.trim());
    let path = u.pathname;
    try {
      path = decodeURIComponent(path);
    } catch {
      // نشانی با درصد نامعتبر؛ همان خام می‌ماند
    }
    return { host: u.host.replace(/^www\./, '').toLowerCase(), path: path.normalize('NFC').replace(/\/+$/, '') || '/' };
  } catch {
    return null;
  }
}

async function blogHost(): Promise<string | null> {
  const settings = await getSettings();
  const base = (settings.siteUrl || env.appUrl || '').trim();
  return base ? (urlKey(base)?.host ?? null) : null;
}

/**
 * نشانی صفحه → شناسه مقاله.
 * اگر نشانی سایت تنظیم شده باشد، فقط صفحه‌های همان میزبان حساب می‌شوند (در
 * پراپرتی دامنه‌ای، صفحه‌های سایت اصلی و پنل هم در خروجی هستند).
 */
export async function postMatcher(): Promise<(url: string) => string | null> {
  const [host, posts, history] = await Promise.all([
    blogHost(),
    prisma.blogPost.findMany({ select: { id: true, slug: true } }),
    prisma.blogSlugHistory.findMany({ select: { slug: true, postId: true } }),
  ]);

  const bySlug = new Map<string, string>();
  for (const h of history) bySlug.set(h.slug.normalize('NFC'), h.postId);
  for (const p of posts) bySlug.set(p.slug.normalize('NFC'), p.id);

  return (url: string) => {
    const key = urlKey(url);
    if (!key) return null;
    if (host && key.host !== host) return null;
    const match = /^\/blog\/([^/]+)$/.exec(key.path);
    return match ? (bySlug.get(match[1]) ?? null) : null;
  };
}

const trim = (rows: MetricRow[]) =>
  [...rows].sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks).slice(0, MAX_ROWS);

/** فایل‌های بارگذاری‌شده را می‌خواند و یک ردیف خروجی ذخیره می‌کند */
export async function saveImport(files: { name: string; buf: Buffer }[], userId: string | null) {
  let tables;
  try {
    tables = files.flatMap((f) => readTables(f.name, f.buf));
  } catch (err) {
    if (err instanceof ZipError) throw new ApiError(err.message, 422);
    if (err instanceof RangeError) throw new ApiError('حجم بازشده فایل بیش از حد مجاز است.', 422);
    throw err;
  }

  const parsed = parseExport(tables);
  if (!parsed.queries.length && !parsed.pages.length && !parsed.daily.length) {
    throw new ApiError(
      'در این فایل جدول عبارت‌ها، صفحه‌ها یا آمار روزانه پیدا نشد. از بخش Performance سرچ کنسول، دکمه Export و گزینه Download CSV یا Download Excel را بزنید و همان فایل را بارگذاری کنید.',
      422,
    );
  }

  let scope = 'site';
  let postId: string | null = null;
  const notes: string[] = [];
  if (parsed.pageFilter) {
    scope = 'page';
    postId = (await postMatcher())(parsed.pageFilter);
    if (!postId) notes.push('این خروجی روی صفحه‌ای فیلتر شده که با هیچ مقاله‌ای از وبلاگ جور نشد.');
  }

  const totals = totalsOf(parsed);
  const previous = parsed.previous ? totalsOf(parsed.previous) : null;
  const daily = parsed.daily.slice(-500);

  const row = await prisma.gscImport.create({
    data: {
      scope,
      postId,
      pageUrl: parsed.pageFilter,
      fileName: files.map((f) => f.name).join('، ').slice(0, 300),
      rangeLabel: parsed.rangeLabel?.slice(0, 120) ?? null,
      startDate: daily[0]?.key ?? null,
      endDate: daily[daily.length - 1]?.key ?? null,
      clicks: totals.clicks,
      impressions: totals.impressions,
      ctr: totals.ctr,
      position: totals.position,
      previous: previous ?? undefined,
      queries: trim(parsed.queries),
      pages: trim(parsed.pages),
      daily,
      createdById: userId,
    },
    select: SUMMARY_SELECT,
  });

  // برای هر مقاله فقط تازه‌ترین خروجی صفحه‌ای لازم است
  if (scope === 'page' && postId) {
    await prisma.gscImport.deleteMany({ where: { scope: 'page', postId, id: { not: row.id } } });
  }

  return { import: row, recognized: parsed.recognized, notes };
}

export async function listImports(): Promise<ImportSummary[]> {
  return prisma.gscImport.findMany({ select: SUMMARY_SELECT, orderBy: { createdAt: 'desc' }, take: 30 });
}

export type ImportedSite = {
  info: ImportSummary;
  totals: Metrics;
  previous: Metrics | null;
  queries: MetricRow[];
  pages: MetricRow[];
  daily: MetricRow[];
};

/** تازه‌ترین خروجی کل سایت */
export async function latestSiteImport(): Promise<ImportedSite | null> {
  const row = await prisma.gscImport.findFirst({ where: { scope: 'site' }, orderBy: { createdAt: 'desc' } });
  if (!row) return null;
  return {
    info: {
      id: row.id,
      scope: row.scope,
      fileName: row.fileName,
      rangeLabel: row.rangeLabel,
      startDate: row.startDate,
      endDate: row.endDate,
      clicks: row.clicks,
      impressions: row.impressions,
      postId: row.postId,
      pageUrl: row.pageUrl,
      createdAt: row.createdAt,
    },
    totals: { clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position },
    previous: (row.previous as Metrics | null) ?? null,
    queries: row.queries as MetricRow[],
    pages: row.pages as MetricRow[],
    daily: row.daily as MetricRow[],
  };
}

/** آمار هر مقاله از روی جدول صفحه‌های یک خروجی (چند نشانی یک مقاله جمع می‌شوند) */
export async function perPostMetrics(pages: MetricRow[]): Promise<Record<string, Metrics>> {
  const match = await postMatcher();
  const groups = new Map<string, MetricRow[]>();
  for (const page of pages) {
    const id = match(page.key);
    if (!id) continue;
    groups.set(id, [...(groups.get(id) ?? []), page]);
  }

  const out: Record<string, Metrics> = {};
  for (const [id, rows] of groups) {
    const clicks = rows.reduce((s, r) => s + r.clicks, 0);
    const impressions = rows.reduce((s, r) => s + r.impressions, 0);
    const weighted = rows.reduce((s, r) => s + r.position * r.impressions, 0);
    out[id] = {
      clicks,
      impressions,
      ctr: impressions ? clicks / impressions : 0,
      position: impressions ? weighted / impressions : rows[0].position,
    };
  }
  return out;
}

const STOP = new Set(
  'از در به با و که را برای چه چگونه چطور یک این آن تا بر های ها است هست کنیم کردن کرد کنید می ای یا هم روی بین درباره چیست چیه کدام بهترین آموزش'
    .split(' '),
);

function tokens(text: string): string[] {
  return normalizeFa(text)
    .split(/[\s\-_/،,.:؟?!()«»"]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/**
 * عبارت‌های جستجوی یک مقاله.
 * اگر مدیر خروجی فیلترشده روی همان مقاله را بارگذاری کرده باشد، عبارت‌های
 * واقعی آن صفحه؛ وگرنه عبارت‌هایی از خروجی کل سایت که با عنوان و کلیدواژه
 * مقاله هم‌پوشانی دارند (تقریبی، و همین‌طور هم برچسب می‌خورد).
 */
export async function postQueries(post: {
  id: string;
  title: string;
  focusKeyword: string | null;
}): Promise<{ source: 'page' | 'related'; queries: MetricRow[]; rangeLabel: string | null } | null> {
  const page = await prisma.gscImport.findFirst({
    where: { scope: 'page', postId: post.id },
    orderBy: { createdAt: 'desc' },
    select: { queries: true, rangeLabel: true },
  });
  if (page && (page.queries as MetricRow[]).length) {
    return { source: 'page', queries: (page.queries as MetricRow[]).slice(0, 40), rangeLabel: page.rangeLabel };
  }

  const site = await prisma.gscImport.findFirst({
    where: { scope: 'site' },
    orderBy: { createdAt: 'desc' },
    select: { queries: true, rangeLabel: true },
  });
  if (!site) return null;

  const own = new Set(tokens(`${post.title} ${post.focusKeyword ?? ''}`));
  const focus = normalizeFa(post.focusKeyword ?? '');
  const related = (site.queries as MetricRow[]).filter((q) => {
    const norm = normalizeFa(q.key);
    if (focus && (norm.includes(focus) || focus.includes(norm))) return true;
    const words = tokens(q.key);
    const shared = words.filter((w) => own.has(w)).length;
    return shared >= 2 || (shared === 1 && words.length === 1 && words[0].length >= 4);
  });

  return related.length ? { source: 'related', queries: related.slice(0, 25), rangeLabel: site.rangeLabel } : null;
}

/** آمار یک مقاله از تازه‌ترین خروجی (صفحه‌ای یا کل سایت) */
export async function importedPostTotals(postId: string): Promise<Metrics | null> {
  const page = await prisma.gscImport.findFirst({
    where: { scope: 'page', postId },
    orderBy: { createdAt: 'desc' },
    select: { clicks: true, impressions: true, ctr: true, position: true },
  });
  if (page && page.impressions) return page;

  const site = await latestSiteImport();
  if (!site) return null;
  return (await perPostMetrics(site.pages))[postId] ?? null;
}
