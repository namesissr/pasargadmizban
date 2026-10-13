import { notFound } from 'next/navigation';
import { categoriesWithCounts } from '@/lib/blog';
import { siteInfo, organizationSchema, websiteSchema, jsonLdGraph } from '@/lib/seo';
import { BlogHeader, BlogFooter } from '@/components/blog/chrome';
import { JsonLd } from '@/components/blog/json-ld';
import { BrandStyle } from '@/components/site/brand-style';

/**
 * پوسته صفحه‌های عمومی وبلاگ.
 *
 * داده ساخت‌یافته سازمان و سایت یک‌بار همین‌جا می‌آید تا در همه صفحه‌های
 * وبلاگ حاضر باشد و شناسه‌های @id آن، مرجع شِمای مقاله‌ها شود.
 */
export default async function BlogLayout({ children }: { children: React.ReactNode }) {
  const [site, categories] = await Promise.all([siteInfo(), categoriesWithCounts().catch(() => [])]);

  // اگر مدیر وبلاگ را خاموش کرده باشد، صفحه‌ها در دسترس نیستند
  if (!site.enabled) notFound();

  return (
    <div className="min-h-screen">
      <BrandStyle color={site.brandColor} />
      <JsonLd json={jsonLdGraph([organizationSchema(site), websiteSchema(site)])} />
      <BlogHeader site={site} categories={categories} />
      {children}
      <BlogFooter site={site} categories={categories} />
    </div>
  );
}
