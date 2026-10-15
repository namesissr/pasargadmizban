import path from 'node:path';
import fs from 'node:fs';

/**
 * موتور تبدیل SVG به PNG.
 *
 * از resvg استفاده می‌کنیم چون حروف فارسی را درست به هم وصل می‌کند (حروف‌چینی
 * کامل یونیکد). بیشتر کتابخانه‌های دیگر Node حروف فارسی را جدا از هم
 * می‌کشند. اگر به هر دلیل ماژول بومی resvg روی سرور بالا نیاید، به جای PNG
 * همان SVG برگردانده می‌شود: مرورگر آن را نشان می‌دهد و فقط پیش‌نمایش
 * شبکه‌های اجتماعی (که SVG نمی‌پذیرند) بی‌عکس می‌ماند.
 */

type ResvgModule = typeof import('@resvg/resvg-js');

let engine: ResvgModule | null | undefined;

export async function loadEngine(): Promise<ResvgModule | null> {
  if (engine !== undefined) return engine;
  try {
    engine = await import('@resvg/resvg-js');
  } catch (err) {
    console.warn('[images] resvg بارگذاری نشد؛ تصویرها به شکل SVG سرو می‌شوند:', (err as Error).message);
    engine = null;
  }
  return engine;
}

/* ───────────────────────  فونت  ─────────────────────── */

export const FONT_FAMILY = 'Vazirmatn';

const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts', 'vazirmatn');
const FONT_FILES = ['Vazirmatn-Medium.ttf', 'Vazirmatn-Bold.ttf', 'Vazirmatn-ExtraBold.ttf'];

let fontFiles: string[] | null = null;
function fonts(): string[] {
  if (!fontFiles) fontFiles = FONT_FILES.map((f) => path.join(FONT_DIR, f)).filter((f) => fs.existsSync(f));
  return fontFiles;
}

function options(width?: number) {
  return {
    font: { fontFiles: fonts(), loadSystemFonts: false, defaultFontFamily: FONT_FAMILY },
    ...(width ? { fitTo: { mode: 'width' as const, value: width } } : {}),
    shapeRendering: 2 as const,
    textRendering: 1 as const,
  };
}

/* ───────────────────────  متن  ─────────────────────── */

const RLE = '‫';
const PDF = '‬';

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** آیا متن حرف فارسی/عربی دارد؟ */
export function hasRtl(text: string): boolean {
  return /[֐-ࣿיִ-﷿ﹰ-﻿]/.test(text);
}

/**
 * متن آماده نوشتن در SVG.
 *
 * resvg ترتیب متن قاطی فارسی و انگلیسی را (مثل «اتصال با SSH (۱۰ قدم)») درست
 * نمی‌چیند مگر اینکه کل خط در نشانه «جاسازی راست‌به‌چپ» پیچیده شود.
 */
export function svgText(text: string): string {
  const safe = escapeXml(text);
  return hasRtl(text) ? `${RLE}${safe}${PDF}` : safe;
}

export type Weight = 500 | 700 | 800;
export type Measure = (text: string, size: number, weight: Weight) => number;

const measureCache = new Map<string, number>();

/**
 * اندازه‌گیر دقیق پهنای متن با همان موتوری که تصویر را می‌کشد. اگر موتور
 * نباشد، تخمین بر پایه شمار نویسه برمی‌گرداند.
 */
export function makeMeasure(mod: ResvgModule | null): Measure {
  return (text, size, weight) => {
    if (!text) return 0;
    const key = `${weight}|${size}|${text}`;
    const cached = measureCache.get(key);
    if (cached !== undefined) return cached;

    let width = text.length * size * 0.52;
    if (mod) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width * 2 + 100)}" height="${size * 3}"><text x="10" y="${size * 2}" font-family="${FONT_FAMILY}" font-size="${size}" font-weight="${weight}">${svgText(text)}</text></svg>`;
      try {
        const box = new mod.Resvg(svg, options()).getBBox();
        if (box) width = box.width;
      } catch {
        // تخمین بالا کافی است
      }
    }
    if (measureCache.size > 5000) measureCache.clear();
    measureCache.set(key, width);
    return width;
  };
}

