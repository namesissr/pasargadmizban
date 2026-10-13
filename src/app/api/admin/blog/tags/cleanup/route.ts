import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { ok, route } from '@/lib/api';
import { requireAdmin, clientIp, assertSameOrigin } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * پاکسازی برچسب‌های بی‌مقاله.
 *
 * صفحه برچسبِ بی‌مقاله، یک صفحه خالی در sitemap است؛ گوگل آن را «محتوای
 * نازک» حساب می‌کند و اعتبار کل سایت را پایین می‌آورد.
 */
export const POST = route(async () => {
  await assertSameOrigin();
  const admin = await requireAdmin();

  const orphans = await prisma.blogTag.findMany({
    where: { posts: { none: {} } },
    select: { id: true, name: true },
  });

  if (!orphans.length) return ok({ removed: 0, message: 'برچسب بی‌مقاله‌ای نبود.' });

  await prisma.blogTag.deleteMany({ where: { id: { in: orphans.map((t) => t.id) } } });
  revalidatePath('/blog');

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.blog_tag_cleanup',
    entity: 'blog_tag',
    ip: await clientIp(),
    meta: { removed: orphans.length, names: orphans.slice(0, 20).map((t) => t.name) },
  });

  return ok({
    removed: orphans.length,
    message: `${new Intl.NumberFormat('fa-IR').format(orphans.length)} برچسب بی‌مقاله حذف شد.`,
  });
});
