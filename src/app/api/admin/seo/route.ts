import { ok, route } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { auditSite, postSeoRows } from '@/lib/seo-audit';
import { gscConfigured, sitePerformance, allPagesPerformance, GscError } from '@/lib/gsc';
import { absoluteUrl } from '@/lib/seo';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * داشبورد سئو: سلامت درون‌سایتی + آمار واقعی گوگل (اگر سرچ کنسول وصل باشد).
 * اتصال نبودن سرچ کنسول خطا نیست؛ فقط بخش آمار خالی می‌ماند.
 */
export const GET = route(async () => {
  await requireStaff();

  const [settings, health, rows] = await Promise.all([getSettings(), auditSite(), postSeoRows()]);
  const siteUrl = (settings.siteUrl || env.appUrl).replace(/\/+$/, '');

  let search: Awaited<ReturnType<typeof sitePerformance>> | null = null;
  let perPage: Record<string, { clicks: number; impressions: number; ctr: number; position: number }> = {};
  let gscError: string | null = null;

  if (gscConfigured()) {
    try {
      const [site, pages] = await Promise.all([sitePerformance(28), allPagesPerformance(28)]);
      search = site;
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

  return ok({
    health,
    posts: rows,
    search,
    perPage,
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
