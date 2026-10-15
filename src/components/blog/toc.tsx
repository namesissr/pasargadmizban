import { List } from 'lucide-react';
import type { TocItem } from '@/lib/markdown';

/**
 * فهرست مطالب مقاله. دو کار برای سئو می‌کند: کاربر سریع به بخش مورد نظرش
 * می‌رسد (نرخ بازگشت پایین‌تر) و گوگل می‌تواند لینک پرش به بخش‌ها
 * (jump links) را زیر نتیجه نشان بدهد.
 */
export function TableOfContents({ items }: { items: TocItem[] }) {
  if (items.length < 3) return null;

  return (
    <nav aria-label="فهرست مطالب" className="card my-6 p-4">
      <p className="flex items-center gap-2 text-xs font-bold">
        <List size={14} /> در این مقاله می‌خوانید
      </p>
      <ol className="mt-3 space-y-1.5 text-xs leading-6">
        {items.map((item) => (
          <li key={item.id} className={item.level === 3 ? 'pr-4' : ''}>
            <a href={`#${item.id}`} className="muted hover:text-[var(--color-brand-600)] hover:underline">
              {item.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
