import Link from 'next/link';
import { Server, Search, ArrowLeft } from 'lucide-react';

/**
 * سربرگ و پابرگ صفحه‌های عمومی وبلاگ.
 *
 * پابرگ عمداً پرلینک است: صفحه‌های مهم سایت (خرید سرور، قیمت‌ها، دسته‌های
 * وبلاگ) از هر مقاله یک لینک داخلی می‌گیرند و همین، سریع‌ترین راه برای
 * شناسانده‌شدن صفحه‌های تازه به گوگل است.
 */

export type NavCategory = { slug: string; name: string; count: number };

export function BlogHeader({
  brand,
  categories,
  query,
}: {
  brand: string;
  categories: NavCategory[];
  query?: string;
}) {
  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{ background: 'color-mix(in srgb, var(--surface) 92%, transparent)', backdropFilter: 'blur(8px)' }}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2" aria-label={`صفحه اصلی ${brand}`}>
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--color-brand-600)] text-white">
            <Server size={17} />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-extrabold">{brand}</span>
            <span className="block text-[11px] muted">وبلاگ سرور و زیرساخت</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <form action="/blog" className="hidden items-center sm:flex">
            <label className="relative">
              <span className="sr-only">جستجو در وبلاگ</span>
              <Search size={14} className="absolute top-1/2 right-3 -translate-y-1/2 opacity-50" />
              <input
                type="search"
                name="q"
                defaultValue={query ?? ''}
                placeholder="جستجو در مقاله‌ها…"
                className="input h-9 w-48 pr-9 text-xs"
              />
            </label>
          </form>
          <Link href="/blog" className="btn btn-ghost btn-sm">
            وبلاگ
          </Link>
          <Link href="/register" className="btn btn-primary btn-sm">
            خرید سرور
          </Link>
        </div>
      </div>

      {categories.length > 0 ? (
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
      ) : null}
    </header>
  );
}

export function BlogFooter({
  brand,
  categories,
  supportEmail,
}: {
  brand: string;
  categories: NavCategory[];
  supportEmail?: string;
}) {
  return (
    <footer className="mt-12 border-t">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-sm font-extrabold">{brand}</p>
          <p className="mt-2 text-[11px] leading-6 muted">
            سرور ابری آلمان و فنلاند با پرداخت ریالی، تحویل خودکار زیر یک دقیقه و آی‌پی تست‌شده از ایران.
          </p>
          <Link href="/register" className="btn btn-primary btn-sm mt-3">
            ساخت سرور <ArrowLeft size={14} />
          </Link>
        </div>

        <nav aria-label="پیوندهای سایت">
          <p className="text-xs font-bold">سرویس‌ها</p>
          <ul className="mt-2 space-y-1.5 text-[11px] muted">
            <li>
              <Link href="/" className="hover:underline">
                صفحه اصلی
              </Link>
            </li>
            <li>
              <Link href="/#pricing" className="hover:underline">
                قیمت سرورها
              </Link>
            </li>
            <li>
              <Link href="/register" className="hover:underline">
                ثبت‌نام رایگان
              </Link>
            </li>
            <li>
              <Link href="/login" className="hover:underline">
                ورود به پنل
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="دسته‌های وبلاگ">
          <p className="text-xs font-bold">موضوع‌های وبلاگ</p>
          <ul className="mt-2 space-y-1.5 text-[11px] muted">
            {categories.slice(0, 6).map((c) => (
              <li key={c.slug}>
                <Link href={`/blog/category/${c.slug}`} className="hover:underline">
                  {c.name}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/blog" className="hover:underline">
                همه مقاله‌ها
              </Link>
            </li>
          </ul>
        </nav>

        <div>
          <p className="text-xs font-bold">ارتباط</p>
          <ul className="mt-2 space-y-1.5 text-[11px] muted">
            {supportEmail ? (
              <li>
                <a href={`mailto:${supportEmail}`} className="ltr inline-block hover:underline">
                  {supportEmail}
                </a>
              </li>
            ) : null}
            <li>
              <Link href="/blog/rss.xml" className="hover:underline">
                خوراک RSS وبلاگ
              </Link>
            </li>
            <li>
              <Link href="/dashboard/tickets" className="hover:underline">
                تیکت پشتیبانی
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t py-4 text-center text-[11px] muted">
        © {new Date().toLocaleDateString('fa-IR', { year: 'numeric' })} {brand} — تمامی حقوق محفوظ است.
      </div>
    </footer>
  );
}
