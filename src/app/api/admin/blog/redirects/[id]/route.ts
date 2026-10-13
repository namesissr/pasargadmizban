import prisma from '@/lib/prisma';
import { ok, route, ApiError } from '@/lib/api';
import { requireAdmin, clientIp, assertSameOrigin } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * حذف ریدایرکت.
 *
 * فقط وقتی معنی دارد که مطمئن باشید هیچ لینکی از بیرون به نشانی قدیمی
 * نمانده؛ وگرنه آن لینک‌ها از این به بعد به صفحه ۴۰۴ می‌خورند.
 */
export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  const row = await prisma.blogSlugHistory.findUnique({
    where: { id },
    select: { slug: true, post: { select: { slug: true } } },
  });
  if (!row) throw new ApiError('این ریدایرکت یافت نشد.', 404);

  await prisma.blogSlugHistory.delete({ where: { id } });

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.blog_redirect_delete',
    entity: 'blog_post',
    ip: await clientIp(),
    meta: { from: row.slug, to: row.post?.slug ?? null },
  });

  return ok({ message: 'ریدایرکت حذف شد.' });
});
