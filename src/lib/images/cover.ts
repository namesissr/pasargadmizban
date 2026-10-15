import { brandScale, normalizeHex } from '../brand';
import { FONT_FAMILY, escapeXml, svgText, wrapText, type Measure } from './engine';

/**
 * طراحی کاور مقاله.
 *
 * هر کاور از چهار لایه ساخته می‌شود: پس‌زمینه گرادیانی با رنگ برند، یک
 * الگوی ظریف (نقطه، شبکه، مدار، حلقه یا راه‌راه)، یک تصویرسازی برداری که از
 * موضوع مقاله انتخاب می‌شود (سرور، ترمینال، سپر امنیتی، شبکه، ابر…) و متن:
 * دسته، عنوان و نام برند.
 *
 * همه انتخاب‌ها از روی نشانی مقاله «تصادفیِ تکرارپذیر» است: هر مقاله همیشه
 * همان کاور را می‌گیرد، ولی دو مقاله کنار هم شبیه هم نمی‌شوند. با عدد
 * variant می‌شود طرح دیگری از همان مقاله ساخت.
 */

export type CoverRatio = 'og' | '16x9' | '4x3' | '1x1';

export const COVER_SIZES: Record<CoverRatio, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  '16x9': { width: 1200, height: 675 },
  '4x3': { width: 1200, height: 900 },
  '1x1': { width: 1200, height: 1200 },
};

export type Topic =
  | 'security'
  | 'terminal'
  | 'database'
  | 'email'
  | 'web'
  | 'network'
  | 'speed'
  | 'cloud'
  | 'server';

export const TOPIC_FA: Record<Topic, string> = {
  security: 'امنیت',
  terminal: 'ترمینال و لینوکس',
  database: 'دیتابیس و بکاپ',
  email: 'ایمیل',
  web: 'وب و دامنه',
  network: 'شبکه و آی‌پی',
  speed: 'سرعت و بهینه‌سازی',
  cloud: 'ابری',
  server: 'سرور',
};

/** ترتیب مهم است: «امن‌سازی سرور اوبونتو» باید امنیت باشد، نه ترمینال */
const TOPIC_RULES: [Topic, RegExp][] = [
  ['security', /امنیت|امن[\s‌]?سازی|ایمن|فایروال|firewall|ddos|دیداس|حمله|هک|ssl|tls|گواهی|رمز\s?عبور|احراز|fail2ban|security|بدافزار/i],
  ['terminal', /ssh|ترمینال|خط\s?فرمان|دستور|لینوکس|linux|ubuntu|اوبونتو|دبیان|debian|centos|bash|شل|cli|putty|پاتی/i],
  ['database', /دیتابیس|پایگاه\s?داده|mysql|mariadb|postgres|mongodb|redis|database|بکاپ|پشتیبان[\s‌]?گیری|backup|اسنپ[\s‌]?شات|snapshot/i],
  ['email', /ایمیل|email|e-mail|mail|smtp|میل[\s‌]?سرور/i],
  ['speed', /سرعت|بهینه[\s‌]?سازی|کش|cache|performance|تاخیر|latency|cdn/i],
  ['server', /خرید|قیمت|تعرفه|ارزان/i],
  ['network', /آی[\s‌]?پی|\bip\b|شبکه|فیلتر|پینگ|ping|dns|پورت|port|ترافیک|پهنای\s?باند|مسیریابی|network/i],
  ['web', /دامنه|domain|وردپرس|wordpress|nginx|apache|وب[\s‌]?سرور|وب[\s‌]?سایت|سایت|http|سی[\s‌]?پنل|cpanel|directadmin|هاست/i],
  ['cloud', /ابری|ابر\b|cloud|مقیاس|kubernetes|docker|داکر|کانتینر/i],
  ['server', /سرور|vps|مجازی|اختصاصی|dedicated|میزبانی/i],
];

/**
 * موضوع از روی عنوان؛ اگر عنوان چیزی نگفت، از متن‌های کمکی (دسته، کلیدواژه،
 * برچسب). عنوان مقدم است چون دسته‌ها کلی‌اند: «چرا آی‌پی سرور باز نمی‌شود»
 * در دسته «امنیت و شبکه» هم موضوعش شبکه است، نه امنیت.
 */
