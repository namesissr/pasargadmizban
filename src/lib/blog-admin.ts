import { z } from 'zod';
import prisma from './prisma';
import { ApiError } from './errors';
import { slugify, uniqueSlug } from './slugify';
import { renderMarkdown, autoExcerpt } from './markdown';
import { seoReport } from './seo-score';
import { siteInfo, ownHosts } from './seo';

/**
 * منطق ذخیره مقاله در یک جا.
 *
 * چند چیز را همیشه خودِ سرور حساب می‌کند و به ورودی اعتماد نمی‌کند:
 * اسلاگ یکتا، HTML محتوا، شمار کلمه، زمان مطالعه و امتیاز سئو. اینطور
 * داده‌های سئوی مقاله هر جا (پنل، اسکریپت، ایمپورت) یکسان ساخته می‌شود.
 */

export const faqSchema = z.object({
  q: z.string().trim().min(3, 'پرسش را وارد کنید.').max(300),
  a: z.string().trim().min(3, 'پاسخ را وارد کنید.').max(2000),
});

export const postInputSchema = z.object({
  title: z.string().trim().min(5, 'عنوان دست‌کم ۵ نویسه باشد.').max(200),
  slug: z.string().trim().max(200).optional(),
  excerpt: z.string().trim().max(400).optional(),
  content: z.string().min(20, 'متن مقاله خیلی کوتاه است.'),

  coverImage: z.string().trim().max(500).optional(),
  coverAlt: z.string().trim().max(300).optional(),

  metaTitle: z.string().trim().max(200).optional(),
  metaDescription: z.string().trim().max(400).optional(),
  focusKeyword: z.string().trim().max(120).optional(),
  keywords: z.string().trim().max(400).optional(),
  canonicalUrl: z.string().trim().max(500).optional(),
  ogImage: z.string().trim().max(500).optional(),
  noindex: z.boolean().optional(),
  faqs: z.array(faqSchema).max(20).optional(),

  status: z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED']).optional(),
  /** زمان انتشار؛ برای زمان‌بندی مقاله در آینده */
  publishedAt: z.string().datetime().nullable().optional(),
  featured: z.boolean().optional(),

  categoryId: z.string().trim().max(40).nullable().optional(),
  /** برچسب‌ها با نام وارد می‌شوند و در صورت نبودن ساخته می‌شوند */
  tags: z.array(z.string().trim().min(1).max(60)).max(15).optional(),

  authorName: z.string().trim().max(120).optional(),
  authorTitle: z.string().trim().max(120).optional(),
  authorBio: z.string().trim().max(600).optional(),
});

export type PostInput = z.infer<typeof postInputSchema>;

async function slugTaken(slug: string, exceptId?: string): Promise<boolean> {
  const [post, history] = await Promise.all([
    prisma.blogPost.findUnique({ where: { slug }, select: { id: true } }),
    prisma.blogSlugHistory.findUnique({ where: { slug }, select: { postId: true } }),
  ]);
  if (post && post.id !== exceptId) return true;
  if (history && history.postId !== exceptId) return true;
  return false;
}

/** داده‌های محاسبه‌شده مقاله از روی ورودی خام */
export async function buildPostData(input: PostInput, exceptId?: string) {
  const hosts = ownHosts(await siteInfo());
  const rendered = renderMarkdown(input.content, { ownHosts: hosts });
  const excerpt = input.excerpt?.trim() || autoExcerpt(input.content, 180);
  const faqs = input.faqs ?? [];

  const desiredSlug = input.slug?.trim() ? slugify(input.slug) : slugify(input.focusKeyword || input.title);
  const slug = await uniqueSlug(desiredSlug || input.title, (s) => slugTaken(s, exceptId), 'post');

  if (input.categoryId) {
    const exists = await prisma.blogCategory.findUnique({ where: { id: input.categoryId }, select: { id: true } });
    if (!exists) throw new ApiError('دسته انتخاب‌شده وجود ندارد.', 422, { fields: { categoryId: 'دسته نامعتبر است.' } });
  }

  const report = seoReport({
    title: input.title,
    metaTitle: input.metaTitle,
    metaDescription: input.metaDescription,
    slug,
    excerpt,
    focusKeyword: input.focusKeyword,
    content: input.content,
    coverImage: input.coverImage,
    coverAlt: input.coverAlt,
    faqs,
    categoryId: input.categoryId ?? null,
    tags: input.tags ?? [],
    ownHosts: hosts,
  });

  const status = input.status ?? 'DRAFT';
  // مقاله منتشرشده بدون تاریخ، همین حالا منتشر می‌شود؛ زمان‌بندی تاریخ آینده می‌گیرد
  const publishedAt =
    input.publishedAt === null
      ? null
      : input.publishedAt
        ? new Date(input.publishedAt)
        : status === 'PUBLISHED'
          ? new Date()
          : null;

  return {
    slug,
    data: {
      title: input.title.trim(),
      slug,
      excerpt,
      content: input.content,
      contentHtml: rendered.html,
      coverImage: input.coverImage?.trim() || null,
      coverAlt: input.coverAlt?.trim() || null,
      metaTitle: input.metaTitle?.trim() || null,
      metaDescription: input.metaDescription?.trim() || null,
      focusKeyword: input.focusKeyword?.trim() || null,
      keywords: input.keywords?.trim() || null,
      canonicalUrl: input.canonicalUrl?.trim() || null,
      ogImage: input.ogImage?.trim() || null,
      noindex: input.noindex ?? false,
      faqs,
      seoScore: report.score,
      status,
      publishedAt,
      featured: input.featured ?? false,
      readingMinutes: rendered.readingMinutes,
      wordCount: rendered.wordCount,
      categoryId: input.categoryId || null,
      authorName: input.authorName?.trim() || null,
      authorTitle: input.authorTitle?.trim() || null,
      authorBio: input.authorBio?.trim() || null,
    },
    report,
  };
}

