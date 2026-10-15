import prisma from '@/lib/prisma';
import { ok, parseBody, route } from '@/lib/api';
import { requireAdmin, requireStaff, clientIp, assertSameOrigin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { uniqueSlug } from '@/lib/slugify';
import { categorySchema } from '@/lib/blog-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** فهرست دسته‌ها با شمار مقاله */
export const GET = route(async () => {
  await requireStaff();
  const items = await prisma.blogCategory.findMany({
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { posts: true } } },
  });
  return ok({ items: items.map(({ _count, ...c }) => ({ ...c, postCount: _count.posts })) });
});

export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const input = await parseBody(req, categorySchema);

  const slug = await uniqueSlug(input.slug || input.name, async (s) =>
    Boolean(await prisma.blogCategory.findUnique({ where: { slug: s }, select: { id: true } })),
  'category');

  const category = await prisma.blogCategory.create({
    data: {
      name: input.name,
      slug,
      description: input.description?.trim() || null,
      metaTitle: input.metaTitle?.trim() || null,
      metaDescription: input.metaDescription?.trim() || null,
      coverImage: input.coverImage?.trim() || null,
      order: input.order ?? 0,
      active: input.active ?? true,
    },
  });

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.blog_category_create',
    entity: 'blog_category',
    entityId: category.id,
    ip: await clientIp(),
    meta: { name: category.name, slug: category.slug },
  });

  return ok({ category, message: 'دسته ساخته شد.' }, { status: 201 });
});
