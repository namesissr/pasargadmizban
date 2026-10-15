import type { MetadataRoute } from 'next';
import { siteInfo, absoluteUrl } from '@/lib/seo';

/**
 * robots.txt — به خزنده‌ها می‌گوید کجا بروند و کجا نروند.
 * پنل کاربری، صفحه‌های ورود و APIها ارزش ایندکس ندارند و خزیده‌شدنشان
 * فقط سهم خزش سایت را مصرف می‌کند.
 */
export const dynamic = 'force-dynamic';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const site = await siteInfo();

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/blog'],
        disallow: [
          '/api/',
          '/admin',
          '/dashboard',
          '/login',
          '/register',
          '/forgot-password',
          '/reset-password',
          '/verify-email',
          '/blog?q=',
        ],
      },
    ],
    sitemap: absoluteUrl(site.siteUrl, '/sitemap.xml'),
    host: site.siteUrl,
  };
}
