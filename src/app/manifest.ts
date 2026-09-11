import type { MetadataRoute } from 'next';

/**
 * فایل مانیفست تا کاربر بتواند پنل را روی صفحه اصلی گوشی نصب کند
 * و بدون نوار آدرس مرورگر، مثل یک اپلیکیشن باز شود.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'پاسارگاد میزبان — پنل سرور ابری',
    short_name: 'پاسارگاد',
    description: 'ساخت و مدیریت سرور ابری با پرداخت ریالی',
    lang: 'fa',
    dir: 'rtl',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#f6f7f9',
    theme_color: '#0d8f7e',
    icons: [
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    shortcuts: [
      { name: 'سرورهای من', url: '/dashboard/servers' },
      { name: 'ساخت سرور جدید', url: '/dashboard/servers/new' },
      { name: 'شارژ کیف پول', url: '/dashboard/wallet' },
      { name: 'پشتیبانی', url: '/dashboard/tickets' },
    ],
  };
}
