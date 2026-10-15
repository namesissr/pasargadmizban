import { shortHash } from './figure-spec';

/**
 * نشانی تصویرهای خودکار وبلاگ — بدون وابستگی، تا در مرورگر هم کار کند.
 *
 * کاور خودکار فایلی روی دیسک نیست؛ نشانی‌ای است که هر بار از روی خود مقاله
 * ساخته می‌شود (و در حافظه و مرورگر کش می‌شود). پس با بازسازی ایمیج داکر
 * از بین نمی‌رود و اگر رنگ برند یا عنوان عوض شود، تصویر هم خودش به‌روز
 * می‌شود.
 *
 *   /media/blog/cover/<slug>.webp?v=<نسخه>&n=<طرح>&t=<موضوع>
 *
 * پسوند قالب را تعیین می‌کند (webp برای صفحه، jpg برای شبکه‌های اجتماعی) و
 * r نسبت تصویر را (og، 16x9، 4x3، 1x1).
 */

export const COVER_PREFIX = '/media/blog/cover/';

export type CoverRatioKey = 'og' | '16x9' | '4x3' | '1x1';

export const COVER_DIMENSIONS: Record<CoverRatioKey, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  '16x9': { width: 1200, height: 675 },
  '4x3': { width: 1200, height: 900 },
  '1x1': { width: 1200, height: 1200 },
};

export function isAutoCover(url: string | null | undefined): boolean {
  return Boolean(url && url.startsWith(COVER_PREFIX));
}

function parse(url: string): { path: string; params: URLSearchParams } {
  const [path, query = ''] = url.split('?');
  return { path, params: new URLSearchParams(query) };
}

/** شماره طرح و موضوع دستیِ یک کاور خودکار، برای نگه داشتنشان هنگام بازسازی */
export function coverOptions(url: string | null | undefined): { variant: number; topic: string | null } {
  if (!isAutoCover(url)) return { variant: 0, topic: null };
  const { params } = parse(url!);
  return { variant: Number(params.get('n')) || 0, topic: params.get('t') };
}

export function autoCoverUrl(
  slug: string,
  input: { title: string; category?: string | null; variant?: number; topic?: string | null },
): string {
  const params = new URLSearchParams();
  params.set('v', shortHash(`${input.title}|${input.category ?? ''}|${input.variant ?? 0}|${input.topic ?? ''}`));
  if (input.variant) params.set('n', String(input.variant));
  if (input.topic) params.set('t', input.topic);
  return `${COVER_PREFIX}${encodeURIComponent(slug)}.webp?${params}`;
}

/**
 * نسخه دیگری از همان کاور خودکار (نسبت یا قالب دیگر). برای کاور دستی، همان
 * نشانی را دست‌نخورده برمی‌گرداند.
 */
export function coverVariant(
  url: string | null | undefined,
  opts: { ratio?: CoverRatioKey; ext?: 'webp' | 'jpg' | 'png' },
): string | null {
  if (!url) return null;
  if (!isAutoCover(url)) return url;
  const { path, params } = parse(url);
  const base = path.replace(/\.(webp|jpe?g|png)$/i, '');
  if (opts.ratio && opts.ratio !== 'og') params.set('r', opts.ratio);
  else params.delete('r');
  return `${base}.${opts.ext ?? 'webp'}?${params}`;
}

/** اندازه کاور خودکار، برای width/height تگ img (جلوگیری از پرش صفحه) */
export function coverSize(url: string | null | undefined): { width: number; height: number } | null {
  if (!isAutoCover(url)) return null;
  const ratio = (parse(url!).params.get('r') as CoverRatioKey | null) ?? 'og';
  return COVER_DIMENSIONS[ratio] ?? COVER_DIMENSIONS.og;
}

/** تصویر مناسب پیش‌نمایش شبکه‌های اجتماعی (JPEG؛ تلگرام و واتس‌اپ WebP را همیشه نشان نمی‌دهند) */
export function socialImage(url: string | null | undefined): string | null {
  return coverVariant(url, { ratio: 'og', ext: 'jpg' });
}

/**
 * سه نسبت پیشنهادی گوگل برای داده ساخت‌یافته مقاله (۱۶:۹، ۴:۳، ۱:۱). گوگل برای
 * نمایش در Discover و نتایج برجسته، تصویر بزرگ با چند نسبت را ترجیح می‌دهد.
 */
export function schemaImages(url: string | null | undefined): string[] {
  if (!url) return [];
  if (!isAutoCover(url)) return [url];
  return (['16x9', '4x3', '1x1'] as const).map((ratio) => coverVariant(url, { ratio, ext: 'jpg' })!);
}