/** برچسب‌ها را با نام می‌گیرد، نبودها را می‌سازد و اتصال مقاله را تازه می‌کند */
export async function syncTags(postId: string, names: string[] | undefined): Promise<void> {
  if (!names) return;

  const clean = Array.from(
    new Map(
      names
        .map((n) => n.trim())
        .filter(Boolean)
        .map((name) => [slugify(name) || name, name] as const),
    ).entries(),
  );

  // برچسب موجود را اول با نام و بعد با نشانی پیدا می‌کنیم. اگر نام برچسبی
  // در پنل عوض شده باشد (و نشانی‌اش دست‌نخورده مانده)، جستجوی فقط-با-نشانی
  // یک برچسب تکراری می‌ساخت؛ این ترتیب جلوی آن را می‌گیرد.
  const existing = await prisma.blogTag.findMany({
    where: {
      OR: [{ name: { in: clean.map(([, name]) => name) } }, { slug: { in: clean.map(([slug]) => slug) } }],
    },
    select: { id: true, name: true, slug: true },
  });
  const byName = new Map(existing.map((t) => [t.name, t]));
  const bySlug = new Map(existing.map((t) => [t.slug, t]));

  const tagIds: string[] = [];
  for (const [slug, name] of clean) {
    const found = byName.get(name) ?? bySlug.get(slug);
    if (found) {
      tagIds.push(found.id);
      continue;
    }
    const tag = await prisma.blogTag.upsert({
      where: { slug },
      create: { slug, name },
      update: {},
      select: { id: true },
    });
    tagIds.push(tag.id);
  }

  await prisma.blogPostTag.deleteMany({ where: { postId, tagId: { notIn: tagIds } } });
  for (const tagId of tagIds) {
    await prisma.blogPostTag.upsert({
      where: { postId_tagId: { postId, tagId } },
      create: { postId, tagId },
      update: {},
    });
  }
}

/**
 * اسلاگ قبلی را نگه می‌دارد تا آدرس قدیمی با ۳۰۱ به آدرس تازه برود.
 * بدون این کار، هر تغییر اسلاگ یعنی از دست دادن رتبه آن صفحه.
 */
export async function recordSlugChange(postId: string, oldSlug: string, newSlug: string): Promise<void> {
  if (!oldSlug || oldSlug === newSlug) return;
  await prisma.blogSlugHistory.upsert({
    where: { slug: oldSlug },
    create: { slug: oldSlug, postId },
    update: { postId },
  });
  // اگر آدرس تازه خودش قبلاً در تاریخچه بوده، از تاریخچه حذف می‌شود
  await prisma.blogSlugHistory.deleteMany({ where: { slug: newSlug } });
}

export const categorySchema = z.object({
  name: z.string().trim().min(2, 'نام دسته را وارد کنید.').max(80),
  slug: z.string().trim().max(120).optional(),
  description: z.string().trim().max(500).optional(),
  metaTitle: z.string().trim().max(200).optional(),
  metaDescription: z.string().trim().max(400).optional(),
  coverImage: z.string().trim().max(500).optional(),
  order: z.coerce.number().int().min(0).max(999).optional(),
  active: z.boolean().optional(),
});
