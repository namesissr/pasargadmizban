import { notFound } from 'next/navigation';
import { categoriesWithCounts } from '@/lib/blog';
import { siteInfo, organizationSchema, websiteSchema, jsonLdGraph } from '@/lib/seo';
import { BlogHeader, BlogFooter } from '@/components/blog/chrome';
import { JsonLd } from '@/components/blog/json-ld';

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
      <JsonLd json={jsonLdGraph([organizationSchema(site), websiteSchema(site)])} />
      <BlogHeader brand={site.brandName} categories={categories} />
      {children}
      <BlogFooter brand={site.brandName} categories={categories} supportEmail={site.supportEmail} />
    </div>
  );
}