export function detectTopic(title: string, ...hints: (string | null | undefined)[]): Topic {
  for (const source of [title, hints.filter(Boolean).join(' ')]) {
    if (!source) continue;
    for (const [topic, rule] of TOPIC_RULES) if (rule.test(source)) return topic;
  }
  return 'server';
}

/* ───────────────────────  تصادفی تکرارپذیر  ─────────────────────── */

function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/* ───────────────────────  الگوی پس‌زمینه  ─────────────────────── */

type Pattern = 'dots' | 'grid' | 'circuit' | 'rings' | 'stripes';
const PATTERNS: Pattern[] = ['dots', 'grid', 'circuit', 'rings', 'stripes'];

function pattern(kind: Pattern, w: number, h: number, rand: () => number): string {
  const stroke = 'rgba(255,255,255,0.07)';
  switch (kind) {
    case 'dots': {
      let out = '';
      for (let y = 30; y < h; y += 34) for (let x = 30; x < w; x += 34) out += `<circle cx="${x}" cy="${y}" r="1.6"/>`;
      return `<g fill="rgba(255,255,255,0.10)">${out}</g>`;
    }
    case 'grid': {
      let out = '';
      for (let x = 0; x <= w; x += 60) out += `<line x1="${x}" y1="0" x2="${x}" y2="${h}"/>`;
      for (let y = 0; y <= h; y += 60) out += `<line x1="0" y1="${y}" x2="${w}" y2="${y}"/>`;
      return `<g stroke="${stroke}" stroke-width="1">${out}</g>`;
    }
    case 'circuit': {
      // مسیرهای عمودی-افقی شبیه مدار چاپی، با گره در انتهای هر مسیر
      let out = '';
      for (let i = 0; i < 22; i++) {
        let x = Math.round((rand() * w) / 30) * 30;
        let y = Math.round((rand() * h) / 30) * 30;
        let d = `M${x} ${y}`;
        for (let s = 0; s < 3; s++) {
          if (rand() > 0.5) x += (rand() > 0.5 ? 1 : -1) * 30 * (1 + Math.floor(rand() * 4));
          else y += (rand() > 0.5 ? 1 : -1) * 30 * (1 + Math.floor(rand() * 4));
          d += ` L${x} ${y}`;
        }
        out += `<path d="${d}" fill="none"/><circle cx="${x}" cy="${y}" r="4" fill="rgba(255,255,255,0.12)" stroke="none"/>`;
      }
      return `<g stroke="rgba(255,255,255,0.09)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${out}</g>`;
    }
    case 'rings': {
      const cx = rand() > 0.5 ? w * 0.08 : w * 0.92;
      const cy = rand() > 0.5 ? h * 0.1 : h * 0.9;
      let out = '';
      for (let r = 80; r < Math.max(w, h) * 1.2; r += 70) out += `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r}"/>`;
      return `<g fill="none" stroke="${stroke}" stroke-width="1.5">${out}</g>`;
    }
    case 'stripes': {
      let out = '';
      for (let x = -h; x < w; x += 46) out += `<line x1="${x}" y1="${h}" x2="${x + h}" y2="0"/>`;
      return `<g stroke="rgba(255,255,255,0.05)" stroke-width="14">${out}</g>`;
    }
  }
}

/* ───────────────────────  تصویرسازی موضوعی  ─────────────────────── */

type Palette = Record<number, string>;

