import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireAdmin, clientIp, assertSameOrigin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { submitToIndexNow } from '@/lib/indexnow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bulkSchema = z.object({
  ids: z.array(z.string().trim().min(1).max(40)).min(1, 'هیچ مقاله‌ای انتخاب نشده است.').max(100),
  action: z.enum([
    'publish',
    'draft',
    'feature',
    'unfeature',
    'noindex',
    'index',
    'category',
    'delete',
  ]),
  /** برای action=category — خالی یعنی «بی‌دسته» */
  categoryId: z.string().trim().max(40).nullable().optional(),
});

const ACTION_FA: Record<z.infer<typeof bulkSchema>['action'], string> = {
  publish: 'منتشر شد',
  draft: 'به پیش‌نویس برگشت',
  feature: 'ویژه شد',
  unfeature: 'از حالت ویژه درآمد',
  noindex: 'از ایندکس گوگل خارج شد',
  index: 'به ایندکس گوگل برگشت',
  category: 'جابه‌جا شد',
  delete: 'حذف شد',
};

/**
 * عملیات گروهی روی مقاله‌ها.
 *
 * وقتی چهل مقاله دارید، باز کردن یکی‌یکی‌شان برای عوض کردن دسته یا خارج
 * کردن از ایندکس، کار نیم‌ساعته است؛ اینجا یک کلیک.
 */
export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { ids, action, categoryId } = await parseBody(req, bulkSchema);

  const posts = await prisma.blogPost.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true, title: true, status: true, publishedAt: true },
  });
  if (!posts.length) throw new ApiError('مقاله‌ای با این شناسه‌ها پیدا نشد.', 404);

  if (action === 'category' && categoryId) {
    const exists = await prisma.blogCategory.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!exists) throw new ApiError('دسته انتخاب‌شده وجود ندارد.', 422);
  }

  const targetIds = posts.map((p) => p.id);
  const now = new Date();

  if (action === 'delete') {
    await prisma.blogPost.deleteMany({ where: { id: { in: targetIds } } });
    // برچسب‌هایی که با حذف مقاله بی‌صاحب شدند، صفحه خالی در سایت می‌سازند
    await prisma.blogTag.deleteMany({ where: { posts: { none: {} } } });
  } else {
    const data: Record<string, unknown> =
      action === 'publish'
        ? { status: 'PUBLISHED' }
        : action === 'draft'
          ? { status: 'DRAFT' }
          : action === 'feature'
            ? { featured: true }
            : action === 'unfeature'
              ? { featured: false }
              : action === 'noindex'
                ? { noindex: true }
                : action === 'index'
                  ? { noindex: false }
                  : { categoryId: categoryId || null };

    await prisma.blogPost.updateMany({ where: { id: { in: targetIds } }, data });

    // مقاله‌ای که تازه منتشر می‌شود و زمان انتشار ندارد، باید تاریخ بگیرد
    if (action === 'publish') {
      const missing = posts.filter((p) => !p.publishedAt).map((p) => p.id);
      if (missing.length) {
        await prisma.blogPost.updateMany({ where: { id: { in: missing } }, data: { publishedAt: now } });
      }
    }
  }

  revalidatePath('/blog');
  revalidatePath('/');
  for (const post of posts) revalidatePath(`/blog/${post.slug}`);

  if (action === 'publish') {
    await submitToIndexNow(['/blog', ...posts.map((p) => `/blog/${p.slug}`)]);
  }

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.blog_bulk',
    entity: 'blog_post',
    ip: await clientIp(),
    meta: {
      bulkAction: action,
      count: posts.length,
      categoryId: categoryId ?? null,
      titles: posts.slice(0, 20).map((p) => p.title),
    },
  });

  return ok({
    count: posts.length,
    message: `${new Intl.NumberFormat('fa-IR').format(posts.length)} مقاله ${ACTION_FA[action]}.`,
  });
});
