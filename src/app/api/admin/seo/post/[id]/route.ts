import prisma from '@/lib/prisma';
import { ok, route, ApiError } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { absoluteUrl } from '@/lib/seo';
import { gscConfigured, pagePerformance, inspectUrl, GscError } from '@/lib/gsc';
import { env } from '@/lib/env';
import { importedPostTotals, postQueries } from '@/lib/gsc-import/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/** آمار گوگل و وضعیت ایندکس یک مقاله */
export const GET = route(async (_req: Request, ctx: Ctx) => {
  await requireStaff();
  const { id } = await ctx.params;

  const post = await prisma.blogPost.findUnique({
    where: { id },
    select: { id: true, slug: true, title: true, views: true, seoScore: true, noindex: true, focusKeyword: true },
  });
  if (!post) throw new ApiError('مقاله یافت نشد.', 404);

  const settings = await getSettings();
  const siteUrl = (settings.siteUrl || env.appUrl).replace(/\/+$/, '');
  const url = absoluteUrl(siteUrl, `/blog/${post.slug}`);

  /** آمار از تازه‌ترین خروجی بارگذاری‌شده سرچ کنسول */
  const fromImport = async (error: string) => {
    const [totals, queries] = await Promise.all([importedPostTotals(post.id), postQueries(post)]);
    const performance =
      totals || queries
        ? {
            totals: totals ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 },
            queries: (queries?.queries ?? []).map((q) => ({
              keys: [q.key],
              clicks: q.clicks,
              impressions: q.impressions,
              ctr: q.ctr,
              position: q.position,
            })),
          }
        : null;
    return ok({
      post,
      url,
      performance,
      querySource: queries?.source ?? null,
      index: null,
      error,
    });
  };

  const indexHint = 'وضعیت ایندکس فقط از خود سرچ کنسول (دکمه «بررسی در سرچ کنسول») دیده می‌شود.';
  if (!gscConfigured()) return fromImport(indexHint);

  // بررسی وضعیت ایندکس سهمیه روزانه دارد، پس خطایش کل پاسخ را خراب نمی‌کند
  let performance: Awaited<ReturnType<typeof pagePerformance>>;
  try {
    performance = await pagePerformance(url, 28);
  } catch (err) {
    // API تنظیم شده ولی کار نمی‌کند (مثلاً گوگل نشانی سرور را رد می‌کند): سراغ خروجی بارگذاری‌شده
    return fromImport(err instanceof GscError ? `${err.message} — آمار از خروجی بارگذاری‌شده خوانده شد.` : indexHint);
  }
  const index = await inspectUrl(url).catch(() => null);

  return ok({ post, url, performance, querySource: 'api', index, error: null });
});
