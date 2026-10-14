import type { Metadata } from 'next';
import Link from 'next/link';
import { siteInfo, buildMetadata, breadcrumbSchema, itemListSchema, webPageSchema, jsonLdGraph } from '@/lib/seo';
import { TOOLS } from '@/lib/tools/registry';
import { JsonLd } from '@/components/blog/json-ld';
import { ToolGrid } from '@/components/tools/catalog';

export const dynamic = 'force-dynamic';

const TITLE = 'ابزارهای رایگان شبکه و سرور';
const DESCRIPTION =
  'ابزارهای رایگان برای مدیران سرور و سایت: تست دسترسی آی‌پی از ایران، آی‌پی من، بررسی DNS و SSL، سرعت پاسخ سایت، محاسبه‌گر ساب‌نت و ساخت رمز قوی.';

export async function generateMetadata(): Promise<Metadata> {
  const site = await siteInfo();
  return buildMetadata({ site, title: TITLE, description: DESCRIPTION, path: '/tools' });
}

export default async function ToolsIndexPage() {
  const site = await siteInfo();
  const jsonLd = jsonLdGraph([
    webPageSchema(site, { path: '/tools', name: TITLE, description: DESCRIPTION }),
    breadcrumbSchema(site, [
      { name: 'خانه', path: '/' },
      { name: 'ابزارها', path: '/tools' },
    ]),
    itemListSchema(
      site,
      TOOLS.map((t) => ({ title: t.name, path: `/tools/${t.slug}` })),
    ),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <JsonLd json={jsonLd} />
      <nav aria-label="مسیر" className="mb-4 text-[11px] muted">
        <Link href="/" className="hover:underline">
          خانه
        </Link>{' '}
        / ابزارها
      </nav>
      <div className="mb-7 text-center">
        <h1 className="text-xl font-extrabold sm:text-2xl">{TITLE}</h1>
        <p className="mx-auto mt-2.5 max-w-2xl text-xs leading-7 muted">
          ابزارهای شبکه از روی سروری داخل ایران اجرا می‌شوند؛ یعنی نتیجه همان چیزی است که کاربران ایرانی می‌بینند. رایگان و
          بدون ثبت‌نام.
        </p>
      </div>
      <ToolGrid />
    </main>
  );
}
