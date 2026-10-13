/**
 * تبدیل مارک‌داون مقاله‌ها به HTML — بدون کتابخانه بیرونی.
 *
 * چرا دستی؟ خروجی باید دقیقاً چیزی باشد که برای سئو می‌خواهیم:
 *  • هر تیتر شناسه (id) می‌گیرد تا فهرست مطالب و لینک به بخش‌ها کار کند،
 *  • تیتر سطح یک به h2 تبدیل می‌شود چون h1 صفحه، عنوان مقاله است،
 *  • تصویرها lazy و با alt اجباری رندر می‌شوند،
 *  • لینک بیرونی rel مناسب می‌گیرد،
 *  • هیچ HTML خامی از متن عبور نمی‌کند (همه چیز escape می‌شود).
 */

import { slugify } from './slugify';

export type TocItem = { id: string; text: string; level: 2 | 3 };

export type RenderedMarkdown = {
  html: string;
  toc: TocItem[];
  /** متن خالی بدون نشانه‌گذاری — برای خلاصه و شمارش کلمه */
  text: string;
  wordCount: number;
  readingMinutes: number;
  /** آدرس تصویرهای داخل متن */
  images: { src: string; alt: string }[];
  links: { href: string; text: string; external: boolean }[];
};

const CALLOUTS: Record<string, { label: string; tone: string }> = {
  note: { label: 'یادداشت', tone: 'note' },
  info: { label: 'یادداشت', tone: 'note' },
  tip: { label: 'نکته', tone: 'tip' },
  warning: { label: 'هشدار', tone: 'warning' },
  danger: { label: 'هشدار', tone: 'warning' },
};

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** آدرس‌های خطرناک (javascript: و data:) اجازه ندارند */
function safeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^(javascript|vbscript|file):/i.test(trimmed)) return '#';
  if (/^data:/i.test(trimmed) && !/^data:image\//i.test(trimmed)) return '#';
  return trimmed;
}

function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href) || href.startsWith('//');
}

/**
 * آیا این آدرس به دامنه‌های خودمان می‌رود؟
 *
 * پنل ابری روی دامنه دیگری است (مثل cloud.example.com) ولی مال خودمان
 * است: نه باید nofollow بخورد و نه باید لینک «بیرونی» حساب شود، چون در
 * واقع لینک داخلی مجموعه ماست.
 */
function isOwnHost(href: string, ownHosts: string[]): boolean {
  if (!ownHosts.length || !isExternal(href)) return false;
  try {
    const host = new URL(href.startsWith('//') ? `https:${href}` : href).host.toLowerCase();
    return ownHosts.some((own) => host === own || host.endsWith(`.${own}`));
  } catch {
    return false;
  }
}

/** متن داخل خط: پررنگ، مورب، کد، لینک و تصویر */
function inline(
  raw: string,
  collect?: { images: { src: string; alt: string }[]; links: { href: string; text: string; external: boolean }[] },
  ownHosts: string[] = [],
): string {
  let out = escapeHtml(raw);

  // کد درون‌خطی پیش از بقیه، تا ستاره و زیرخط داخلش دست‌نخورده بماند
  const codes: string[] = [];
  out = out.replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(code);
    return `\u0000CODE${codes.length - 1}\u0000`;
  });

  // تصویر: ![alt](src "title")
  out = out.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g,
    (_m, alt: string, src: string, title?: string) => {
      const url = safeUrl(src);
      collect?.images.push({ src: url, alt });
      const titleAttr = title ? ` title="${title}"` : '';
      return `<img src="${url}" alt="${alt}" loading="lazy" decoding="async"${titleAttr} />`;
    },
  );

  // لینک: [متن](href)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_m, text: string, href: string, title?: string) => {
    const url = safeUrl(href);
    const own = isOwnHost(url, ownHosts);
    const external = isExternal(url) && !own;
    collect?.links.push({ href: url, text: text.replace(/<[^>]+>/g, ''), external });
    const titleAttr = title ? ` title="${title}"` : '';
    // لینک دامنه خودمان در تب تازه باز می‌شود ولی nofollow نمی‌خورد
    const extra = external ? ' target="_blank" rel="noopener nofollow"' : own ? ' rel="noopener"' : '';
    return `<a href="${url}"${titleAttr}${extra}>${text}</a>`;
  });

  out = out
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');

  out = out.replace(/\u0000CODE(\d+)\u0000/g, (_m, i: string) => `<code>${escapeHtml(codes[Number(i)])}</code>`);

  return out;
}

