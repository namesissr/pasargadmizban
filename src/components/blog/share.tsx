'use client';

import { useState } from 'react';
import { Link2, Check, Send, Twitter, MessageCircle } from 'lucide-react';

/**
 * اشتراک‌گذاری مقاله. سیگنال‌های اجتماعی رتبه را مستقیم بالا نمی‌برند، ولی
 * بازدید و لینک طبیعی می‌آورند — و همان است که گوگل می‌بیند.
 */
export function ShareRow({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  const targets = [
    { label: 'تلگرام', icon: <Send size={14} />, href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}` },
    { label: 'واتساپ', icon: <MessageCircle size={14} />, href: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}` },
    { label: 'ایکس', icon: <Twitter size={14} />, href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}` },
  ];

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // دسترسی به کلیپ‌بورد نبود؛ کاربر می‌تواند از نوار آدرس کپی کند
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-bold muted">اشتراک‌گذاری:</span>
      {targets.map((t) => (
        <a
          key={t.label}
          href={t.href}
          target="_blank"
          rel="noopener nofollow"
          className="btn btn-ghost btn-sm"
          aria-label={`اشتراک‌گذاری در ${t.label}`}
        >
          {t.icon} {t.label}
        </a>
      ))}
      <button type="button" onClick={copy} className="btn btn-ghost btn-sm" aria-label="کپی نشانی مقاله">
        {copied ? <Check size={14} /> : <Link2 size={14} />} {copied ? 'کپی شد' : 'کپی لینک'}
      </button>
    </div>
  );
}
