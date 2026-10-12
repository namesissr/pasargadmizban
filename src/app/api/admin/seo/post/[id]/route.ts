import prisma from '@/lib/prisma';
import { ok, route, ApiError } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { absoluteUrl } from '@/lib/seo';
import { gscConfigured, pagePerformance, inspectUrl, GscError } from '@/lib/gsc';
import { env } from '@/lib/env';

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
    select: { id: true, slug: true, title: true, views: true, seoScore: true, noindex: true },
  });
  if (!post) throw new ApiError('مقاله یافت نشد.', 404);

  const settings = await getSettings();
  const siteUrl = (settings.siteUrl || env.appUrl).replace(/\/+$/, '');
  const url = absoluteUrl(siteUrl, `/blog/${post.slug}`);

  if (!gscConfigured()) {
    return ok({ post, url, performance: null, index: null, error: 'سرچ کنسول وصل نیست.' });
  }

  // بررسی وضعیت ایندکس سهمیه روزانه دارد، پس خطایش کل پاسخ را خراب نمی‌کند
  const [performance, index] = await Promise.all([
    pagePerformance(url, 28).catch((err) => {
      throw err instanceof GscError ? new ApiError(err.message, err.status) : err;
    }),
    inspectUrl(url).catch(() => null),
  ]);

  return ok({ post, url, performance, index, error: null });
});
