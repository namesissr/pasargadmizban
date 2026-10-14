import { ok, route } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { auditSite, postSeoRows } from '@/lib/seo-audit';
import { gscConfigured, sitePerformance, allPagesPerformance, GscError } from '@/lib/gsc';
import { latestSiteImport, perPostMetrics } from '@/lib/gsc-import/store';
import { findOpportunities, nearQueries } from '@/lib/seo-opportunities';
import { absoluteUrl } from '@/lib/seo';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Totals = { clicks: number; impressions: number; ctr: number; position: number };
type SearchRow = Totals & { keys: string[] };

/**
 * داشبورد سئو: سلامت درون‌سایتی + آمار واقعی گوگل.
 *
 * آمار گوگل از یکی از دو راه می‌آید: API سرچ کنسول (اگر وصل باشد و کار کند)
 * یا تازه‌ترین فایل خروجی‌ای که مدیر از خود سرچ کنسول بارگذاری کرده است.
 * نبودن هر دو خطا نیست؛ فقط بخش آمار خالی می‌ماند.
 */
export const GET = route(async () => {
  await requireStaff();

  const [settings, health, rows] = await Promise.all([getSettings(), auditSite(), postSeoRows()]);
  const siteUrl = (settings.siteUrl || env.appUrl).replace(/\/+$/, '');

  let search: {
    range: { start: string; end: string; label?: string | null };
    current: Totals;
    previous: Totals | null;
    topQueries: SearchRow[];
    topPages: SearchRow[];
    daily: SearchRow[];
  } | null = null;
  let perPage: Record<string, Totals> = {};
  let gscError: string | null = null;
  let source: 'api' | 'import' | null = null;
  let queriesForNear: SearchRow[] = [];

  if (gscConfigured()) {
    try {
      const [site, pages] = await Promise.all([sitePerformance(28), allPagesPerformance(28)]);
      search = site;
      source = 'api';
      queriesForNear = site.topQueries;
      // آمار هر مقاله را با نشانی کاملش تطبیق می‌دهیم
      for (const row of rows) {
        const url = absoluteUrl(siteUrl, `/blog/${row.slug}`).replace(/\/$/, '');
        const found = pages.get(url);
        if (found) perPage[row.id] = found;
      }
    } catch (err) {
      gscError = err instanceof GscError ? err.message : 'خواندن آمار سرچ کنسول ناموفق بود.';
      perPage = {};
    }
  }

  const imported = source ? null : await latestSiteImport();
  if (imported) {
    const asRow = (r: { key: string } & Totals): SearchRow => ({
      keys: [r.key],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    });
    source = 'import';
    search = {
      range: {
        start: imported.info.startDate ?? '',
        end: imported.info.endDate ?? '',
        label: imported.info.rangeLabel,
      },
      current: imported.totals,
      previous: imported.previous,
      topQueries: imported.queries.slice(0, 50).map(asRow),
      topPages: imported.pages.slice(0, 50).map(asRow),
      daily: imported.daily.map(asRow),
    };
    queriesForNear = imported.queries.map(asRow);
    perPage = await perPostMetrics(imported.pages);
  }

  return ok({
    health,
    posts: rows,
    search,
    perPage,
    source,
    importInfo: imported?.info ?? null,
    opportunities: findOpportunities(rows, perPage),
    nearQueries: nearQueries(queriesForNear),
    gsc: { configured: gscConfigured(), property: env.gsc.siteUrl || null, error: gscError },
    site: {
      siteUrl,
      sitemap: absoluteUrl(siteUrl, '/sitemap.xml'),
      robots: absoluteUrl(siteUrl, '/robots.txt'),
      rss: absoluteUrl(siteUrl, '/blog/rss.xml'),
      indexNowKeyFile: absoluteUrl(siteUrl, '/indexnow.txt'),
    },
  });
});
