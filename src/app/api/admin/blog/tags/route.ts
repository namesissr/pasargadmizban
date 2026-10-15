import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireAdmin, requireStaff, clientIp, assertSameOrigin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { slugify } from '@/lib/slugify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * برچسب‌ها — ویرایشگر برای پیشنهاد خودکار از این فهرست می‌خواند و صفحه
 * «برچسب‌ها» در پنل برای نام‌گذاری، ادغام و پاکسازی.
 */
export const GET = route(async () => {
  await requireStaff();
  const items = await prisma.blogTag.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      createdAt: true,
      _count: { select: { posts: true } },
    },
    take: 500,
  });
  return ok({ items: items.map(({ _count, ...t }) => ({ ...t, postCount: _count.posts })) });
});

const createSchema = z.object({
  name: z.string().trim().min(2, 'نام برچسب دست‌کم ۲ نویسه باشد.').max(60),
  slug: z.string().trim().max(80).optional(),
  description: z.string().trim().max(300).optional(),
});

/** ساخت برچسب بدون نیاز به مقاله — برای چیدن ساختار موضوعی از قبل */
export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const input = await parseBody(req, createSchema);

  const slug = slugify(input.slug?.trim() || input.name) || 'tag';
  const taken = await prisma.blogTag.findUnique({ where: { slug }, select: { id: true } });
  if (taken) throw new ApiError('برچسبی با این نشانی از قبل هست.', 409, { fields: { slug: 'تکراری است.' } });

  const tag = await prisma.blogTag.create({
    data: { name: input.name, slug, description: input.description?.trim() || null },
    select: { id: true, name: true, slug: true },
  });

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.blog_tag_create',
    entity: 'blog_tag',
    entityId: tag.id,
    ip: await clientIp(),
    meta: { name: tag.name, slug: tag.slug },
  });

  return ok({ tag, message: 'برچسب ساخته شد.' }, { status: 201 });
});
