import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireAdmin, requireStaff, clientIp, assertSameOrigin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { postInputSchema, buildPostData, syncTags, recordSlugChange } from '@/lib/blog-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

async function find(id: string) {
  const post = await prisma.blogPost.findUnique({
    where: { id },
    include: { tags: { select: { tag: { select: { name: true } } } } },
  });
  if (!post) throw new ApiError('مقاله یافت نشد.', 404);
  return post;
}

/** صفحه‌های کش‌شده وبلاگ پس از هر تغییر تازه می‌شوند */
function refreshBlogCache(slug: string, previousSlug?: string) {
  revalidatePath('/blog');
  revalidatePath('/');
  revalidatePath(`/blog/${slug}`);
  if (previousSlug && previousSlug !== slug) revalidatePath(`/blog/${previousSlug}`);
}

/** یک مقاله با همه فیلدهای سئو، برای ویرایشگر */
export const GET = route(async (_req: Request, ctx: Ctx) => {
  await requireStaff();
  const { id } = await ctx.params;
  const post = await find(id);

  return ok({
    post: {
      ...post,
      tags: post.tags.map((t) => t.tag.name),
    },
  });
});

/** ویرایش مقاله */
export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const existing = await find(id);

  const input = await parseBody(req, postInputSchema);
  const { data, report } = await buildPostData(input, id);

  await recordSlugChange(id, existing.slug, data.slug);

  const post = await prisma.blogPost.update({
    where: { id },
    data,
    select: { id: true, slug: true, title: true, status: true, publishedAt: true },
  });

  await syncTags(id, input.tags);
  refreshBlogCache(post.slug, existing.slug);

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.blog_post_update',
    entity: 'blog_post',
    entityId: id,
    ip: await clientIp(),
    meta: {
      title: post.title,
      slug: post.slug,
      slugChanged: existing.slug !== post.slug ? { from: existing.slug, to: post.slug } : undefined,
      status: post.status,
      seoScore: report.score,
    },
  });

  return ok({ post, seo: report, message: 'تغییرات ذخیره شد.' });
});

/** حذف مقاله — آدرس‌های قدیمی هم با آن پاک می‌شوند */
export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const post = await find(id);

  await prisma.blogPost.delete({ where: { id } });

  // برچسب‌هایی که دیگر هیچ مقاله‌ای ندارند، در فهرست‌ها زباله می‌شوند
  await prisma.blogTag.deleteMany({ where: { posts: { none: {} } } });

  refreshBlogCache(post.slug);

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.blog_post_delete',
    entity: 'blog_post',
    entityId: id,
    ip: await clientIp(),
    meta: { title: post.title, slug: post.slug },
  });

  return ok({ message: 'مقاله حذف شد.' });
});
