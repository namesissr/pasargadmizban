import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireAdmin, requireStaff, clientIp, assertSameOrigin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { slugify } from '@/lib/slugify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ریدایرکت‌های وبلاگ.
 *
 * هر بار اسلاگ مقاله‌ای عوض می‌شود، نشانی قبلی اینجا ثبت می‌شود و سایت آن را
 * با ۳۰۸ به نشانی تازه می‌فرستد؛ اینطور رتبه گوگل و لینک‌های بیرونی از دست
 * نمی‌رود. از همین صفحه می‌توانید نشانی قدیمیِ سایت قبلی را هم دستی وصل کنید.
 */
export const GET = route(async () => {
  await requireStaff();

  const items = await prisma.blogSlugHistory.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: {
      id: true,
      slug: true,
      createdAt: true,
      post: { select: { id: true, slug: true, title: true, status: true } },
    },
  });

  return ok({ items });
});

const createSchema = z.object({
  /** نشانی قدیمی (بدون /blog/) */
  slug: z.string().trim().min(2, 'نشانی قدیمی را وارد کنید.').max(200),
  /** مقاله مقصد */
  postId: z.string().trim().min(1).max(40),
});

export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const input = await parseBody(req, createSchema);

  const slug = slugify(input.slug.replace(/^\/?(blog\/)?/, ''));
  if (!slug) throw new ApiError('نشانی قدیمی معتبر نیست.', 422, { fields: { slug: 'نشانی معتبر نیست.' } });

  const post = await prisma.blogPost.findUnique({
    where: { id: input.postId },
    select: { id: true, slug: true, title: true },
  });
  if (!post) throw new ApiError('مقاله مقصد یافت نشد.', 404);
  if (post.slug === slug) throw new ApiError('نشانی قدیمی و تازه یکی است.', 422);

  const [live, existing] = await Promise.all([
    prisma.blogPost.findUnique({ where: { slug }, select: { id: true } }),
    prisma.blogSlugHistory.findUnique({ where: { slug }, select: { id: true } }),
  ]);
  if (live) throw new ApiError('این نشانی الان متعلق به یک مقاله زنده است.', 409, { fields: { slug: 'در دسترس نیست.' } });
  if (existing) throw new ApiError('برای این نشانی از قبل ریدایرکت ثبت شده است.', 409, { fields: { slug: 'تکراری است.' } });

  const redirect = await prisma.blogSlugHistory.create({
    data: { slug, postId: post.id },
    select: { id: true, slug: true, createdAt: true },
  });

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.blog_redirect_create',
    entity: 'blog_post',
    entityId: post.id,
    ip: await clientIp(),
    meta: { from: slug, to: post.slug, title: post.title },
  });

  return ok(
    { redirect, message: `/blog/${slug} از این پس به «${post.title}» می‌رود.` },
    { status: 201 },
  );
});
