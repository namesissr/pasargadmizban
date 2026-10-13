import { extractFigures } from './figure-spec';

/**
 * نمودار خودکار از ساختار خود مقاله.
 *
 * چیزی از خودمان نمی‌سازیم؛ فقط آنچه در متن هست را تصویری می‌کنیم:
 *   ۱) نخستین فهرست شماره‌دار (۳ تا ۸ مورد) ← نمودار «مراحل»، درست پیش از همان فهرست
 *   ۲) نخستین فهرست نقطه‌دار کوتاه (۴ تا ۱۰ مورد) ← «فهرست بررسی»
 *   ۳) سرفصل‌های اصلی مقاله (۳ تا ۷) ← «آنچه در این مقاله می‌خوانید»، پیش از نخستین سرفصل
 *
 * هر مقاله حداکثر یک نمودار خودکار می‌گیرد؛ نمودار زیاد، مقاله را شلوغ می‌کند.
 */

const ORDERED = /^\s{0,3}(?:\d+|[۰-۹]+)[.)]\s+(.+)$/;
const BULLET = /^\s{0,3}[-*•]\s+(.+)$/;
const HEADING = /^(#{1,3})\s+(.+?)\s*#*$/;

/** حذف نشانه‌گذاری درون‌خطی مارک‌داون برای متن نمودار */
export function plainInline(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|`|~~/g, '')
    .replace(/(^|\s)[*_](\S[^*_]*\S)[*_]/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * مورد فهرست را برای جا شدن در نمودار کوتاه می‌کند: برچسب پررنگ اول مورد،
 * یا بخش پیش از دونقطه («لاگ‌ها را ببینید: journalctl …» ← «لاگ‌ها را ببینید»)،
 * و در نهایت بریدن در مرز کلمه.
 */
function shorten(item: string, max = 80, splitColon = false): string {
  const labelled = /^\*\*([^*]{3,60})\*\*\s*[:：-]?/.exec(item.trim());
  let text = plainInline(labelled ? labelled[1] : item).replace(/[:：]\s*$/, '');
  if (splitColon && !labelled) {
    const head = text.split(/[:：]\s/)[0];
    if (head.length >= 8 && head.length < text.length) text = head;
  }
  text = text.replace(/[.。]\s*$/, '');
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ') > max * 0.6 ? cut.lastIndexOf(' ') : max)}…`;
}

function headingText(line: string): string | null {
  const m = HEADING.exec(line.trim());
  return m ? plainInline(m[2]) : null;
}

type Candidate = { block: string; at: number };

function figureBlock(kind: string, title: string, items: string[]): string {
  return [`:::figure ${kind} ${title}`, ...items, ':::'].join('\n');
}

function scanLists(lines: string[]): { ordered?: Candidate; bullets?: Candidate } {
  let inFence = false;
  let lastHeading: string | null = null;
  const found: { ordered?: Candidate; bullets?: Candidate } = {};

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^```/.test(t)) inFence = !inFence;
    if (inFence) continue;
    if (/^:::/.test(t)) {
      // جعبه‌ها و نمودارهای موجود را رد می‌کنیم
      i++;
      while (i < lines.length && !/^:::\s*$/.test(lines[i].trim())) i++;
      continue;
    }
    const h = headingText(t);
    if (h) {
      lastHeading = h;
      continue;
    }

    const kind = ORDERED.test(lines[i]) ? 'ordered' : BULLET.test(lines[i]) ? 'bullets' : null;
    if (!kind || found[kind]) continue;

    const start = i;
    const items: string[] = [];
    const rule = kind === 'ordered' ? ORDERED : BULLET;
    while (i < lines.length) {
      const m = rule.exec(lines[i]);
      if (m) {
        items.push(m[1]);
        i++;
        continue;
      }
      // خط ادامه مورد قبلی (تورفته) یا یک خط خالی میان موردها
      if (/^\s{2,}\S/.test(lines[i]) && items.length) {
        i++;
        continue;
      }
      if (!lines[i].trim() && i + 1 < lines.length && rule.test(lines[i + 1])) {
        i++;
        continue;
      }
      break;
    }
    i--;

    if (kind === 'ordered' && items.length >= 3 && items.length <= 8) {
      const title = lastHeading ? shorten(lastHeading, 60) : 'مراحل کار';
      found.ordered = { at: start, block: figureBlock('steps', title, items.map((x) => shorten(x, 80, true))) };
    }
    if (kind === 'bullets' && items.length >= 4 && items.length <= 10) {
      const short = items.map((x) => shorten(x, 60, true));
      // فهرست بررسی فقط برای موردهای کوتاه معنی دارد، نه پاراگراف‌های فهرست‌شده
      if (items.every((x) => plainInline(x).length <= 90)) {
        const title = lastHeading ? shorten(lastHeading, 60) : 'فهرست بررسی';
        found.bullets = { at: start, block: figureBlock('checklist', title, short) };
      }
    }
  }
  return found;
}

function overviewOfHeadings(lines: string[]): Candidate | null {
  let inFence = false;
  const heads: { line: number; text: string }[] = [];
  lines.forEach((line, i) => {
    if (/^```/.test(line.trim())) inFence = !inFence;
    if (inFence) return;
    const m = /^##\s+(.+?)\s*#*$/.exec(line.trim()) ?? /^#\s+(.+?)\s*#*$/.exec(line.trim());
    if (m) heads.push({ line: i, text: plainInline(m[1]) });
  });
  // سرفصل‌های پایانی مثل «جمع‌بندی» و «پرسش‌های پرتکرار» در نمای کلی معنی ندارند
  const useful = heads.filter((h) => !/جمع[\s‌]?بندی|نتیجه[\s‌]?گیری|پرسش|سوالات|سؤالات|منابع/.test(h.text));
  if (useful.length < 3) return null;
  const items = useful.slice(0, 7).map((h) => shorten(h.text, 70));
  return { at: heads[0].line, block: figureBlock('steps', 'آنچه در این مقاله می‌خوانید', items) };
}

export function hasFigures(markdown: string): boolean {
  return extractFigures(markdown).length > 0;
}

/**
 * متن مقاله با یک نمودار خودکار؛ اگر مقاله از قبل نمودار دارد یا ساختار
 * مناسبی پیدا نشد، null.
 */
export function withAutoFigure(markdown: string): { content: string; kind: string } | null {
  if (hasFigures(markdown)) return null;
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const lists = scanLists(lines);
  const pick = lists.ordered ?? lists.bullets ?? overviewOfHeadings(lines);
  if (!pick) return null;

  const before = lines.slice(0, pick.at);
  while (before.length && !before[before.length - 1].trim()) before.pop();
  const after = lines.slice(pick.at);
  const content = [...before, '', pick.block, '', ...after].join('\n');

  // اطمینان: نمودار باید واقعاً خوانده شود
  if (!hasFigures(content)) return null;
  const kind = /^:::figure (\w+)/.exec(pick.block)?.[1] ?? 'steps';
  return { content, kind };
}
