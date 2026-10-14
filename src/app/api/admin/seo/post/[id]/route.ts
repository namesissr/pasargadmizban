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

  if (!gscConfigured()) {
    // بدون API، از تازه‌ترین خروجی بارگذاری‌شده سرچ کنسول
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
      error: 'وضعیت ایندکس فقط از خود سرچ کنسول (دکمه «بررسی در سرچ کنسول») دیده می‌شود.',
    });
  }

  // بررسی وضعیت ایندکس سهمیه روزانه دارد، پس خطایش کل پاسخ را خراب نمی‌کند
  const [performance, index] = await Promise.all([
    pagePerformance(url, 28).catch((err) => {
      throw err instanceof GscError ? new ApiError(err.message, err.status) : err;
    }),
    inspectUrl(url).catch(() => null),
  ]);

  return ok({ post, url, performance, querySource: 'api', index, error: null });
});
