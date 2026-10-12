import Link from 'next/link';
import { Server } from 'lucide-react';

/**
 * سربرگ و پابرگ بخش عمومی سایت.
 *
 * یک نسخه، هم در صفحه اصلی و هم در وبلاگ استفاده می‌شود تا قالب دو بخش
 * هیچ‌وقت از هم جدا نشود: تغییر منو یا پابرگ، همه‌جا با هم اعمال می‌شود.
 */

export function SiteHeader({
  brand,
  blogEnabled,
  tagline = 'سرور ابری با پرداخت ریالی',
  /** جایی برای افزودن چیزی کنار منو، مثل کادر جستجوی وبلاگ */
  extraNav,
  /** نواری زیر سربرگ، مثل فهرست دسته‌های وبلاگ */
  below,
}: {
  brand: string;
  blogEnabled: boolean;
  tagline?: string;
  extraNav?: React.ReactNode;
  below?: React.ReactNode;
}) {
  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{ background: 'color-mix(in srgb, var(--surface) 90%, transparent)', backdropFilter: 'blur(8px)' }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2" aria-label={`صفحه اصلی ${brand}`}>
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--color-brand-600)] text-white">
            <Server size={17} />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-extrabold">{brand}</span>
            <span className="block text-[11px] muted">{tagline}</span>
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          {extraNav}
          {blogEnabled ? (
            <Link href="/blog" className="btn btn-ghost btn-sm">
              وبلاگ
            </Link>
          ) : null}
          <Link href="/login" className="btn btn-ghost btn-sm">
            ورود
          </Link>
          <Link href="/register" className="btn btn-primary btn-sm">
            ثبت‌نام رایگان
          </Link>
        </nav>
      </div>
      {below}
    </header>
  );
}

export function SiteFooter({
  brand,
  supportEmail,
  blogEnabled,
  /** پیوندهای اضافه — صفحه‌های وبلاگ دسته‌هایشان را اینجا می‌گذارند */
  links = [],
}: {
  brand: string;
  supportEmail?: string;
  blogEnabled: boolean;
  links?: { href: string; label: string }[];
}) {
  return (
    <footer className="border-t py-6 text-center text-[11px] muted">
      <nav aria-label="پیوندهای سایت" className="mb-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4">
        <Link href="/" className="hover:underline">
          صفحه اصلی
        </Link>
        <Link href="/#pricing" className="hover:underline">
          قیمت‌ها
        </Link>
        {blogEnabled ? (
          <>
            <Link href="/blog" className="hover:underline">
              وبلاگ
            </Link>
            <Link href="/blog/rss.xml" className="hover:underline">
              خوراک RSS
            </Link>
          </>
        ) : null}
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="hover:underline">
            {link.label}
          </Link>
        ))}
        <Link href="/register" className="hover:underline">
          ثبت‌نام
        </Link>
        <Link href="/login" className="hover:underline">
          ورود
        </Link>
      </nav>
      {brand} — تمامی حقوق محفوظ است.
      {supportEmail ? <span className="ltr mx-1 inline-block">{supportEmail}</span> : null}
    </footer>
  );
}
