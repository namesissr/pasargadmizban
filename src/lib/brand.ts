/**
 * رنگ برند.
 *
 * مدیر سایت یک کد رنگ می‌دهد و از همان، طیف کامل ۵۰ تا ۹۵۰ ساخته می‌شود —
 * همان متغیرهایی که کل رابط کاربری با آن‌ها رنگ می‌گیرد. اینطور وبلاگ با
 * رنگ سایت اصلی یکی می‌شود، بدون دست زدن به کد.
 */

export type Rgb = { r: number; g: number; b: number };
export type Hsl = { h: number; s: number; l: number };

export const DEFAULT_BRAND_COLOR = '#17b19a';

export function normalizeHex(input: string | null | undefined): string {
  const raw = (input ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    const [a, b, c] = raw.toLowerCase();
    return `#${a}${a}${b}${b}${c}${c}`;
  }
  return DEFAULT_BRAND_COLOR;
}

function hexToRgb(hex: string): Rgb {
  const h = normalizeHex(hex).slice(1);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const to = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;

  return { h, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const hue = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return { r: hue(h + 1 / 3) * 255, g: hue(h) * 255, b: hue(h - 1 / 3) * 255 };
}

/** روشنایی هدف هر پله از طیف */
const STEPS: { key: number; l: number }[] = [
  { key: 50, l: 0.965 },
  { key: 100, l: 0.92 },
  { key: 200, l: 0.84 },
  { key: 300, l: 0.73 },
  { key: 400, l: 0.62 },
  { key: 500, l: 0.52 },
  { key: 600, l: 0.43 },
  { key: 700, l: 0.35 },
  { key: 800, l: 0.28 },
  { key: 900, l: 0.22 },
  { key: 950, l: 0.14 },
];

/**
 * طیف کامل برند از یک رنگ.
 * اشباع در پله‌های روشن کمی کم و در پله‌های تیره کمی زیاد می‌شود؛ وگرنه
 * رنگ‌های روشن جیغ و رنگ‌های تیره مرده به نظر می‌رسند.
 */
export function brandScale(hex: string): Record<number, string> {
  const base = rgbToHsl(hexToRgb(hex));
  const scale: Record<number, string> = {};

  for (const step of STEPS) {
    const distance = Math.abs(step.l - base.l);
    const saturation = Math.max(0.12, Math.min(1, base.s * (step.l > base.l ? 1 - distance * 0.35 : 1 + distance * 0.2)));
    scale[step.key] = rgbToHex(hslToRgb({ h: base.h, s: saturation, l: step.l }));
  }

  // پله‌ای که به رنگ انتخابی مدیر نزدیک‌تر است، دقیقاً همان رنگ می‌شود تا
  // رنگ برند عیناً در سایت دیده شود
  const closest = STEPS.reduce((best, step) =>
    Math.abs(step.l - base.l) < Math.abs(best.l - base.l) ? step : best,
  );
  scale[closest.key] = normalizeHex(hex);

  return scale;
}

/** CSS آماده برای تزریق در صفحه‌های عمومی */
export function brandCss(hex: string): string {
  const scale = brandScale(hex);
  const vars = Object.entries(scale)
    .map(([key, value]) => `--color-brand-${key}:${value};`)
    .join('');
  return `:root{${vars}--ring:${scale[500]};}`;
}
