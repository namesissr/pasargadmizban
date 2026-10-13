import Link from 'next/link';
import { Server, ArrowLeft } from 'lucide-react';
import type { SiteInfo } from '@/lib/seo';
import { cloudLinks, mainSiteLink } from '@/lib/seo';

/**
 * سربرگ و پابرگ بخش عمومی سایت.
 *
 * همه دکمه‌های فروش به پنل ابری (مثل cloud.example.com) می‌روند، چون همان
 * جایی است که کاربر ثبت‌نام می‌کند و سرور می‌سازد. آدرس پنل و سایت اصلی از
 * تنظیمات خوانده می‌شود؛ اگر تنظیم نشده باشند، به مسیرهای همین سایت
 * برمی‌گردند تا لینکی شکسته نماند.
 */

/** لینک داخلی یا بیرونی، بسته به اینکه مقصد روی همین دامنه باشد یا نه */
function SmartLink({
  href,
  external,
  className,
  children,
  ariaLabel,
}: {
  href: string;
  external: boolean;
  className?: string;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  if (external) {
    return (
      <a href={href} className={className} rel="noopener" aria-label={ariaLabel}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} aria-label={ariaLabel}>
      {children}
    </Link>
  );
}

export function SiteHeader({
  site,
  /** جایی برای افزودن چیزی کنار منو، مثل کادر جستجوی وبلاگ */
  extraNav,
  /** نواری زیر سربرگ، مثل فهرست دسته‌های وبلاگ */
  below,
}: {
  site: SiteInfo;
  extraNav?: React.ReactNode;
  below?: React.ReactNode;
}) {
  const cloud = cloudLinks(site);
  const main = mainSiteLink(site);

  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{ background: 'color-mix(in srgb, var(--surface) 90%, transparent)', backdropFilter: 'blur(8px)' }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <SmartLink
          href={main.href}
          external={main.external}
          className="flex items-center gap-2"
          ariaLabel={`صفحه اصلی ${site.brandName}`}
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--color-brand-600)] text-white">
            <Server size={17} />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-extrabold">{site.brandName}</span>
            <span className="block text-[11px] muted">{site.brandTagline}</span>
          </span>
        </SmartLink>

        <nav className="flex items-center gap-2">
          {extraNav}
          {site.enabled ? (
            <Link href="/blog" className="btn btn-ghost btn-sm">
              وبلاگ
            </Link>
          ) : null}
          <SmartLink href={cloud.login} external={cloud.external} className="btn btn-ghost btn-sm">
            ورود
          </SmartLink>
          <SmartLink href={cloud.register} external={cloud.external} className="btn btn-primary btn-sm">
            {site.cloudCtaLabel}
          </SmartLink>
        </nav>
      </div>
      {below}
    </header>
  );
}

export function SiteFooter({
  site,
  /** پیوندهای اضافه — صفحه‌های وبلاگ دسته‌هایشان را اینجا می‌گذارند */
  links = [],
}: {
  site: SiteInfo;
  links?: { href: string; label: string }[];
}) {
  const cloud = cloudLinks(site);
  const main = mainSiteLink(site);

  return (
    <footer className="border-t py-6 text-center text-[11px] muted">
      <nav aria-label="پیوندهای سایت" className="mb-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4">
        <SmartLink href={main.href} external={main.external} className="hover:underline">
          صفحه اصلی
        </SmartLink>
        <SmartLink href={cloud.pricing} external={cloud.external} className="hover:underline">
          قیمت سرورها
        </SmartLink>
        {site.enabled ? (
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
        <SmartLink href={cloud.register} external={cloud.external} className="hover:underline">
          {site.cloudCtaLabel}
        </SmartLink>
        <SmartLink href={cloud.login} external={cloud.external} className="hover:underline">
          ورود به پنل
        </SmartLink>
      </nav>

      {/* دعوت پایانی — آخرین جایی که خواننده می‌تواند کلیک کند */}
      <div className="mx-auto mb-4 max-w-md px-4">
        <SmartLink href={cloud.register} external={cloud.external} className="btn btn-primary btn-sm w-full">
          {site.cloudCtaLabel} <ArrowLeft size={14} />
        </SmartLink>
      </div>

      {site.brandName} — تمامی حقوق محفوظ است.
      {site.supportEmail ? <span className="ltr mx-1 inline-block">{site.supportEmail}</span> : null}
    </footer>
  );
}
