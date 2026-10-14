import type { MetadataRoute } from 'next';
import { socialImage } from '@/lib/images/urls';
import { sitemapEntries } from '@/lib/blog';
import { siteInfo, absoluteUrl } from '@/lib/seo';
import { TOOLS } from '@/lib/tools/registry';

/**
 * نقشه سایت — در /sitemap.xml سرو می‌شود.
 *
 * فقط صفحه‌هایی اینجا می‌آیند که واقعاً باید ایندکس شوند: صفحه اصلی،
 * ابزارهای رایگان، فهرست وبلاگ، دسته‌ها و مقاله‌های منتشرشده. صفحه‌های پنل و ورود در
 * robots هم بسته‌اند و اینجا نمی‌آیند.
 */
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = await siteInfo();
  const url = (path: string) => absoluteUrl(site.siteUrl, path);

  const base: MetadataRoute.Sitemap = [
    { url: url('/'), lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    // ابزارهای رایگان؛ مستقل از روشن بودن وبلاگ
    { url: url('/tools'), changeFrequency: 'monthly', priority: 0.8 },
    ...TOOLS.map((t) => ({ url: url(`/tools/${t.slug}`), changeFrequency: 'monthly' as const, priority: 0.8 })),
  ];

  if (!site.enabled) return base;

  const { posts, categories, tags } = await sitemapEntries().catch(() => ({
    posts: [],
    categories: [],
    tags: [],
  }));

  return [
    ...base,
    {
      url: url('/blog'),
      lastModified: posts[0]?.publishedAt ?? new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    ...categories.map((c) => ({
      url: url(`/blog/category/${c.slug}`),
      lastModified: c.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...posts.map((p) => ({
      url: url(`/blog/${p.slug}`),
      lastModified: p.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
      // تصویر شاخص در نقشه سایت، شانس دیده شدن در جستجوی تصویر گوگل را بالا می‌برد
      ...(p.coverImage ? { images: [url(socialImage(p.coverImage) ?? p.coverImage)] } : {}),
    })),
    ...tags.map((t) => ({
      url: url(`/blog/tag/${t.slug}`),
      lastModified: t.createdAt,
      changeFrequency: 'monthly' as const,
      priority: 0.4,
    })),
  ];
}
