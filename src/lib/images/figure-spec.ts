/**
 * نمودارهای داخل مقاله — بخش مشترک میان مرورگر و سرور.
 *
 * این فایل هیچ وابستگی‌ای ندارد چون ویرایشگر مقاله هم (در مرورگر) از آن
 * استفاده می‌کند. ساختن خود تصویر در `figures.ts` و فقط سمت سرور است.
 *
 * نمودار در مارک‌داون این‌طور نوشته می‌شود:
 *
 *   :::figure steps مراحل اتصال به سرور با SSH
 *   ساخت کلید SSH روی کامپیوتر
 *   کپی کلید عمومی روی سرور
 *   اتصال با دستور ssh
 *   :::
 *
 * نوع‌ها:
 *   steps     — مراحل شماره‌دار (هر خط یک مرحله)
 *   flow      — جریان افقی از راست به چپ، ۲ تا ۵ گام (هر خط یک گام)
 *   compare   — مقایسه دو گزینه: خط اول «نام الف | نام ب»، بعد «معیار | الف | ب»
 *   checklist — فهرست بررسی (هر خط یک مورد)
 *   specs     — کارت مشخصات: «مقدار | برچسب» (مثل «۴ گیگ | رم»)
 */

export const FIGURE_KINDS = ['steps', 'flow', 'compare', 'checklist', 'specs'] as const;
export type FigureKind = (typeof FIGURE_KINDS)[number];

export const FIGURE_KIND_FA: Record<FigureKind, string> = {
  steps: 'مراحل',
  flow: 'جریان',
  compare: 'مقایسه',
  checklist: 'فهرست بررسی',
  specs: 'مشخصات',
};

export type FigureSpec =
  | { kind: 'steps' | 'flow' | 'checklist'; title: string; items: string[] }
  | { kind: 'compare'; title: string; columns: [string, string]; rows: { label: string; a: string; b: string }[] }
  | { kind: 'specs'; title: string; items: { value: string; label: string }[] };

/** سقف شمار ردیف‌ها؛ نمودار شلوغ، خوانا نیست */
const MAX_ITEMS: Record<FigureKind, number> = { steps: 8, flow: 5, compare: 8, checklist: 10, specs: 6 };
const MIN_ITEMS: Record<FigureKind, number> = { steps: 2, flow: 2, compare: 1, checklist: 2, specs: 2 };
const MAX_TEXT = 90;

export const FIGURE_WIDTH = 1200;

function clean(text: string): string {
  return text
    .replace(/^\s*(?:[-*•]|\d+[.)]|[۰-۹]+[.)])\s+/, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT);
}

function cells(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => clean(c));
}

export function isFigureKind(value: string): value is FigureKind {
  return (FIGURE_KINDS as readonly string[]).includes(value);
}

/**
 * خواندن بدنه یک بلوک :::figure. اگر داده برای آن نوع نمودار کافی نباشد،
 * null برمی‌گرداند تا جایش هیچ تصویری نیاید (بهتر از نمودار نیمه‌کاره).
 */
export function parseFigure(kind: string, title: string, lines: string[]): FigureSpec | null {
  if (!isFigureKind(kind)) return null;
  const body = lines.map((l) => l.trim()).filter(Boolean);
  const cleanTitle = clean(title) || FIGURE_KIND_FA[kind];

  if (kind === 'compare') {
    if (body.length < 2) return null;
    const head = cells(body[0]);
    if (head.length < 2) return null;
    const columns: [string, string] = [head[head.length - 2], head[head.length - 1]];
    const rows = body
      .slice(1)
      .map(cells)
      .filter((c) => c.length >= 3 && c[0])
      .map((c) => ({ label: c[0], a: c[1], b: c[2] }))
      .slice(0, MAX_ITEMS.compare);
    if (rows.length < MIN_ITEMS.compare) return null;
    return { kind, title: cleanTitle, columns, rows };
  }

  if (kind === 'specs') {
    const items = body
      .map(cells)
      .filter((c) => c.length >= 2 && c[0] && c[1])
      .map((c) => ({ value: c[0].slice(0, 24), label: c[1].slice(0, 40) }))
      .slice(0, MAX_ITEMS.specs);
    if (items.length < MIN_ITEMS.specs) return null;
    return { kind, title: cleanTitle, items };
  }

  const items = body.map(clean).filter(Boolean).slice(0, MAX_ITEMS[kind]);
  if (items.length < MIN_ITEMS[kind]) return null;
  return { kind, title: cleanTitle, items };
}

/* ───────────────────────  اندازه نمودار  ─────────────────────── */

/**
 * اندازه هر نمودار فقط به نوع و شمار ردیف‌ها بستگی دارد، نه به طول متن.
 * اینطور مرورگر پیش از بارگذاری تصویر، جای دقیقش را نگه می‌دارد و صفحه
 * هنگام بارگذاری نمی‌پرد (CLS صفر).
 */
