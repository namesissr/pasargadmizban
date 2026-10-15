/** نوع‌های مشترک میان صفحه‌های مدیریت وبلاگ */

export type PostStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED';

export type AdminPostRow = {
  id: string;
  slug: string;
  title: string;
  status: PostStatus;
  publishedAt: string | null;
  updatedAt: string;
  featured: boolean;
  noindex: boolean;
  views: number;
  seoScore: number;
  wordCount: number;
  readingMinutes: number;
  focusKeyword: string | null;
  category: { id: string; name: string } | null;
  tags: { tag: { slug: string; name: string } }[];
};

export type AdminCategory = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  coverImage: string | null;
  order: number;
  active: boolean;
  postCount: number;
};

export type AdminTag = { id: string; slug: string; name: string; postCount: number };

export type Faq = { q: string; a: string };

/** مقاله کامل در ویرایشگر */
export type AdminPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  coverImage: string | null;
  coverAlt: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  focusKeyword: string | null;
  keywords: string | null;
  canonicalUrl: string | null;
  ogImage: string | null;
  noindex: boolean;
  faqs: unknown;
  seoScore: number;
  status: PostStatus;
  publishedAt: string | null;
  featured: boolean;
  readingMinutes: number;
  wordCount: number;
  views: number;
  authorName: string | null;
  authorTitle: string | null;
  authorBio: string | null;
  categoryId: string | null;
  tags: string[];
};

export const STATUS_FA: Record<PostStatus, { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }> = {
  DRAFT: { label: 'پیش‌نویس', tone: 'muted' },
  SCHEDULED: { label: 'زمان‌بندی‌شده', tone: 'warn' },
  PUBLISHED: { label: 'منتشرشده', tone: 'ok' },
};

/** رنگ امتیاز سئو: زیر ۵۰ قرمز، تا ۷۵ زرد، بالاتر سبز */
export function scoreTone(score: number): 'ok' | 'warn' | 'bad' {
  return score >= 76 ? 'ok' : score >= 50 ? 'warn' : 'bad';
}
