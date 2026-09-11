import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui/toast';
import { ThemeProvider } from '@/components/app/theme';

export const metadata: Metadata = {
  title: {
    default: 'پاسارگاد میزبان — پنل سرور ابری',
    template: '%s | پاسارگاد میزبان',
  },
  description:
    'خرید و مدیریت سرور ابری با پرداخت ریالی. تحویل خودکار، صورتحساب ساعتی و ماهانه، پنل مدیریت کامل و پشتیبانی فارسی.',
  robots: { index: false, follow: false },
  icons: { icon: '/favicon.svg', apple: '/favicon.svg' },
  manifest: '/manifest.webmanifest',
  applicationName: 'پاسارگاد میزبان',
  appleWebApp: {
    capable: true,
    title: 'پاسارگاد میزبان',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7f9' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
};

/**
 * پیش از نخستین رنگ‌آمیزی اجرا می‌شود تا صفحه با تم درست بالا بیاید
 * و کاربر پرش سفید به تیره نبیند. حالت «خودکار» چیزی در حافظه ندارد
 * و از تنظیمات سیستم پیروی می‌کند.
 */
const themeScript = `
try {
  var t = localStorage.getItem('pm-theme');
  var resolved = (t === 'dark' || t === 'light')
    ? t
    : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
  document.documentElement.style.colorScheme = resolved;
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
