import { brandScale, normalizeHex } from '../brand';
import { FONT_FAMILY, escapeXml, faDigits, svgText, wrapText, type Measure } from './engine';
import { FIG, figureSize, type FigureSpec } from './figure-spec';

/**
 * کشیدن نمودارهای داخل مقاله.
 *
 * نمودار برای «توضیح» است، نه تزئین: مراحل یک کار، جریان یک درخواست،
 * مقایسه دو گزینه، فهرست بررسی و مشخصات یک پلن. همه با رنگ برند و پس‌زمینه
 * روشن، تا هم در حالت روشن و هم تاریک سایت خوانا باشند.
 */

export type FigureBrand = { color: string; domain: string };

const r1 = (n: number) => Math.round(n * 10) / 10;

function text(
  x: number,
  y: number,
  value: string,
  size: number,
  weight: 500 | 700 | 800,
  fill: string,
  anchor: 'start' | 'middle' | 'end' = 'end',
) {
  return `<text x="${r1(x)}" y="${r1(y)}" font-family="${FONT_FAMILY}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${svgText(value)}</text>`;
}

/** متن چندخطی در یک کادر، با کوچک شدن خودکار اگر جا نشد */
function block(
  value: string,
  opts: {
    x: number;
    cy: number;
    width: number;
    sizes: number[];
    maxLines: number;
    weight: 500 | 700 | 800;
    fill: string;
    anchor?: 'start' | 'middle' | 'end';
    measure: Measure;
  },
) {
  let size = opts.sizes[opts.sizes.length - 1];
  let lines: string[] = [value];
  for (const candidate of opts.sizes) {
    const wrapped = wrapText(value, opts.width, candidate, opts.weight, opts.maxLines, opts.measure);
    size = candidate;
    lines = wrapped.lines;
    if (!wrapped.overflow) break;
  }
  const lh = Math.round(size * 1.38);
  const top = opts.cy - ((lines.length - 1) * lh) / 2 + size * 0.36;
  return lines.map((line, i) => text(opts.x, top + i * lh, line, size, opts.weight, opts.fill, opts.anchor)).join('');
}

