import { revalidatePath } from 'next/cache';
import prisma from '../prisma';
import { buildPostData, type PostInput } from '../blog-admin';
import { parseFaqs } from '../blog';
import { autoCoverUrl, isAutoCover, coverOptions } from './urls';
import { withAutoFigure, hasFigures } from './auto-figures';

/**
 * اعمال تصویرهای خودکار روی مقاله‌های موجود.
 *
 * - کاور: فقط مقاله‌ای که تصویر ندارد می‌گیرد. کاوری که مدیر خودش گذاشته
 *   هرگز عوض نمی‌شود؛ با «طرح تازه» فقط کاورهای خودکار طرح دیگری می‌گیرند.
 * - نمودار: فقط مقاله‌ای که هیچ نموداری ندارد، یک نمودار از ساختار خودش.
 *
 * پس از تغییر، مقاله از همان مسیر ذخیره عادی می‌گذرد تا HTML، شمار کلمه و
 * امتیاز سئو دوباره حساب شود.
 */

export type ApplyOptions = {
  covers: boolean;
  figures: boolean;
  /** طرح تازه برای کاورهای خودکار موجود (شماره طرح یکی بالا می‌رود) */
  reshuffle?: boolean;
  postIds?: string[];
  dryRun?: boolean;
};

export type ApplyResult = {
  scanned: number;
  covers: number;
  figures: number;
  unchanged: number;
  details: { id: string; title: string; cover?: string; figure?: string; note?: string }[];
};

export async function applyAutoImages(options: ApplyOptions): Promise<ApplyResult> {
  const posts = await prisma.blogPost.findMany({
    where: options.postIds?.length ? { id: { in: options.postIds } } : {},
    orderBy: { createdAt: 'asc' },
    include: {
      category: { select: { name: true } },
      tags: { select: { tag: { select: { name: true } } } },
    },
  });

  const result: ApplyResult = { scanned: posts.length, covers: 0, figures: 0, unchanged: 0, details: [] };

  for (const post of posts) {
    let content = post.content;
    let coverImage = post.coverImage;
    const detail: ApplyResult['details'][number] = { id: post.id, title: post.title };

    if (options.figures && !hasFigures(content)) {
      const auto = withAutoFigure(content);
      if (auto) {
        content = auto.content;
        detail.figure = auto.kind;
      } else {
        detail.note = 'ساختار مناسب نمودار (فهرست یا سرفصل کافی) پیدا نشد';
      }
    }

    if (options.covers) {
      if (!coverImage) {
        coverImage = autoCoverUrl(post.slug, { title: post.title, category: post.category?.name });
        detail.cover = 'تازه';
      } else if (options.reshuffle && isAutoCover(coverImage)) {
        const { variant, topic } = coverOptions(coverImage);
        coverImage = autoCoverUrl(post.slug, { title: post.title, category: post.category?.name, variant: variant + 1, topic });
        detail.cover = `طرح ${variant + 2}`;
      }
    }

    if (content === post.content && coverImage === post.coverImage) {
      result.unchanged++;
      result.details.push(detail);
      continue;
    }

    if (detail.cover) result.covers++;
    if (detail.figure) result.figures++;
    result.details.push(detail);
    if (options.dryRun) continue;

    const input: PostInput = {
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content,
      coverImage: coverImage ?? undefined,
      coverAlt: post.coverAlt ?? (coverImage ? post.title : undefined),
      metaTitle: post.metaTitle ?? undefined,
      metaDescription: post.metaDescription ?? undefined,
      focusKeyword: post.focusKeyword ?? undefined,
      keywords: post.keywords ?? undefined,
      canonicalUrl: post.canonicalUrl ?? undefined,
      ogImage: post.ogImage ?? undefined,
      noindex: post.noindex,
      faqs: parseFaqs(post.faqs),
      status: post.status,
      publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
      featured: post.featured,
      categoryId: post.categoryId,
      tags: post.tags.map((t) => t.tag.name),
      authorName: post.authorName ?? undefined,
      authorTitle: post.authorTitle ?? undefined,
      authorBio: post.authorBio ?? undefined,
    };

    const { data } = await buildPostData(input, post.id);
    await prisma.blogPost.update({
      where: { id: post.id },
      // تاریخ انتشار و نشانی دست نمی‌خورند؛ فقط متن و تصویرها
      data: {
        content: data.content,
        contentHtml: data.contentHtml,
        coverImage: data.coverImage,
        coverAlt: data.coverAlt,
        wordCount: data.wordCount,
        readingMinutes: data.readingMinutes,
        seoScore: data.seoScore,
      },
    });

    try {
      revalidatePath(`/blog/${post.slug}`);
    } catch {
      // بیرون از Next (اسکریپت خط فرمان) معنی ندارد
    }
  }

  try {
    revalidatePath('/blog');
    revalidatePath('/');
  } catch {
    // بیرون از Next
  }

  return result;
}
