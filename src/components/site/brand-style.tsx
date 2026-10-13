import { brandCss } from '@/lib/brand';

/**
 * رنگ برند را به شکل متغیرهای CSS در صفحه تزریق می‌کند.
 *
 * چرا این‌طور و نه در فایل CSS؟ چون رنگ از تنظیمات پنل می‌آید و مدیر سایت
 * باید بتواند بدون بیلد دوباره، رنگ وبلاگ را با رنگ سایت اصلی یکی کند.
 */
export function BrandStyle({ color }: { color: string }) {
  return <style dangerouslySetInnerHTML={{ __html: brandCss(color) }} />;
}
