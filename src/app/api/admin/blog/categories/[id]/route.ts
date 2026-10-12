import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireAdmin, clientIp, assertSameOrigin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { slugify } from '@/lib/slugify';
import { categorySchema } from '@/lib/blog-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = categorySchema.partial();

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  const existing = await prisma.blogCategory.findUnique({ where: { id } });
  if (!existing) throw new ApiError('دسته یافت نشد.', 404);

  const input = await parseBody(req, patchSchema);
  const slug = input.slug?.trim() ? slugify(input.slug) : undefined;

  if (slug && slug !== existing.slug) {
    const taken = await prisma.blogCategory.findUnique({ where: { slug }, select: { id: true } });
    if (taken) throw new ApiError('این نشانی برای دسته دیگری ثبت شده است.', 409);
  }

  const category = await prisma.blogCategory.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(slug ? { slug } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.metaTitle !== undefined ? { metaTitle: input.metaTitle?.trim() || null } : {}),
      ...(input.metaDescription !== undefined ? { metaDescription: input.metaDescription?.trim() || null } : {}),
      ...(input.coverImage !== undefined ? { coverImage: input.coverImage?.trim() || null } : {}),
      ...(input.order !== undefined ? { order: input.order } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });

  revalidatePath('/blog');
  revalidatePath(`/blog/category/${category.slug}`);

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.blog_category_update',
    entity: 'blog_category',
    entityId: id,
    ip: await clientIp(),
    meta: { name: category.name, slug: category.slug },
  });

  return ok({ category, message: 'دسته به‌روزرسانی شد.' });
});

/** حذف دسته — مقاله‌ها حذف نمی‌شوند و فقط بی‌دسته می‌مانند */
export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  const category = await prisma.blogCategory.findUnique({ where: { id } });
  if (!category) throw new ApiError('دسته یافت نشد.', 404);

  await prisma.blogCategory.delete({ where: { id } });
  revalidatePath('/blog');

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.blog_category_delete',
    entity: 'blog_category',
    entityId: id,
    ip: await clientIp(),
    meta: { name: category.name, slug: category.slug },
  });

  return ok({ message: 'دسته حذف شد.' });
});
