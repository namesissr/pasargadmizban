/**
 * داده ساخت‌یافته صفحه. گوگل همین را می‌خواند تا بفهمد صفحه مقاله است،
 * نویسنده‌اش کیست و پرسش‌های پرتکرارش چیست.
 */
export function JsonLd({ json }: { json: string }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
