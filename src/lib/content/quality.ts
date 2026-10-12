import prisma from '../prisma';
import { renderMarkdown } from '../markdown';
import { seoReport, normalizeFa } from '../seo-score';
import type { SourceResult } from './research';
import type { GeneratedArticle } from './writer';

/**
 * دروازه کیفیت و اصالت.
 *
 * هیچ مقاله‌ای بدون گذراندن این بررسی‌ها منتشر نمی‌شود. دلیلش ساده است:
 * یک مقاله ضعیف یا شبیه به متن سایت دیگر، نه‌تنها رتبه نمی‌گیرد، اعتبار کل
 * دامنه را هم پایین می‌آورد. بهتر است خط تولید چیزی نسازد تا اینکه چیز بدی
 * منتشر کند.
 */

/** عدد فارسی برای پیام‌هایی که در پنل دیده می‌شوند */
const fa = (n: number) => new Intl.NumberFormat('fa-IR').format(n);

export type QualityVerdict = {
  ok: boolean;
  reasons: string[];
  seoScore: number;
  wordCount: number;
  internalLinks: number;
  /** بیشترین شباهت با مقاله‌های موجود، بین ۰ تا ۱ */
  maxSimilarity: number;
};

/** مجموعه «شینگل»های متن: دنباله‌های n کلمه‌ای، برای سنجش شباهت */
function shingles(text: string, size = 5): Set<string> {
  const words = normalizeFa(text).split(/\s+/).filter(Boolean);
  const set = new Set<string>();
  for (let i = 0; i + size <= words.length; i++) {
    set.add(words.slice(i, i + size).join(' '));
  }
  return set;
}

/** نسبت اشتراک دو متن (ژاکارد روی شینگل‌ها) */
function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared++;
  return shared / Math.min(a.size, b.size);
}

/** آیا جمله‌ای از خلاصه نتایج گوگل عیناً در متن آمده است؟ */
function copiesSource(text: string, sources: SourceResult[]): string | null {
  const body = shingles(text, 8);
  for (const source of sources) {
    if (!source.snippet || source.snippet.length < 60) continue;
    const snippet = shingles(source.snippet, 8);
    for (const item of snippet) {
      if (body.has(item)) return source.url;
    }
  }
  return null;
}

export async function checkArticle(input: {
  article: GeneratedArticle;
  keyword: string;
  sources: SourceResult[];
  minSeoScore: number;
  minWords: number;
}): Promise<QualityVerdict> {
  const { article, keyword, sources, minSeoScore, minWords } = input;
  const reasons: string[] = [];

  const rendered = renderMarkdown(article.content);
  const internalLinks = rendered.links.filter((l) => !l.external).length;

  // ── طول و ساختار ──
  if (rendered.wordCount < minWords) {
    reasons.push(`متن ${fa(rendered.wordCount)} کلمه است و از حد تعیین‌شده (${fa(minWords)}) کوتاه‌تر است.`);
  }
  const h2 = rendered.toc.filter((t) => t.level === 2).length;
  if (h2 < 3) reasons.push(`مقاله فقط ${fa(h2)} سرفصل دارد؛ دست‌کم ۳ سرفصل لازم است.`);
  if (internalLinks < 2) reasons.push(`تعداد لینک داخلی ${fa(internalLinks)} است؛ دست‌کم ۲ لینک لازم است.`);
  if (/^#\s/m.test(article.content)) reasons.push('متن تیتر سطح یک دارد؛ این تیتر مخصوص عنوان صفحه است.');

  // ── سئو ──
  const report = seoReport({
    title: article.title,
    metaTitle: article.metaTitle,
    metaDescription: article.metaDescription,
    slug: article.slug,
    excerpt: article.excerpt,
    focusKeyword: keyword,
    content: article.content,
    coverAlt: article.coverAlt,
    faqs: article.faqs,
    categoryId: article.categorySlug ?? null,
    tags: article.tags,
  });
  if (report.score < minSeoScore) {
    reasons.push(`امتیاز سئو ${fa(report.score)} است و از حد تعیین‌شده (${fa(minSeoScore)}) کمتر است.`);
  }

  // ── اصالت ──
  const copied = copiesSource(rendered.text, sources);
  if (copied) reasons.push(`جمله‌ای عیناً شبیه خلاصه نتیجه گوگل است (${copied}).`);

  const existing = await prisma.blogPost.findMany({
    select: { title: true, content: true },
    orderBy: { createdAt: 'desc' },
    take: 60,
  });

  const bodyShingles = shingles(rendered.text, 5);
  let maxSimilarity = 0;
  let similarTitle = '';
  for (const post of existing) {
    const ratio = similarity(bodyShingles, shingles(renderMarkdown(post.content).text, 5));
    if (ratio > maxSimilarity) {
      maxSimilarity = ratio;
      similarTitle = post.title;
    }
  }
  if (maxSimilarity > 0.2) {
    reasons.push(
      `شباهت متن با مقاله «${similarTitle}» ${fa(Math.round(maxSimilarity * 100))}٪ است؛ محتوای تکراری منتشر نمی‌کنیم.`,
    );
  }

  return {
    ok: reasons.length === 0,
    reasons,
    seoScore: report.score,
    wordCount: rendered.wordCount,
    internalLinks,
    maxSimilarity: Number(maxSimilarity.toFixed(3)),
  };
}