export function buildFigureSvg(spec: FigureSpec, brand: FigureBrand, measure: Measure): string {
  const { width: W, height: H } = figureSize(spec);
  const c = brandScale(normalizeHex(brand.color));
  const P = FIG.pad;
  const right = W - P;
  const inner = W - P * 2;

  let body = '';
  const top = FIG.header;

  switch (spec.kind) {
    case 'steps': {
      const n = spec.items.length;
      // خط پیوند میان دایره‌ها
      body += `<path d="M${right - 32} ${top + FIG.stepRow / 2} V${top + (n - 0.5) * FIG.stepRow}" stroke="${c[200]}" stroke-width="4" stroke-dasharray="2 10" stroke-linecap="round"/>`;
      spec.items.forEach((item, i) => {
        const cy = top + i * FIG.stepRow + FIG.stepRow / 2;
        body += `<circle cx="${right - 32}" cy="${cy}" r="30" fill="${c[600]}"/>`;
        body += text(right - 32, cy + 11, faDigits(i + 1), 30, 800, '#fff', 'middle');
        body += `<rect x="${P}" y="${cy - 40}" width="${inner - 84}" height="80" rx="18" fill="#fff" stroke="${c[100]}" stroke-width="2"/>`;
        body += block(item, {
          x: right - 106,
          cy,
          width: inner - 84 - 52,
          sizes: [30, 27, 24],
          maxLines: 2,
          weight: 700,
          fill: c[950],
          measure,
        });
      });
      break;
    }

    case 'flow': {
      const n = spec.items.length;
      const gap = 60;
      const boxW = (inner - gap * (n - 1)) / n;
      const boxH = FIG.flowBox - 40;
      const y = top + 20;
      spec.items.forEach((item, i) => {
        // جریان راست‌به‌چپ: گام اول سمت راست
        const x = right - boxW - i * (boxW + gap);
        const last = i === n - 1;
        body += `<rect x="${r1(x)}" y="${y}" width="${r1(boxW)}" height="${boxH}" rx="22" fill="${last ? c[600] : '#fff'}" stroke="${last ? c[600] : c[200]}" stroke-width="2"/>`;
        body += `<circle cx="${r1(x + boxW - 30)}" cy="${y + 30}" r="16" fill="${last ? '#fff' : c[100]}"/>`;
        body += text(x + boxW - 30, y + 37, faDigits(i + 1), 18, 800, last ? c[700] : c[700], 'middle');
        body += block(item, {
          x: x + boxW / 2,
          cy: y + boxH / 2 + 12,
          width: boxW - 36,
          sizes: n > 3 ? [24, 22, 20] : [28, 25, 22],
          maxLines: 3,
          weight: 700,
          fill: last ? '#fff' : c[950],
          anchor: 'middle',
          measure,
        });
        if (!last) {
          const ax = x - gap / 2;
          const ay = y + boxH / 2;
          body += `<path d="M${r1(ax + 14)} ${ay} H${r1(ax - 12)} M${r1(ax - 4)} ${ay - 9} L${r1(ax - 13)} ${ay} L${r1(ax - 4)} ${ay + 9}" fill="none" stroke="${c[500]}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
        }
      });
      break;
    }

    case 'compare': {
      const labelW = inner * 0.34;
      const colW = (inner - labelW) / 2;
      const colA = right - labelW;
      const colB = colA - colW;
      // سرستون‌ها
      [spec.columns[0], spec.columns[1]].forEach((name, i) => {
        const x = (i === 0 ? colA : colB) - colW;
        body += `<rect x="${r1(x + 8)}" y="${top}" width="${r1(colW - 16)}" height="${FIG.compareHead - 16}" rx="16" fill="${i === 0 ? c[600] : c[900]}"/>`;
        body += block(name, {
          x: x + colW / 2,
          cy: top + (FIG.compareHead - 16) / 2,
          width: colW - 48,
          sizes: [26, 23, 20],
          maxLines: 1,
          weight: 800,
          fill: '#fff',
          anchor: 'middle',
          measure,
        });
      });
      spec.rows.forEach((row, i) => {
        const y = top + FIG.compareHead + i * FIG.compareRow;
        const cy = y + FIG.compareRow / 2;
        if (i % 2 === 0) body += `<rect x="${P}" y="${y}" width="${inner}" height="${FIG.compareRow}" rx="14" fill="#fff"/>`;
        body += block(row.label, {
          x: right - 20,
          cy,
          width: labelW - 36,
          sizes: [25, 22, 20],
          maxLines: 2,
          weight: 800,
          fill: c[950],
          measure,
        });
        body += block(row.a, {
          x: colA - colW / 2,
          cy,
          width: colW - 36,
          sizes: [24, 21, 19],
          maxLines: 2,
          weight: 500,
          fill: c[900],
          anchor: 'middle',
          measure,
        });
        body += block(row.b, {
          x: colB - colW / 2,
          cy,
          width: colW - 36,
          sizes: [24, 21, 19],
          maxLines: 2,
          weight: 500,
          fill: c[900],
          anchor: 'middle',
          measure,
        });
      });
      break;
    }

    case 'checklist': {
      const twoCols = spec.items.length >= 5;
      const perCol = twoCols ? Math.ceil(spec.items.length / 2) : spec.items.length;
      const colW = twoCols ? (inner - 32) / 2 : inner;
      spec.items.forEach((item, i) => {
        const col = twoCols ? Math.floor(i / perCol) : 0;
        const row = twoCols ? i % perCol : i;
        const xr = right - col * (colW + 32);
        const cy = top + row * FIG.checkRow + FIG.checkRow / 2;
        body += `<rect x="${r1(xr - colW)}" y="${cy - 30}" width="${r1(colW)}" height="60" rx="16" fill="#fff" stroke="${c[100]}" stroke-width="2"/>`;
        body += `<circle cx="${r1(xr - 34)}" cy="${cy}" r="17" fill="#10b981"/>`;
        body += `<path d="M${r1(xr - 42)} ${cy} l6 6 l11 -12" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
        body += block(item, {
          x: xr - 64,
          cy,
          width: colW - 88,
          sizes: [25, 22, 20],
          maxLines: 1,
          weight: 700,
          fill: c[950],
          measure,
        });
      });
      break;
    }

    case 'specs': {
      const perRow = Math.min(3, spec.items.length);
      const gap = FIG.specGap;
      const cardW = (inner - gap * (perRow - 1)) / perRow;
      spec.items.forEach((item, i) => {
        const row = Math.floor(i / 3);
        const col = i % 3;
        const x = right - cardW - col * (cardW + gap);
        const y = top + row * (FIG.specCard + gap);
        body += `<rect x="${r1(x)}" y="${y}" width="${r1(cardW)}" height="${FIG.specCard}" rx="22" fill="#fff" stroke="${c[100]}" stroke-width="2"/>`;
        body += `<rect x="${r1(x + cardW / 2 - 24)}" y="${y + 18}" width="48" height="6" rx="3" fill="${c[300]}"/>`;
        body += block(item.value, {
          x: x + cardW / 2,
          cy: y + 72,
          width: cardW - 40,
          sizes: [44, 38, 32, 28],
          maxLines: 1,
          weight: 800,
          fill: c[700],
          anchor: 'middle',
          measure,
        });
        body += block(item.label, {
          x: x + cardW / 2,
          cy: y + 118,
          width: cardW - 40,
          sizes: [24, 21, 19],
          maxLines: 1,
          weight: 500,
          fill: c[900],
          anchor: 'middle',
          measure,
        });
      });
      break;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="30" fill="${c[50]}" stroke="${c[100]}" stroke-width="2"/>
  ${block(spec.title, { x: right, cy: 70, width: inner - 120, sizes: [40, 36, 32, 28], maxLines: 1, weight: 800, fill: c[950], measure })}
  <rect x="${right - 72}" y="104" width="72" height="7" rx="3.5" fill="${c[500]}"/>
  ${body}
  <text x="${P}" y="${H - 26}" font-family="${FONT_FAMILY}" font-size="18" font-weight="500" fill="${c[400]}">${escapeXml(brand.domain)}</text>
</svg>`;
}