/**
 * شکستن متن به چند خط با پهنای مشخص (حریصانه، کلمه به کلمه).
 * اگر جا نشد، خط آخر با «…» کوتاه می‌شود.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  size: number,
  weight: Weight,
  maxLines: number,
  measure: Measure,
): { lines: string[]; overflow: boolean } {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  let overflow = false;

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate, size, weight) <= maxWidth || !current) {
      current = candidate;
      if (!lines.length && measure(current, size, weight) > maxWidth) overflow = true;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  if (lines.length > maxLines) {
    overflow = true;
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.includes(' ') && measure(`${last}…`, size, weight) > maxWidth) {
      last = last.slice(0, last.lastIndexOf(' '));
    }
    kept[maxLines - 1] = `${last}…`;
    return { lines: kept, overflow };
  }
  if (lines.some((l) => measure(l, size, weight) > maxWidth)) overflow = true;
  return { lines, overflow };
}

/** رقم‌های فارسی */
export function faDigits(value: number | string): string {
  return String(value).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

/* ───────────────────────  رندر و کش  ─────────────────────── */

export type ImageFormat = 'png' | 'webp' | 'jpeg';
export type RenderedImage = { body: Buffer; type: string; etag: string };

const MIME: Record<ImageFormat, string> = { png: 'image/png', webp: 'image/webp', jpeg: 'image/jpeg' };

const CACHE_LIMIT = 200;
const cache = new Map<string, RenderedImage>();

type SharpFn = (typeof import('sharp'))['default'];
let sharpMod: SharpFn | null | undefined;
async function loadSharp(): Promise<SharpFn | null> {
  if (sharpMod !== undefined) return sharpMod;
  try {
    sharpMod = (await import('sharp')).default;
  } catch {
    sharpMod = null;
  }
  return sharpMod ?? null;
}

/**
 * تبدیل SVG به تصویر، با کش در حافظه.
 *
 * resvg فقط PNG می‌سازد و PNG با گرادیان سنگین است (حدود ۴۰۰ کیلوبایت).
 * برای صفحه WebP (حدود ۳۰ کیلوبایت) و برای پیش‌نمایش شبکه‌های اجتماعی
 * JPEG می‌دهیم. اگر sharp نبود، همان PNG برمی‌گردد.
 *
 * کلید کش باید همه چیزهایی را که در خروجی اثر دارند در بر بگیرد
 * (متن، رنگ برند، نسبت، طرح، قالب).
 */
export async function renderSvg(
  cacheKey: string,
  build: (measure: Measure) => string,
  format: ImageFormat = 'webp',
): Promise<RenderedImage> {
  const key = `${format}|${cacheKey}`;
  const hit = cache.get(key);
  if (hit) {
    // جابه‌جایی به ته فهرست = تازه‌ترین در LRU
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  const mod = await loadEngine();
  const svg = build(makeMeasure(mod));
  const etag = `"${hashString(key + svg)}"`;

  let result: RenderedImage;
  if (!mod) {
    result = { body: Buffer.from(svg, 'utf8'), type: 'image/svg+xml', etag };
  } else {
    const png = Buffer.from(new mod.Resvg(svg, options()).render().asPng());
    const sharp = format === 'png' ? null : await loadSharp();
    if (sharp && format === 'webp') {
      result = { body: await sharp(png).webp({ quality: 82 }).toBuffer(), type: MIME.webp, etag };
    } else if (sharp && format === 'jpeg') {
      result = {
        body: await sharp(png).flatten({ background: '#ffffff' }).jpeg({ quality: 84, mozjpeg: true }).toBuffer(),
        type: MIME.jpeg,
        etag,
      };
    } else {
      result = { body: png, type: MIME.png, etag };
    }
  }

  cache.set(key, result);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  return result;
}

/** قالب خروجی از روی پسوند فایل نشانی */
export function formatFromExt(file: string): ImageFormat | null {
  const ext = file.toLowerCase().split('.').pop();
  if (ext === 'webp') return 'webp';
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  if (ext === 'png') return 'png';
  return null;
}

export function clearImageCache() {
  cache.clear();
}

function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** پاسخ HTTP تصویر با کش مرورگر/CDN و پشتیبانی از If-None-Match */
export function imageResponse(req: Request, image: RenderedImage, maxAge = 86_400): Response {
  const headers = {
    'Content-Type': image.type,
    'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge * 7}, stale-while-revalidate=${maxAge * 7}`,
    ETag: image.etag,
    'X-Content-Type-Options': 'nosniff',
  };
  if (req.headers.get('if-none-match') === image.etag) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(image.body), { status: 200, headers });
}