export const FIG = {
  pad: 56,
  header: 150,
  footer: 64,
  stepRow: 108,
  flowBox: 190,
  compareHead: 76,
  compareRow: 78,
  checkRow: 76,
  specCard: 156,
  specGap: 24,
} as const;

export function figureSize(spec: FigureSpec): { width: number; height: number } {
  const base = FIG.header + FIG.footer;
  let body = 0;
  switch (spec.kind) {
    case 'steps':
      body = spec.items.length * FIG.stepRow;
      break;
    case 'flow':
      body = FIG.flowBox + 40;
      break;
    case 'compare':
      body = FIG.compareHead + spec.rows.length * FIG.compareRow + 16;
      break;
    case 'checklist': {
      const rows = spec.items.length >= 5 ? Math.ceil(spec.items.length / 2) : spec.items.length;
      body = rows * FIG.checkRow + 8;
      break;
    }
    case 'specs': {
      const rows = Math.ceil(spec.items.length / 3);
      body = rows * FIG.specCard + (rows - 1) * FIG.specGap + 16;
      break;
    }
  }
  return { width: FIGURE_WIDTH, height: base + body };
}

/* ───────────────────────  شناسه و کدگذاری  ─────────────────────── */

/** هش کوتاه و پایدار (FNV-1a)؛ برای نسخه‌گذاری نشانی تصویر و کش */
export function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function figureHash(spec: FigureSpec): string {
  return shortHash(JSON.stringify(spec));
}

/** کدگذاری نمودار برای نشانی پیش‌نمایش ویرایشگر (UTF-8 → base64url) */
export function encodeFigure(spec: FigureSpec): string {
  const bytes = new TextEncoder().encode(JSON.stringify(spec));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeFigure(encoded: string): FigureSpec | null {
  try {
    const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const raw = JSON.parse(new TextDecoder().decode(bytes)) as { kind?: string; title?: string };
    if (!raw || typeof raw !== 'object' || !raw.kind) return null;
    // دوباره از همان مسیر خواندن عبور می‌دهیم تا ورودی دستکاری‌شده محدود بماند
    return normalizeFigure(raw as FigureSpec);
  } catch {
    return null;
  }
}

/** نمودار رسیده از بیرون را از نو اعتبارسنجی می‌کند */
export function normalizeFigure(spec: FigureSpec): FigureSpec | null {
  if (!spec || !isFigureKind(spec.kind)) return null;
  if (spec.kind === 'compare') {
    const s = spec as Extract<FigureSpec, { kind: 'compare' }>;
    if (!Array.isArray(s.columns) || !Array.isArray(s.rows)) return null;
    const lines = [`${s.columns[0]} | ${s.columns[1]}`, ...s.rows.map((r) => `${r.label} | ${r.a} | ${r.b}`)];
    return parseFigure('compare', String(s.title ?? ''), lines);
  }
  if (spec.kind === 'specs') {
    const s = spec as Extract<FigureSpec, { kind: 'specs' }>;
    if (!Array.isArray(s.items)) return null;
    return parseFigure('specs', String(s.title ?? ''), s.items.map((i) => `${i?.value ?? ''} | ${i?.label ?? ''}`));
  }
  const s = spec as Extract<FigureSpec, { kind: 'steps' | 'flow' | 'checklist' }>;
  if (!Array.isArray(s.items)) return null;
  return parseFigure(s.kind, String(s.title ?? ''), s.items.map((i) => String(i ?? '')));
}

/** نشانی عمومی نمودار n‌اُم یک مقاله */
export function figureUrl(slug: string, index: number, spec: FigureSpec): string {
  return `/media/blog/figure/${encodeURIComponent(slug)}/${index + 1}.webp?v=${figureHash(spec)}`;
}

/** نشانی پیش‌نمایش (فقط برای مدیر؛ مقاله ممکن است هنوز ذخیره نشده باشد) */
export function figurePreviewUrl(spec: FigureSpec): string {
  return `/media/blog/figure-preview?d=${encodeFigure(spec)}`;
}

/** همه بلوک‌های نمودار یک متن مارک‌داون، به ترتیب */
export function extractFigures(markdown: string): FigureSpec[] {
  const out: FigureSpec[] = [];
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^```/.test(t)) inFence = !inFence;
    if (inFence) continue;
    const m = /^:::\s*figure\s+([a-z]+)\s*(.*)$/.exec(t);
    if (!m) continue;
    const body: string[] = [];
    i++;
    while (i < lines.length && !/^:::\s*$/.test(lines[i].trim())) body.push(lines[i++]);
    const spec = parseFigure(m[1], m[2], body);
    if (spec) out.push(spec);
  }
  return out;
}
