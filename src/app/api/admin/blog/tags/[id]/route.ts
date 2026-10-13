import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireAdmin, clientIp, assertSameOrigin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { slugify } from '@/lib/slugify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  slug: z.string().trim().max(80).optional(),
  description: z.string().trim().max(300).nullable().optional(),
  /** شناسه برچسب مقصد؛ این برچسب در آن ادغام و حذف می‌شود */
  mergeInto: z.string().trim().max(40).optional(),
});

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const input = await parseBody(req, patchSchema);

  const tag = await prisma.blogTag.findUnique({
    where: { id },
    select: { id: true, name: true, slug: true, posts: { select: { postId: true } } },
  });
  if (!tag) throw new ApiError('برچسب یافت نشد.', 404);

  // ── ادغام: مقاله‌های این برچسب به برچسب مقصد منتقل و خودش حذف می‌شود
  if (input.mergeInto) {
    if (input.mergeInto === id) throw new ApiError('برچسب را نمی‌توان در خودش ادغام کرد.', 422);

    const target = await prisma.blogTag.findUnique({
      where: { id: input.mergeInto },
      select: { id: true, name: true, slug: true, posts: { select: { postId: true } } },
    });
    if (!target) throw new ApiError('برچسب مقصد یافت نشد.', 404);

    const already = new Set(target.posts.map((p) => p.postId));
    const moving = tag.posts.map((p) => p.postId).filter((postId) => !already.has(postId));

    await prisma.$transaction([
      ...moving.map((postId) =>
        prisma.blogPostTag.create({ data: { postId, tagId: target.id } }),
      ),
      prisma.blogTag.delete({ where: { id } }),
    ]);

    revalidatePath('/blog');
    revalidatePath(`/blog/tag/${tag.slug}`);
    revalidatePath(`/blog/tag/${target.slug}`);

    await audit({
      userId: admin.id,
      actorType: 'admin',
      action: 'admin.blog_tag_merge',
      entity: 'blog_tag',
      entityId: id,
      ip: await clientIp(),
      meta: { from: tag.name, into: target.name, moved: moving.length },
    });

    return ok({
      message: `«${tag.name}» در «${target.name}» ادغام شد؛ ${new Intl.NumberFormat('fa-IR').format(moving.length)} مقاله منتقل شد.`,
    });
  }

  // ── ویرایش ساده
  const slug = input.slug?.trim() ? slugify(input.slug) : undefined;
  if (slug && slug !== tag.slug) {
    const taken = await prisma.blogTag.findUnique({ where: { slug }, select: { id: true } });
    if (taken) throw new ApiError('این نشانی برای برچسب دیگری ثبت شده است.', 409, { fields: { slug: 'تکراری است.' } });
  }

  const updated = await prisma.blogTag.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(slug ? { slug } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
    },
    select: { id: true, name: true, slug: true },
  });

  revalidatePath('/blog');
  revalidatePath(`/blog/tag/${tag.slug}`);
  if (updated.slug !== tag.slug) revalidatePath(`/blog/tag/${updated.slug}`);

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.blog_tag_update',
    entity: 'blog_tag',
    entityId: id,
    ip: await clientIp(),
    meta: { name: updated.name, slug: updated.slug },
  });

  return ok({ tag: updated, message: 'برچسب به‌روزرسانی شد.' });
});

/** حذف برچسب — مقاله‌ها دست‌نخورده می‌مانند و فقط این برچسب را از دست می‌دهند */
export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  const tag = await prisma.blogTag.findUnique({ where: { id }, select: { name: true, slug: true } });
  if (!tag) throw new ApiError('برچسب یافت نشد.', 404);

  await prisma.blogTag.delete({ where: { id } });
  revalidatePath('/blog');
  revalidatePath(`/blog/tag/${tag.slug}`);

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.blog_tag_delete',
    entity: 'blog_tag',
    entityId: id,
    ip: await clientIp(),
    meta: { name: tag.name, slug: tag.slug },
  });

  return ok({ message: 'برچسب حذف شد.' });
});
