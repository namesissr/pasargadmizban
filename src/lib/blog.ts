import type { Prisma } from '@prisma/client';
import prisma from './prisma';

/**
 * لایه خواندن داده‌های وبلاگ.
 *
 * یک قاعده مهم: صفحه‌های عمومی هرگز مستقیم از prisma نمی‌خوانند و همیشه از
 * این فایل رد می‌شوند، تا شرط «منتشرشده» یک‌جا تعریف شود و پیش‌نویس‌ها به
 * اشتباه جایی دیده (و توسط گوگل ایندکس) نشوند.
 */

/**
 * برچسبی که کمتر از این تعداد مقاله منتشرشده دارد، صفحه کم‌ارزشی می‌سازد:
 * نه ایندکس می‌شود و نه در نقشه سایت می‌آید.
 */
export const TAG_INDEX_THRESHOLD = 3;

/** مقاله زمان‌بندی‌شده وقتی زمانش رسید، خودکار منتشر حساب می‌شود */
export function publishedWhere(): Prisma.BlogPostWhereInput {
  return {
    status: { in: ['PUBLISHED', 'SCHEDULED'] },
    publishedAt: { not: null, lte: new Date() },
  };
}

const CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  coverImage: true,
  coverAlt: true,
  publishedAt: true,
  updatedAt: true,
  readingMinutes: true,
  views: true,
  featured: true,
  authorName: true,
  category: { select: { slug: true, name: true } },
  tags: { select: { tag: { select: { slug: true, name: true } } } },
} satisfies Prisma.BlogPostSelect;

export type PostCard = Prisma.BlogPostGetPayload<{ select: typeof CARD_SELECT }>;

export type PostFull = Prisma.BlogPostGetPayload<{
  include: {
    category: { select: { id: true; slug: true; name: true } };
    tags: { select: { tag: { select: { slug: true; name: true } } } };
  };
}>;

export type ListOptions = {
  page?: number;
  perPage?: number;
  categorySlug?: string;
  tagSlug?: string;
  q?: string;
  /** مقاله‌های ویژه بالای فهرست بیایند */
  featuredFirst?: boolean;
  /** مقاله‌هایی که جای دیگری از همان صفحه نشان داده شده‌اند */
  excludeIds?: string[];
};

export async function listPosts(opts: ListOptions = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const perPage = Math.min(48, Math.max(1, opts.perPage ?? 9));

  const where: Prisma.BlogPostWhereInput = { ...publishedWhere() };
  if (opts.categorySlug) where.category = { slug: opts.categorySlug };
  if (opts.tagSlug) where.tags = { some: { tag: { slug: opts.tagSlug } } };
  if (opts.excludeIds?.length) where.id = { notIn: opts.excludeIds };
  if (opts.q?.trim()) {
    const q = opts.q.trim();
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { excerpt: { contains: q, mode: 'insensitive' } },
      { content: { contains: q, mode: 'insensitive' } },
      { keywords: { contains: q, mode: 'insensitive' } },
    ];
  }

  const orderBy: Prisma.BlogPostOrderByWithRelationInput[] = opts.featuredFirst
    ? [{ featured: 'desc' }, { publishedAt: 'desc' }]
    : [{ publishedAt: 'desc' }];

  const [items, total] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      orderBy,
      select: CARD_SELECT,
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.blogPost.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

/** مقاله منتشرشده با اسلاگ؛ اگر نبود null */
export async function getPublishedPost(slug: string): Promise<PostFull | null> {
  return prisma.blogPost.findFirst({
    where: { slug, ...publishedWhere() },
    include: {
      category: { select: { id: true, slug: true, name: true } },
      tags: { select: { tag: { select: { slug: true, name: true } } } },
    },
  });
}

/**
 * اگر آدرس درخواستی یکی از اسلاگ‌های قدیمی باشد، اسلاگ فعلی را برمی‌گرداند
 * تا صفحه با ریدایرکت ۳۰۱ به آدرس تازه برود و رتبه حفظ شود.
 */
export async function resolveOldSlug(slug: string): Promise<string | null> {
  const row = await prisma.blogSlugHistory.findUnique({
    where: { slug },
    select: { post: { select: { slug: true, status: true, publishedAt: true } } },
  });
  if (!row?.post) return null;
  const { post } = row;
  const live = post.publishedAt && post.publishedAt <= new Date() && post.status !== 'DRAFT';
  return live ? post.slug : null;
}