/** هر صحنه در یک مربع s×s با گوشه (x, y) کشیده می‌شود */
function scene(topic: Topic, x: number, y: number, s: number, c: Palette): string {
  const glass = 'rgba(255,255,255,0.10)';
  const line = 'rgba(255,255,255,0.38)';
  const soft = 'rgba(255,255,255,0.22)';
  const u = s / 100; // یکای نسبی

  const rack = (rx: number, ry: number, rw: number, rh: number, led: string) => `
    <rect x="${r1(rx)}" y="${r1(ry)}" width="${r1(rw)}" height="${r1(rh)}" rx="${r1(rh * 0.22)}" fill="${glass}" stroke="${line}" stroke-width="${r1(u * 0.7)}"/>
    ${[0, 1, 2].map((i) => `<rect x="${r1(rx + rw * 0.08)}" y="${r1(ry + rh * (0.32 + i * 0.14))}" width="${r1(rw * 0.32)}" height="${r1(rh * 0.07)}" rx="${r1(rh * 0.035)}" fill="${soft}"/>`).join('')}
    <circle cx="${r1(rx + rw * 0.8)}" cy="${r1(ry + rh / 2)}" r="${r1(rh * 0.1)}" fill="${led}"/>
    <circle cx="${r1(rx + rw * 0.9)}" cy="${r1(ry + rh / 2)}" r="${r1(rh * 0.1)}" fill="${c[300]}"/>`;

  const chip = (cx: number, cy: number, minW: number, label: string) => {
    const w = Math.max(minW, label.length * u * 4 + u * 8);
    return `
    <rect x="${r1(cx - w / 2)}" y="${r1(cy - u * 6)}" width="${r1(w)}" height="${r1(u * 12)}" rx="${r1(u * 6)}" fill="${c[50]}" fill-opacity="0.95"/>
    <text x="${r1(cx)}" y="${r1(cy + u * 2.6)}" font-family="${FONT_FAMILY}" font-size="${r1(u * 6.4)}" font-weight="800" fill="${c[800]}" text-anchor="middle">${escapeXml(label)}</text>`;
  };

  const halo = `<circle cx="${r1(x + s / 2)}" cy="${r1(y + s / 2)}" r="${r1(s * 0.48)}" fill="url(#halo)"/>`;

  switch (topic) {
    case 'server':
      return `${halo}
        ${rack(x + u * 14, y + u * 18, u * 72, u * 18, '#4ade80')}
        ${rack(x + u * 14, y + u * 41, u * 72, u * 18, '#4ade80')}
        ${rack(x + u * 14, y + u * 64, u * 72, u * 18, '#facc15')}
        ${chip(x + u * 20, y + u * 11, u * 26, 'ONLINE')}`;

    case 'cloud': {
      const d = `M${r1(x + u * 28)} ${r1(y + u * 66)} h${r1(u * 46)} a${r1(u * 15)} ${r1(u * 15)} 0 0 0 ${r1(u * 2)} -${r1(u * 29.8)} a${r1(u * 20)} ${r1(u * 20)} 0 0 0 -${r1(u * 37)} -${r1(u * 6)} a${r1(u * 14)} ${r1(u * 14)} 0 0 0 -${r1(u * 11)} ${r1(u * 35.8)} z`;
      return `${halo}
        <path d="${d}" fill="${glass}" stroke="${line}" stroke-width="${r1(u * 0.9)}" stroke-linejoin="round"/>
        <path d="M${r1(x + u * 50)} ${r1(y + u * 58)} v-${r1(u * 18)} m-${r1(u * 7)} ${r1(u * 7)} l${r1(u * 7)} -${r1(u * 7)} l${r1(u * 7)} ${r1(u * 7)}" fill="none" stroke="#fff" stroke-width="${r1(u * 1.6)}" stroke-linecap="round" stroke-linejoin="round"/>
        ${rack(x + u * 16, y + u * 76, u * 30, u * 11, '#4ade80')}
        ${rack(x + u * 54, y + u * 76, u * 30, u * 11, '#4ade80')}
        <path d="M${r1(x + u * 31)} ${r1(y + u * 76)} v-${r1(u * 6)} M${r1(x + u * 69)} ${r1(y + u * 76)} v-${r1(u * 6)}" stroke="${soft}" stroke-width="${r1(u * 0.8)}" stroke-dasharray="${r1(u * 1.6)} ${r1(u * 1.6)}"/>`;
    }

    case 'terminal': {
      const wx = x + u * 6;
      const wy = y + u * 16;
      const ww = u * 88;
      const wh = u * 66;
      const mono = `font-family="${FONT_FAMILY}" font-weight="700" font-size="${r1(u * 5.6)}"`;
      return `${halo}
        <rect x="${r1(wx)}" y="${r1(wy)}" width="${r1(ww)}" height="${r1(wh)}" rx="${r1(u * 5)}" fill="rgba(3,7,18,0.55)" stroke="${line}" stroke-width="${r1(u * 0.8)}"/>
        <path d="M${r1(wx)} ${r1(wy + u * 11)} h${r1(ww)}" stroke="${soft}" stroke-width="${r1(u * 0.6)}"/>
        <circle cx="${r1(wx + u * 6)}" cy="${r1(wy + u * 5.5)}" r="${r1(u * 1.7)}" fill="#f87171"/>
        <circle cx="${r1(wx + u * 11.5)}" cy="${r1(wy + u * 5.5)}" r="${r1(u * 1.7)}" fill="#facc15"/>
        <circle cx="${r1(wx + u * 17)}" cy="${r1(wy + u * 5.5)}" r="${r1(u * 1.7)}" fill="#4ade80"/>
        <text x="${r1(wx + u * 6)}" y="${r1(wy + u * 24)}" ${mono} fill="${c[300]}">$ <tspan fill="#fff">ssh root@server</tspan></text>
        <text x="${r1(wx + u * 6)}" y="${r1(wy + u * 35)}" ${mono} fill="rgba(255,255,255,0.55)">Welcome to Ubuntu</text>
        <text x="${r1(wx + u * 6)}" y="${r1(wy + u * 46)}" ${mono} fill="${c[300]}">$ <tspan fill="#fff">apt update</tspan></text>
        <rect x="${r1(wx + u * 6)}" y="${r1(wy + u * 52)}" width="${r1(u * 3.6)}" height="${r1(u * 6)}" fill="#fff" fill-opacity="0.85"/>`;
    }

    case 'security': {
      const cx = x + s / 2;
      const top = y + u * 14;
      const shield = `M${r1(cx)} ${r1(top)} l${r1(u * 30)} ${r1(u * 11)} v${r1(u * 22)} c0 ${r1(u * 22)} -${r1(u * 13)} ${r1(u * 34)} -${r1(u * 30)} ${r1(u * 42)} c-${r1(u * 17)} -${r1(u * 8)} -${r1(u * 30)} -${r1(u * 20)} -${r1(u * 30)} -${r1(u * 42)} v-${r1(u * 22)} z`;
      const dots = Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * Math.PI * 2;
        return `<circle cx="${r1(cx + Math.cos(a) * u * 44)}" cy="${r1(y + s / 2 + Math.sin(a) * u * 44)}" r="${r1(u * (i % 3 === 0 ? 1.4 : 0.8))}" fill="rgba(255,255,255,${i % 3 === 0 ? 0.45 : 0.22})"/>`;
      }).join('');
      return `${halo}${dots}
        <path d="${shield}" fill="${glass}" stroke="${line}" stroke-width="${r1(u * 1)}" stroke-linejoin="round"/>
        <path d="M${r1(cx - u * 11)} ${r1(top + u * 38)} l${r1(u * 8)} ${r1(u * 8)} l${r1(u * 15)} -${r1(u * 16)}" fill="none" stroke="#4ade80" stroke-width="${r1(u * 3)}" stroke-linecap="round" stroke-linejoin="round"/>
        ${chip(x + u * 80, y + u * 82, u * 22, 'SSL')}`;
    }

    case 'network': {
      const cx = x + s / 2;
      const cy = y + s / 2;
      const R = u * 26;
      const nodes = [
        [cx - u * 40, cy - u * 30],
        [cx + u * 40, cy - u * 32],
        [cx + u * 42, cy + u * 30],
        [cx - u * 38, cy + u * 34],
      ];
      return `${halo}
        ${nodes.map(([nx, ny]) => `<path d="M${r1(cx)} ${r1(cy)} L${r1(nx)} ${r1(ny)}" stroke="${soft}" stroke-width="${r1(u * 0.8)}" stroke-dasharray="${r1(u * 2)} ${r1(u * 1.6)}"/>`).join('')}
        <circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(R)}" fill="${glass}" stroke="${line}" stroke-width="${r1(u * 0.9)}"/>
        <ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(R * 0.45)}" ry="${r1(R)}" fill="none" stroke="${soft}" stroke-width="${r1(u * 0.7)}"/>
        <path d="M${r1(cx - R)} ${r1(cy)} H${r1(cx + R)} M${r1(cx - R * 0.86)} ${r1(cy - R * 0.5)} H${r1(cx + R * 0.86)} M${r1(cx - R * 0.86)} ${r1(cy + R * 0.5)} H${r1(cx + R * 0.86)}" stroke="${soft}" stroke-width="${r1(u * 0.7)}"/>
        ${nodes.map(([nx, ny], i) => `<circle cx="${r1(nx)}" cy="${r1(ny)}" r="${r1(u * 5)}" fill="${i % 2 ? c[300] : '#fff'}" fill-opacity="0.9"/>`).join('')}
        ${chip(cx, y + u * 92, u * 34, '192.168.1.1')}`;
    }

    case 'speed': {
      const cx = x + s / 2;
      const cy = y + u * 60;
      const R = u * 36;
      const arc = (from: number, to: number) => {
        const a1 = (from * Math.PI) / 180;
        const a2 = (to * Math.PI) / 180;
        return `M${r1(cx + Math.cos(a1) * R)} ${r1(cy + Math.sin(a1) * R)} A${r1(R)} ${r1(R)} 0 ${to - from > 180 ? 1 : 0} 1 ${r1(cx + Math.cos(a2) * R)} ${r1(cy + Math.sin(a2) * R)}`;
      };
      const ticks = Array.from({ length: 11 }, (_, i) => {
        const a = ((160 + i * 22) * Math.PI) / 180;
        return `<path d="M${r1(cx + Math.cos(a) * R * 0.78)} ${r1(cy + Math.sin(a) * R * 0.78)} L${r1(cx + Math.cos(a) * R * 0.9)} ${r1(cy + Math.sin(a) * R * 0.9)}" stroke="rgba(255,255,255,0.45)" stroke-width="${r1(u * 0.8)}"/>`;
      }).join('');
      const needle = (330 * Math.PI) / 180;
      return `${halo}
        <path d="${arc(160, 380)}" fill="none" stroke="${glass}" stroke-width="${r1(u * 7)}" stroke-linecap="round"/>
        <path d="${arc(160, 330)}" fill="none" stroke="${c[300]}" stroke-width="${r1(u * 7)}" stroke-linecap="round"/>
        ${ticks}
        <path d="M${r1(cx)} ${r1(cy)} L${r1(cx + Math.cos(needle) * R * 0.72)} ${r1(cy + Math.sin(needle) * R * 0.72)}" stroke="#fff" stroke-width="${r1(u * 2.4)}" stroke-linecap="round"/>
        <circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(u * 4.5)}" fill="#fff"/>
        ${chip(cx, y + u * 88, u * 30, '99.9%')}`;
    }

    case 'database': {
      const cx = x + s / 2;
      const rw = u * 30;
      const rh = u * 8;
      const cyl = (cy: number) => `
        <path d="M${r1(cx - rw)} ${r1(cy)} v${r1(u * 14)} a${r1(rw)} ${r1(rh)} 0 0 0 ${r1(rw * 2)} 0 v-${r1(u * 14)}" fill="${glass}" stroke="${line}" stroke-width="${r1(u * 0.8)}"/>
        <ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(rw)}" ry="${r1(rh)}" fill="rgba(255,255,255,0.16)" stroke="${line}" stroke-width="${r1(u * 0.8)}"/>`;
      return `${halo}
        ${cyl(y + u * 66)}${cyl(y + u * 46)}${cyl(y + u * 26)}
        <circle cx="${r1(x + u * 82)}" cy="${r1(y + u * 24)}" r="${r1(u * 9)}" fill="${c[50]}" fill-opacity="0.95"/>
        <path d="M${r1(x + u * 78)} ${r1(y + u * 21)} a${r1(u * 4.6)} ${r1(u * 4.6)} 0 1 1 -${r1(u * 0.4)} ${r1(u * 5.6)}" fill="none" stroke="${c[700]}" stroke-width="${r1(u * 1.4)}" stroke-linecap="round"/>
        <path d="M${r1(x + u * 76.6)} ${r1(y + u * 18.4)} l${r1(u * 1.6)} ${r1(u * 3)} l${r1(u * 3)} -${r1(u * 1.2)}" fill="none" stroke="${c[700]}" stroke-width="${r1(u * 1.4)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }

    case 'web': {
      const wx = x + u * 6;
      const wy = y + u * 16;
      const ww = u * 88;
      const wh = u * 66;
      return `${halo}
        <rect x="${r1(wx)}" y="${r1(wy)}" width="${r1(ww)}" height="${r1(wh)}" rx="${r1(u * 5)}" fill="${glass}" stroke="${line}" stroke-width="${r1(u * 0.8)}"/>
        <rect x="${r1(wx + u * 22)}" y="${r1(wy + u * 3.5)}" width="${r1(ww - u * 28)}" height="${r1(u * 6)}" rx="${r1(u * 3)}" fill="rgba(255,255,255,0.14)"/>
        <text x="${r1(wx + u * 25)}" y="${r1(wy + u * 8.2)}" font-family="${FONT_FAMILY}" font-weight="700" font-size="${r1(u * 3.8)}" fill="rgba(255,255,255,0.75)">https://</text>
        <circle cx="${r1(wx + u * 6)}" cy="${r1(wy + u * 6.5)}" r="${r1(u * 1.5)}" fill="rgba(255,255,255,0.5)"/>
        <circle cx="${r1(wx + u * 11)}" cy="${r1(wy + u * 6.5)}" r="${r1(u * 1.5)}" fill="rgba(255,255,255,0.5)"/>
        <rect x="${r1(wx + u * 6)}" y="${r1(wy + u * 16)}" width="${r1(ww - u * 12)}" height="${r1(u * 20)}" rx="${r1(u * 3)}" fill="${c[300]}" fill-opacity="0.55"/>
        ${[0, 1, 2].map((i) => `<rect x="${r1(wx + u * 6 + i * (ww - u * 12 + u * 4) / 3)}" y="${r1(wy + u * 41)}" width="${r1((ww - u * 12 - u * 8) / 3)}" height="${r1(u * 18)}" rx="${r1(u * 2.5)}" fill="rgba(255,255,255,0.16)"/>`).join('')}`;
    }

    case 'email': {
      const ex = x + u * 12;
      const ey = y + u * 26;
      const ew = u * 76;
      const eh = u * 52;
      return `${halo}
        <rect x="${r1(ex)}" y="${r1(ey)}" width="${r1(ew)}" height="${r1(eh)}" rx="${r1(u * 5)}" fill="${glass}" stroke="${line}" stroke-width="${r1(u * 0.9)}"/>
        <path d="M${r1(ex + u * 3)} ${r1(ey + u * 4)} L${r1(ex + ew / 2)} ${r1(ey + eh * 0.55)} L${r1(ex + ew - u * 3)} ${r1(ey + u * 4)}" fill="none" stroke="#fff" stroke-opacity="0.7" stroke-width="${r1(u * 1.4)}" stroke-linejoin="round"/>
        <circle cx="${r1(ex + ew - u * 2)}" cy="${r1(ey + u * 2)}" r="${r1(u * 9)}" fill="${c[50]}" fill-opacity="0.95"/>
        <text x="${r1(ex + ew - u * 2)}" y="${r1(ey + u * 5.4)}" font-family="${FONT_FAMILY}" font-weight="800" font-size="${r1(u * 10)}" fill="${c[700]}" text-anchor="middle">@</text>`;
    }
  }
}

/* ───────────────────────  شکستن متوازن عنوان  ─────────────────────── */

/**
 * شکستن حریصانه گاهی یک کلمه را تنها در خط آخر جا می‌گذارد («…(صفر تا / صد)»).
 * کمترین پهنایی را پیدا می‌کنیم که همان شمار خط را بدهد؛ نتیجه خط‌هایی
 * تقریباً هم‌اندازه است.
 */
function balancedWrap(text: string, maxWidth: number, size: number, measure: Measure) {
  const first = wrapText(text, maxWidth, size, 800, 3, measure);
  if (first.overflow || first.lines.length < 2) return first;
  let lo = maxWidth * 0.45;
  let hi = maxWidth;
  let best = first;
  for (let i = 0; i < 9; i++) {
    const mid = (lo + hi) / 2;
    const attempt = wrapText(text, mid, size, 800, 3, measure);
    if (!attempt.overflow && attempt.lines.length === first.lines.length) {
      best = attempt;
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return best;
}

/* ───────────────────────  ساخت کاور  ─────────────────────── */

export type CoverInput = {
  title: string;
  category?: string | null;
  /** متن‌های دیگر برای تشخیص موضوع (کلیدواژه، برچسب‌ها) */
  hints?: (string | null | undefined)[];
  /** کلید ثابت مقاله، معمولاً نشانی؛ مبنای طرح تکرارپذیر */
  seed: string;
  variant?: number;
  ratio?: CoverRatio;
  brand: { color: string; name: string; domain: string };
  /** موضوع دستی؛ خالی یعنی تشخیص خودکار */
  topic?: Topic;
};

export function buildCoverSvg(input: CoverInput, measure: Measure): string {
  const { width: W, height: H } = COVER_SIZES[input.ratio ?? 'og'];
  const c = brandScale(normalizeHex(input.brand.color));
  const rand = rng(seedOf(`${input.seed}#${input.variant ?? 0}`));
  const topic = input.topic ?? detectTopic(input.title, input.category, ...(input.hints ?? []));
  const pat = PATTERNS[Math.floor(rand() * PATTERNS.length)];
  const angle = Math.floor(rand() * 4);
  const stacked = W / H < 1.5;
  const P = Math.round(W * 0.06);

  // جهت گرادیان و جای درخشش‌ها با هر طرح فرق می‌کند
  const grad = [
    ['0', '0', '1', '1'],
    ['1', '0', '0', '1'],
    ['0', '1', '1', '0'],
    ['1', '1', '0', '0'],
  ][angle];
  const glowA = { x: r1(W * (0.1 + rand() * 0.3)), y: r1(H * (0.1 + rand() * 0.8)) };
  const glowB = { x: r1(W * (0.6 + rand() * 0.35)), y: r1(H * (0.1 + rand() * 0.8)) };

  // ── چیدمان: پهن = تصویرسازی چپ و متن راست؛ مربعی = تصویرسازی بالا و متن پایین
  const illo = stacked
    ? { s: Math.round(Math.min(W * 0.46, H * (W / H > 1.2 ? 0.38 : 0.44))), x: 0, y: 0 }
    : { s: Math.round(H * 0.64), x: 0, y: 0 };
  if (stacked) {
    illo.x = Math.round((W - illo.s) / 2);
    illo.y = Math.round(P * 0.9);
  } else {
    illo.x = P - 6;
    illo.y = Math.round((H - illo.s) / 2);
  }

  const textRight = W - P;
  const textLeft = stacked ? P : illo.x + illo.s + Math.round(W * 0.045);
  const textWidth = textRight - textLeft;

  // ── دسته (برچسب بالای عنوان)
  const category = (input.category || '').trim();
  const pillSize = stacked ? 28 : 24;
  const pillW = category ? Math.round(measure(category, pillSize, 700) + pillSize * 1.6) : 0;
  const pillH = Math.round(pillSize * 1.9);

  // ── فضای عمودی متن
  const footerH = 56;
  const areaTop = stacked ? illo.y + illo.s + Math.round(H * 0.035) : P;
  const areaBottom = H - P - footerH;
  const pillBlock = category ? pillH + 28 : 0;

  // ── عنوان: بزرگ‌ترین اندازه‌ای که هم در سه خط و هم در ارتفاع باقی‌مانده جا شود
  const sizes = stacked ? [76, 68, 60, 54, 48, 44] : [64, 58, 52, 47, 42, 38];
  let size = sizes[sizes.length - 1];
  let lines: string[] = [];
  for (const candidate of sizes) {
    const wrapped = balancedWrap(input.title, textWidth, candidate, measure);
    size = candidate;
    lines = wrapped.lines;
    const fitsHeight = pillBlock + lines.length * Math.round(candidate * 1.42) + 26 <= areaBottom - areaTop;
    if (!wrapped.overflow && fitsHeight) break;
  }
  const lineH = Math.round(size * 1.42);

  // ── جای عمودی متن
  const blockH = pillBlock + lines.length * lineH + 26;
  const blockTop = Math.round(areaTop + Math.max(0, (areaBottom - areaTop - blockH) / 2));

  const pillY = blockTop;
  const titleTop = blockTop + (category ? pillH + 28 : 0);

  const titleSvg = lines
    .map(
      (line, i) =>
        `<text x="${textRight}" y="${titleTop + Math.round(size * 1.02) + i * lineH}" font-family="${FONT_FAMILY}" font-size="${size}" font-weight="800" fill="#fff" text-anchor="end" direction="rtl">${svgText(line)}</text>`,
    )
    .join('');
  const accentY = titleTop + lines.length * lineH + 4;

  // ── پابرگ: نشانه، نام برند و دامنه
  const brandSize = stacked ? 30 : 26;
  const fy = H - P + 2;
  const nameW = measure(input.brand.name, brandSize, 800);
  const markS = Math.round(brandSize * 1.5);
  const markX = textRight - markS;
  const nameX = markX - 14;
  const domainX = nameX - nameW - 22;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="${grad[0]}" y1="${grad[1]}" x2="${grad[2]}" y2="${grad[3]}">
      <stop offset="0" stop-color="${c[700]}"/>
      <stop offset="0.55" stop-color="${c[800]}"/>
      <stop offset="1" stop-color="${c[950]}"/>
    </linearGradient>
    <radialGradient id="glow"><stop offset="0" stop-color="${c[400]}" stop-opacity="0.55"/><stop offset="1" stop-color="${c[400]}" stop-opacity="0"/></radialGradient>
    <radialGradient id="halo"><stop offset="0" stop-color="#fff" stop-opacity="0.16"/><stop offset="0.7" stop-color="#fff" stop-opacity="0.03"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${glowA.x}" cy="${glowA.y}" r="${r1(W * 0.42)}" fill="url(#glow)"/>
  <circle cx="${glowB.x}" cy="${glowB.y}" r="${r1(W * 0.3)}" fill="url(#glow)" opacity="0.7"/>
  ${pattern(pat, W, H, rand)}
  ${scene(topic, illo.x, illo.y, illo.s, c)}
  ${
    category
      ? `<rect x="${textRight - pillW}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${Math.round(pillH / 2)}" fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.28)" stroke-width="1.5"/>
  <text x="${textRight - pillW / 2}" y="${pillY + Math.round(pillH * 0.66)}" font-family="${FONT_FAMILY}" font-size="${pillSize}" font-weight="700" fill="#fff" text-anchor="middle">${svgText(category)}</text>`
      : ''
  }
  ${titleSvg}
  <rect x="${textRight - 84}" y="${accentY}" width="84" height="7" rx="3.5" fill="${c[300]}"/>
  <rect x="${markX}" y="${fy - markS + 8}" width="${markS}" height="${markS}" rx="${Math.round(markS * 0.28)}" fill="#fff" fill-opacity="0.95"/>
  <path d="M${markX + markS * 0.27} ${fy - markS + 8 + markS * 0.32} h${r1(markS * 0.46)} M${markX + markS * 0.27} ${fy - markS + 8 + markS * 0.5} h${r1(markS * 0.46)} M${markX + markS * 0.27} ${fy - markS + 8 + markS * 0.68} h${r1(markS * 0.3)}" stroke="${c[700]}" stroke-width="${r1(markS * 0.09)}" stroke-linecap="round"/>
  <text x="${nameX}" y="${fy}" font-family="${FONT_FAMILY}" font-size="${brandSize}" font-weight="800" fill="#fff" text-anchor="end">${svgText(input.brand.name)}</text>
  ${
    input.brand.domain
      ? `<text x="${domainX}" y="${fy}" font-family="${FONT_FAMILY}" font-size="${Math.round(brandSize * 0.74)}" font-weight="500" fill="rgba(255,255,255,0.62)" text-anchor="end">${escapeXml(input.brand.domain)}</text>`
      : ''
  }
</svg>`;
}
