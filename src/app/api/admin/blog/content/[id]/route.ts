import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireAdmin, clientIp, assertSameOrigin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { submitToIndexNow } from '@/lib/indexnow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({ action: z.enum(['publish', 'reject']) });

/** تأیید و انتشار یا رد مقاله‌ای که خودکار ساخته شده است */
export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const { action } = await parseBody(req, patchSchema);

  const job = await prisma.contentJob.findUnique({
    where: { id },
    select: { id: true, keyword: true, postId: true, post: { select: { slug: true, status: true } } },
  });
  if (!job) throw new ApiError('این مورد یافت نشد.', 404);

  if (action === 'publish') {
    if (!job.postId) throw new ApiError('این مورد مقاله‌ای ندارد که منتشر شود.', 422);

    const post = await prisma.blogPost.update({
      where: { id: job.postId },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
      select: { slug: true },
    });
    await prisma.contentJob.update({ where: { id }, data: { status: 'PUBLISHED' } });

    revalidatePath('/blog');
    revalidatePath('/');
    revalidatePath(`/blog/${post.slug}`);
    await submitToIndexNow([`/blog/${post.slug}`, '/blog']);

    await audit({
      userId: admin.id,
      actorType: 'admin',
      action: 'admin.content_approve',
      entity: 'blog_post',
      entityId: job.postId,
      ip: await clientIp(),
      meta: { keyword: job.keyword, slug: post.slug },
    });

    return ok({ message: 'مقاله منتشر شد.' });
  }

  // رد کردن: مقاله ساخته‌شده حذف و موضوع به عنوان رد‌شده ثبت می‌شود
  if (job.postId) {
    await prisma.blogPost.delete({ where: { id: job.postId } }).catch(() => null);
    await prisma.blogTag.deleteMany({ where: { posts: { none: {} } } });
  }
  await prisma.contentJob.update({
    where: { id },
    data: { status: 'REJECTED', postId: null, error: 'مدیر این مقاله را رد کرد.' },
  });
  revalidatePath('/blog');

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.content_reject',
    entity: 'content_job',
    entityId: id,
    ip: await clientIp(),
    meta: { keyword: job.keyword },
  });

  return ok({ message: 'مقاله رد و حذف شد؛ این موضوع دوباره انتخاب نمی‌شود.' });
});

/** حذف ردیف صف — موضوع آزاد می‌شود و می‌تواند دوباره انتخاب شود */
export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  const job = await prisma.contentJob.findUnique({ where: { id }, select: { keyword: true } });
  if (!job) throw new ApiError('این مورد یافت نشد.', 404);

  await prisma.contentJob.delete({ where: { id } });

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.content_delete',
    entity: 'content_job',
    entityId: id,
    ip: await clientIp(),
    meta: { keyword: job.keyword },
  });

  return ok({ message: 'از صف حذف شد.' });
});
