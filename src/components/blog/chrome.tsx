import Link from 'next/link';
import { Search } from 'lucide-react';
import { SiteHeader, SiteFooter } from '@/components/site/chrome';

/**
 * پوسته صفحه‌های وبلاگ.
 *
 * عیناً همان سربرگ و پابرگ صفحه اصلی سایت است؛ وبلاگ فقط دو چیز به آن
 * اضافه می‌کند: کادر جستجو کنار منو و نوار دسته‌ها زیر سربرگ. پابرگ هم
 * همان پابرگ سایت است با چند لینک دسته، که برای لینک‌دهی داخلی ارزش دارد.
 */

export type NavCategory = { slug: string; name: string; count: number };

export function BlogHeader({
  brand,
  blogEnabled = true,
  categories,
  query,
}: {
  brand: string;
  blogEnabled?: boolean;
  categories: NavCategory[];
  query?: string;
}) {
  return (
    <SiteHeader
      brand={brand}
      blogEnabled={blogEnabled}
      extraNav={
        <form action="/blog" className="hidden items-center sm:flex">
          <label className="relative">
            <span className="sr-only">جستجو در وبلاگ</span>
            <Search size={14} className="absolute top-1/2 right-3 -translate-y-1/2 opacity-50" />
            <input
              type="search"
              name="q"
              defaultValue={query ?? ''}
              placeholder="جستجو در مقاله‌ها…"
              className="input h-9 w-44 pr-9 text-xs"
            />
          </label>
        </form>
      }
      below={
        categories.length > 0 ? (
          <nav aria-label="دسته‌های وبلاگ" className="border-t">
            <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 py-2 snap-x-scroll">
              {categories.map((c) => (
                <Link
                  key={c.slug}
                  href={`/blog/category/${c.slug}`}
                  className="shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold transition hover:border-[var(--color-brand-500)]"
                >
                  {c.name}
                  <span className="tabular mr-1 opacity-60">{c.count}</span>
                </Link>
              ))}
            </div>
          </nav>
        ) : null
      }
    />
  );
}

export function BlogFooter({
  brand,
  categories,
  supportEmail,
  blogEnabled = true,
}: {
  brand: string;
  categories: NavCategory[];
  supportEmail?: string;
  blogEnabled?: boolean;
}) {
  return (
    <SiteFooter
      brand={brand}
      supportEmail={supportEmail}
      blogEnabled={blogEnabled}
      links={categories.slice(0, 4).map((c) => ({ href: `/blog/category/${c.slug}`, label: c.name }))}
    />
  );
}
