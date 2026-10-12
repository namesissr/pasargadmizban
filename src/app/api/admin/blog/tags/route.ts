import prisma from '@/lib/prisma';
import { ok, route } from '@/lib/api';
import { requireStaff } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** برچسب‌های موجود — ویرایشگر برای پیشنهاد خودکار از این فهرست می‌خواند */
export const GET = route(async () => {
  await requireStaff();
  const items = await prisma.blogTag.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, slug: true, name: true, _count: { select: { posts: true } } },
    take: 300,
  });
  return ok({ items: items.map(({ _count, ...t }) => ({ ...t, postCount: _count.posts })) });
});