function headingId(text: string, used: Set<string>): string {
  const base = slugify(text.replace(/<[^>]+>/g, '')) || 'section';
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

export type RenderOptions = {
  /** دامنه‌های خودمان (بدون پروتکل)، مثل ['example.com', 'cloud.example.com'] */
  ownHosts?: string[];
};

export function renderMarkdown(markdown: string, options: RenderOptions = {}): RenderedMarkdown {
  const ownHosts = (options.ownHosts ?? []).map((h) => h.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''));
  const src = (markdown ?? '').replace(/\r\n/g, '\n').replace(/\t/g, '  ');
  const lines = src.split('\n');

  const html: string[] = [];
  const toc: TocItem[] = [];
  const plain: string[] = [];
  const usedIds = new Set<string>();
  const collect = {
    images: [] as { src: string; alt: string }[],
    links: [] as { href: string; text: string; external: boolean }[],
  };

  let i = 0;

  const flushParagraph = (buffer: string[]) => {
    if (!buffer.length) return;
    const text = buffer.join(' ').trim();
    if (!text) return;
    plain.push(text);
    // تصویر تنها در یک پاراگراف، داخل figure با توضیح می‌رود
    const soloImage = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/.exec(text);
    if (soloImage) {
      const [, alt, srcRaw, caption] = soloImage;
      const url = safeUrl(srcRaw);
      collect.images.push({ src: url, alt });
      html.push(
        `<figure><img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" />` +
          (caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : '') +
          `</figure>`,
      );
      return;
    }
    html.push(`<p>${inline(text, collect, ownHosts)}</p>`);
  };

  let paragraph: string[] = [];

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // ── خط خالی ──
    if (!trimmed) {
      flushParagraph(paragraph);
      paragraph = [];
      i++;
      continue;
    }

    // ── بلوک کد ──
    const fence = /^```+\s*([a-zA-Z0-9+#-]*)\s*$/.exec(trimmed);
    if (fence) {
      flushParagraph(paragraph);
      paragraph = [];
      const lang = fence[1] ?? '';
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```+\s*$/.test(lines[i].trim())) {
        body.push(lines[i]);
        i++;
      }
      i++; // رد کردن خط بستن
      const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      html.push(`<pre dir="ltr"><code${cls}>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }

    // ── جعبه نکته/هشدار: ::: tip ... ::: ──
    const callout = /^:::\s*([a-z]+)\s*(.*)$/.exec(trimmed);
    if (callout) {
      flushParagraph(paragraph);
      paragraph = [];
      const kind = CALLOUTS[callout[1]] ?? CALLOUTS.note;
      const title = callout[2]?.trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^:::\s*$/.test(lines[i].trim())) {
        body.push(lines[i]);
        i++;
      }
      i++;
      const inner = renderMarkdown(body.join('\n'), options);
      plain.push(inner.text);
      html.push(
        `<aside class="callout callout-${kind.tone}">` +
          `<p class="callout-title">${escapeHtml(title || kind.label)}</p>${inner.html}</aside>`,
      );
      continue;
    }

    // ── تیترها ──
    const heading = /^(#{1,6})\s+(.+?)\s*#*$/.exec(trimmed);
    if (heading) {
      flushParagraph(paragraph);
      paragraph = [];
      const raw = heading[2].trim();
      // h1 به h2 تبدیل می‌شود؛ هر صفحه فقط یک h1 دارد و آن عنوان مقاله است
      const level = Math.min(6, Math.max(2, heading[1].length === 1 ? 2 : heading[1].length));
      const id = headingId(raw, usedIds);
      const content = inline(raw, collect, ownHosts);
      plain.push(raw);
      if (level === 2 || level === 3) toc.push({ id, text: raw.replace(/[*`~]/g, ''), level });
      html.push(`<h${level} id="${id}">${content}</h${level}>`);
      i++;
      continue;
    }

    // ── خط جداکننده ──
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph(paragraph);
      paragraph = [];
      html.push('<hr />');
      i++;
      continue;
    }

    // ── نقل قول ──
    if (trimmed.startsWith('>')) {
      flushParagraph(paragraph);
      paragraph = [];
      const body: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        body.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      const inner = renderMarkdown(body.join('\n'), options);
      plain.push(inner.text);
      html.push(`<blockquote>${inner.html}</blockquote>`);
      continue;
    }

    // ── جدول ──
    if (trimmed.startsWith('|') && i + 1 < lines.length && /^\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1].trim())) {
      flushParagraph(paragraph);
      paragraph = [];
      const cells = (row: string) =>
        row
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim());

      const head = cells(lines[i]);
      i += 2;
      const body: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        body.push(cells(lines[i]));
        i++;
      }
      plain.push([...head, ...body.flat()].join(' '));
      html.push(
        `<div class="table-wrap"><table><thead><tr>${head
          .map((c) => `<th>${inline(c, collect, ownHosts)}</th>`)
          .join('')}</tr></thead><tbody>${body
          .map((row) => `<tr>${row.map((c) => `<td>${inline(c, collect, ownHosts)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`,
      );
      continue;
    }

    // ── فهرست‌ها ──
    const bullet = /^[-*+]\s+(.+)$/.exec(trimmed);
    const ordered = /^(\d+)[.)]\s+(.+)$/.exec(trimmed);
    if (bullet || ordered) {
      flushParagraph(paragraph);
      paragraph = [];
      const isOrdered = Boolean(ordered);
      const items: string[] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        const b = /^[-*+]\s+(.+)$/.exec(t);
        const o = /^(\d+)[.)]\s+(.+)$/.exec(t);
        if (isOrdered && o) items.push(o[2]);
        else if (!isOrdered && b) items.push(b[1]);
        else if (t && /^\s{2,}/.test(lines[i]) && items.length) items[items.length - 1] += ` ${t}`;
        else break;
        i++;
      }
      plain.push(items.join(' '));
      const tag = isOrdered ? 'ol' : 'ul';
      const start = isOrdered && ordered && ordered[1] !== '1' ? ` start="${Number(ordered[1])}"` : '';
      html.push(`<${tag}${start}>${items.map((it) => `<li>${inline(it, collect, ownHosts)}</li>`).join('')}</${tag}>`);
      continue;
    }

    paragraph.push(trimmed);
    i++;
  }

  flushParagraph(paragraph);

  const text = plain.join(' ').replace(/\s+/g, ' ').trim();
  const wordCount = text ? text.split(/\s+/).length : 0;
  // سرعت مطالعه فارسی را حدود ۲۰۰ کلمه در دقیقه می‌گیریم
  const readingMinutes = Math.max(1, Math.round(wordCount / 200));

  return { html: html.join('\n'), toc, text, wordCount, readingMinutes, images: collect.images, links: collect.links };
}

/** متن خالی مارک‌داون — برای ساخت خلاصه خودکار و توضیحات متا */
export function markdownToText(markdown: string): string {
  return renderMarkdown(markdown).text;
}

/** خلاصه خودکار از ابتدای متن، بدون بریدن وسط کلمه */
export function autoExcerpt(markdown: string, maxLength = 160): string {
  const text = markdownToText(markdown);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).replace(/\s+\S*$/, '')}…`;
}
