import { categoriesWithCounts } from '@/lib/blog';
import { siteInfo, organizationSchema, websiteSchema, jsonLdGraph } from '@/lib/seo';
import { BlogHeader, BlogFooter } from '@/components/blog/chrome';
import { SiteHeader, SiteFooter } from '@/components/site/chrome';
import { JsonLd } from '@/components/blog/json-ld';
import { BrandStyle } from '@/components/site/brand-style';

/** پوسته ابزارهای رایگان؛ همان سربرگ و پابرگ وبلاگ */
export default async function ToolsLayout({ children }: { children: React.ReactNode }) {
  const site = await siteInfo();
  const categories = site.enabled ? await categoriesWithCounts().catch(() => []) : [];

  return (
    <div className="min-h-screen">
      <BrandStyle color={site.brandColor} />
      <JsonLd json={jsonLdGraph([organizationSchema(site), websiteSchema(site)])} />
      {site.enabled ? <BlogHeader site={site} categories={categories} /> : <SiteHeader site={site} />}
      {children}
      {site.enabled ? <BlogFooter site={site} categories={categories} /> : <SiteFooter site={site} />}
    </div>
  );
}
