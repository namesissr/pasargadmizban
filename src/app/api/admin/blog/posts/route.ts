import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, parseBody, parseQuery, pagination, paged, route } from '@/lib/api';
import { requireAdmin, requireStaff, clientIp, assertSameOrigin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { postInputSchema, buildPostData, syncTags } from '@/lib/blog-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  status: z.enum(['ALL', 'DRAFT', 'SCHEDULED', 'PUBLISHED']).optional().default('ALL'),
  q: z.string().trim().max(120).optional(),
  categoryId: z.string().trim().max(40).optional(),
  page: z.string().optional(),
  perPage: z.string().optional(),
});

/** فهرست مقاله‌ها برای پنل مدیریت (پیش‌نویس‌ها هم دیده می‌شوند) */
export const GET = route(async (req: Request) => {
  await requireStaff();
  const { status, q, categoryId } = parseQuery(req, querySchema);
  const { page, perPage, skip, take } = pagination(req, { page: 1, perPage: 20, maxPerPage: 100 });

  const where: Record<string, unknown> = {};
  if (status !== 'ALL') where.status = status;
  if (categoryId) where.categoryId = categoryId;
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { slug: { contains: q, mode: 'insensitive' } },
      { focusKeyword: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [items, total, counts] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      skip,
      take,
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        publishedAt: true,
        updatedAt: true,
        featured: true,
        noindex: true,
        views: true,
        seoScore: true,
        wordCount: true,
        readingMinutes: true,
        focusKeyword: true,
        category: { select: { id: true, name: true } },
        tags: { select: { tag: { select: { slug: true, name: true } } } },
      },
    }),
    prisma.blogPost.count({ where }),
    prisma.blogPost.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const stats = {
    all: counts.reduce((sum, c) => sum + c._count._all, 0),
    draft: counts.find((c) => c.status === 'DRAFT')?._count._all ?? 0,
    scheduled: counts.find((c) => c.status === 'SCHEDULED')?._count._all ?? 0,
    published: counts.find((c) => c.status === 'PUBLISHED')?._count._all ?? 0,
  };

  return ok({ ...paged(items, total, page, perPage), stats });
});

/** ساخت مقاله تازه */
export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const input = await parseBody(req, postInputSchema);

  const { data, report } = await buildPostData(input);

  const post = await prisma.blogPost.create({
    data: { ...data, authorId: admin.id, authorName: data.authorName ?? null },
    select: { id: true, slug: true, title: true, status: true },
  });

  await syncTags(post.id, input.tags);

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.blog_post_create',
    entity: 'blog_post',
    entityId: post.id,
    ip: await clientIp(),
    meta: { title: post.title, slug: post.slug, status: post.status, seoScore: report.score },
  });

  return ok({ post, seo: report, message: 'مقاله ساخته شد.' }, { status: 201 });
});
