'use client';

import { useEffect } from 'react';

/**
 * شمارش بازدید مقاله. در مرورگر و پس از نمایش صفحه انجام می‌شود تا
 * نه خزنده‌ها را بشمارد و نه زمان پاسخ سرور را بالا ببرد.
 */
export function ViewPing({ slug }: { slug: string }) {
  useEffect(() => {
    const key = `pm-blog-view:${slug}`;
    try {
      // هر بازدیدکننده در هر ۶ ساعت یک بار شمرده می‌شود
      const last = Number(sessionStorage.getItem(key) ?? 0);
      if (Date.now() - last < 6 * 3600 * 1000) return;
      sessionStorage.setItem(key, String(Date.now()));
    } catch {
      // حافظه مرورگر در دسترس نیست؛ اشکالی ندارد
    }

    const timer = setTimeout(() => {
      fetch('/api/blog/view', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug }),
        keepalive: true,
      }).catch(() => null);
    }, 2500);

    return () => clearTimeout(timer);
  }, [slug]);

  return null;
}
