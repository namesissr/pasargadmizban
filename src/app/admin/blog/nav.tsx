'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, FolderTree, Hash, CalendarDays, Bot, ImageIcon, Link2, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/admin/blog', label: 'مقاله‌ها', icon: FileText, exact: true },
  { href: '/admin/blog/categories', label: 'دسته‌ها', icon: FolderTree },
  { href: '/admin/blog/tags', label: 'برچسب‌ها', icon: Hash },
  { href: '/admin/blog/calendar', label: 'تقویم', icon: CalendarDays },
  { href: '/admin/blog/content', label: 'تولید خودکار', icon: Bot },
  { href: '/admin/blog/images', label: 'تصاویر', icon: ImageIcon },
  { href: '/admin/blog/redirects', label: 'ریدایرکت‌ها', icon: Link2 },
  { href: '/admin/seo', label: 'سئو و آمار', icon: TrendingUp },
];

/**
 * نوار پیمایش بخش وبلاگ.
 *
 * منوی کنارِ پنل روی گوشی بسته است؛ این نوار همان مسیرها را بالای هر صفحه
 * در دسترس می‌گذارد تا جابه‌جایی بین بخش‌ها یک کلیک باشد.
 */
export function BlogNav() {
  const pathname = usePathname();

  return (
    <div className="scroll-x mb-4 border-b">
      <div className="flex min-w-max gap-1">
        {ITEMS.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2.5 text-xs font-semibold transition',
                active ? 'text-[var(--color-brand-600)]' : 'muted hover:opacity-80',
              )}
            >
              <Icon size={14} />
              {item.label}
              {active ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-[var(--color-brand-600)]" /> : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