/** مقاله‌های مرتبط: اول هم‌دسته، بعد هم‌برچسب — برای لینک‌دهی داخلی */
export async function relatedPosts(post: { id: string; categoryId: string | null; tags: { tag: { slug: string } }[] }, limit = 3) {
  const tagSlugs = post.tags.map((t) => t.tag.slug);

  const sameCategory = post.categoryId
    ? await prisma.blogPost.findMany({
        where: { ...publishedWhere(), id: { not: post.id }, categoryId: post.categoryId },
        orderBy: [{ publishedAt: 'desc' }],
        select: CARD_SELECT,
        take: limit,
      })
    : [];

  if (sameCategory.length >= limit) return sameCategory;

  const exclude = [post.id, ...sameCategory.map((p) => p.id)];
  const byTag = tagSlugs.length
    ? await prisma.blogPost.findMany({
        where: { ...publishedWhere(), id: { notIn: exclude }, tags: { some: { tag: { slug: { in: tagSlugs } } } } },
        orderBy: [{ publishedAt: 'desc' }],
        select: CARD_SELECT,
        take: limit - sameCategory.length,
      })
    : [];

  if (sameCategory.length + byTag.length >= limit) return [...sameCategory, ...byTag];

  const filler = await prisma.blogPost.findMany({
    where: { ...publishedWhere(), id: { notIn: [...exclude, ...byTag.map((p) => p.id)] } },
    orderBy: [{ publishedAt: 'desc' }],
    select: CARD_SELECT,
    take: limit - sameCategory.length - byTag.length,
  });

  return [...sameCategory, ...byTag, ...filler];
}

/** مقاله ویژه برای بالای فهرست وبلاگ */
export async function featuredPost(): Promise<PostCard | null> {
  return prisma.blogPost.findFirst({
    where: { ...publishedWhere(), featured: true },
    orderBy: [{ publishedAt: 'desc' }],
    select: CARD_SELECT,
  });
}

export async function latestPosts(limit = 3): Promise<PostCard[]> {
  return prisma.blogPost.findMany({
    where: publishedWhere(),
    orderBy: [{ publishedAt: 'desc' }],
    select: CARD_SELECT,
    take: limit,
  });
}

export async function popularPosts(limit = 5): Promise<PostCard[]> {
  return prisma.blogPost.findMany({
    where: publishedWhere(),
    orderBy: [{ views: 'desc' }, { publishedAt: 'desc' }],
    select: CARD_SELECT,
    take: limit,
  });
}

/** دسته‌ها همراه شمار مقاله‌های منتشرشده؛ دسته خالی نمایش داده نمی‌شود */
export async function categoriesWithCounts() {
  const categories = await prisma.blogCategory.findMany({
    where: { active: true },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    select: { id: true, slug: true, name: true, description: true },
  });

  const counts = await prisma.blogPost.groupBy({
    by: ['categoryId'],
    where: publishedWhere(),
    _count: { _all: true },
  });
  const map = new Map(counts.map((c) => [c.categoryId, c._count._all]));

  return categories
    .map((c) => ({ ...c, count: map.get(c.id) ?? 0 }))
    .filter((c) => c.count > 0);
}

export async function getCategory(slug: string) {
  return prisma.blogCategory.findFirst({ where: { slug, active: true } });
}

export async function getTag(slug: string) {
  return prisma.blogTag.findUnique({ where: { slug } });
}

/** برچسب‌هایی که دست‌کم یک مقاله منتشرشده دارند */
export async function tagsWithCounts(limit = 40) {
  const rows = await prisma.blogTag.findMany({
    select: {
      slug: true,
      name: true,
      _count: { select: { posts: { where: { post: publishedWhere() } } } },
    },
    orderBy: { name: 'asc' },
  });
  return rows
    .map((t) => ({ slug: t.slug, name: t.name, count: t._count.posts }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** همه آدرس‌های وبلاگ برای نقشه سایت */
export async function sitemapEntries() {
  const [posts, categories, tags] = await Promise.all([
    prisma.blogPost.findMany({
      where: { ...publishedWhere(), noindex: false },
      select: { slug: true, updatedAt: true, publishedAt: true, coverImage: true, title: true },
      orderBy: { publishedAt: 'desc' },
    }),
    prisma.blogCategory.findMany({
      where: { active: true, posts: { some: publishedWhere() } },
      select: { slug: true, updatedAt: true },
    }),
    prisma.blogTag.findMany({
      where: { posts: { some: { post: publishedWhere() } } },
      select: {
        slug: true,
        createdAt: true,
        _count: { select: { posts: { where: { post: publishedWhere() } } } },
      },
    }),
  ]);

  // فقط آدرس‌هایی در نقشه سایت می‌آیند که واقعاً ایندکس می‌شوند
  const indexableTags = tags
    .filter((t) => t._count.posts >= TAG_INDEX_THRESHOLD)
    .map(({ slug, createdAt }) => ({ slug, createdAt }));

  return { posts, categories, tags: indexableTags };
}

/** شمار بازدید — بدون قطع شدن درخواست کاربر اگر دیتابیس کند بود */
export async function bumpViews(slug: string): Promise<void> {
  try {
    await prisma.blogPost.updateMany({ where: { slug }, data: { views: { increment: 1 } } });
  } catch {
    // شمارش بازدید حیاتی نیست؛ خطایش صفحه را خراب نمی‌کند
  }
}

export type Faq = { q: string; a: string };

/** پرسش‌های پرتکرار در ستون Json ذخیره می‌شوند؛ اینجا امن خوانده می‌شوند */
export function parseFaqs(value: unknown): Faq[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const q = typeof row.q === 'string' ? row.q.trim() : '';
      const a = typeof row.a === 'string' ? row.a.trim() : '';
      return q && a ? { q, a } : null;
    })
    .filter((f): f is Faq => f !== null)
    .slice(0, 20);
}
