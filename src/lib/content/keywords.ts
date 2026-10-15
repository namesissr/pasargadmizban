import prisma from '../prisma';
import { normalizeFa } from '../seo-score';

/**
 * کشف موضوع مقاله.
 *
 * منبع اصلی، سرویس پیشنهاد جستجوی گوگل (autocomplete) است: همان چیزی که
 * وقتی در گوگل تایپ می‌کنید زیر کادر ظاهر می‌شود. این پیشنهادها از جستجوی
 * واقعی کاربران ساخته می‌شوند، پس بهترین نشانه رایگان از «مردم چه چیزی را
 * در این حوزه زیاد جستجو می‌کنند» است.
 *
 * نکته‌ای که باید بدانید: گوگل API عمومی برای «پربازدیدترین مقاله‌های یک
 * حوزه» ندارد و خزیدن مستقیم صفحه نتایج، خلاف شرایط استفاده‌اش است. پس اینجا
 * دو مسیر داریم: مسیر رایگان (پیشنهادهای جستجو) و مسیر سرویس‌های دارای مجوز
 * (serper.dev یا SerpApi) که با کلید API، نتایج بالای گوگل را قانونی در
 * اختیارمان می‌گذارند. هر دو در این فایل پشتیبانی می‌شوند.
 */

/** عبارت‌های پایه حوزه میزبانی و سرور — نقطه شروع گسترش کلیدواژه */
export const SEED_KEYWORDS: { seed: string; categorySlug: string }[] = [
  { seed: 'خرید سرور مجازی', categorySlug: 'rahnamaye-kharid' },
  { seed: 'سرور مجازی ارزان', categorySlug: 'rahnamaye-kharid' },
  { seed: 'سرور مجازی ایران', categorySlug: 'rahnamaye-kharid' },
  { seed: 'سرور مجازی ساعتی', categorySlug: 'rahnamaye-kharid' },
  { seed: 'سرور مجازی خارج', categorySlug: 'rahnamaye-kharid' },
  { seed: 'هاست وردپرس', categorySlug: 'rahnamaye-kharid' },
  { seed: 'میزبانی وب', categorySlug: 'rahnamaye-kharid' },
  { seed: 'قیمت سرور اختصاصی', categorySlug: 'rahnamaye-kharid' },
  { seed: 'سرور ابری', categorySlug: 'server-abri' },
  { seed: 'پرداخت ساعتی سرور', categorySlug: 'server-abri' },
  { seed: 'کلود سرور', categorySlug: 'server-abri' },
  { seed: 'اسنپ شات سرور', categorySlug: 'server-abri' },
  { seed: 'ارتقای منابع سرور', categorySlug: 'server-abri' },
  { seed: 'دامنه و دی ان اس', categorySlug: 'server-abri' },
  { seed: 'آموزش لینوکس', categorySlug: 'amoozesh-linux' },
  { seed: 'نصب اوبونتو سرور', categorySlug: 'amoozesh-linux' },
  { seed: 'آموزش داکر', categorySlug: 'amoozesh-linux' },
  { seed: 'نصب وب سرور nginx', categorySlug: 'amoozesh-linux' },
  { seed: 'دستورات ssh', categorySlug: 'amoozesh-linux' },
  { seed: 'نصب پنل هاست', categorySlug: 'amoozesh-linux' },
  { seed: 'امنیت سرور', categorySlug: 'amniyat-va-shabake' },
  { seed: 'فایروال لینوکس', categorySlug: 'amniyat-va-shabake' },
  { seed: 'گواهی ssl رایگان', categorySlug: 'amniyat-va-shabake' },
  { seed: 'بکاپ گیری سرور', categorySlug: 'amniyat-va-shabake' },
  { seed: 'حملات ddos', categorySlug: 'amniyat-va-shabake' },
  { seed: 'فیلتر شدن آی پی سرور', categorySlug: 'amniyat-va-shabake' },
];

/** پسوندهایی که عبارت را به پرسش واقعی کاربر تبدیل می‌کنند */
const MODIFIERS = ['چیست', 'چگونه', 'آموزش', 'قیمت', 'بهترین', 'مقایسه', 'رایگان', 'خطای', 'مشکل'];

export type KeywordCandidate = {
  keyword: string;
  keywordNorm: string;
  source: 'suggest' | 'related' | 'seed' | 'manual';
  categorySlug: string;
  score: number;
};

/**
 * پیشنهادهای جستجوی گوگل برای یک عبارت.
 * endpoint عمومی autocomplete است؛ پاسخ، آرایه‌ای است که عضو دومش فهرست
 * پیشنهادهاست.
 */
export async function googleSuggest(query: string, timeoutMs = 8000): Promise<string[]> {
  const url = new URL('https://suggestqueries.google.com/complete/search');
  url.searchParams.set('client', 'firefox');
  url.searchParams.set('hl', 'fa');
  url.searchParams.set('gl', 'ir');
  url.searchParams.set('q', query);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; PasargadMizbanBlogBot/1.0)' },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data) || !Array.isArray(data[1])) return [];
    return (data[1] as unknown[]).filter((s): s is string => typeof s === 'string');
  } catch {
    // شبکه در دسترس نبود یا سرویس پاسخ نداد؛ با بقیه منابع ادامه می‌دهیم
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * موضوع‌هایی که خط تولید سراغشان نمی‌رود.
 *
 * دو گروه‌اند: عبارت‌های بی‌ربط به کار ما (دانلود فیلم و…) و ابزارهای دور زدن
 * فیلترینگ. گروه دوم عمداً حذف شده است؛ نوشتن راهنمای این ابزارها برای یک
 * شرکت میزبانی ایرانی ریسک حقوقی دارد و بهتر است خودتان آگاهانه تصمیم
 * بگیرید، نه اینکه سیستم شبانه و خودکار منتشرش کند.
 */
const BLOCKED = /دانلود|کرک|فیلم|سریال|بازی|v2ray|vmess|vless|trojan|shadowsocks|شادوساکس|فیلترشکن|تحریم.?شکن|پروکسی|proxy|vpn|وی.?پی.?ان/i;

/** امتیاز اولویت یک عبارت برای نوشتن مقاله */
function scoreKeyword(keyword: string, source: KeywordCandidate['source'] = 'suggest'): number {
  const words = keyword.trim().split(/\s+/).length;
  let score = 50;

  // عبارت‌های سه تا شش کلمه‌ای (دم بلند) سریع‌تر رتبه می‌گیرند
  if (words >= 3 && words <= 6) score += 25;
  else if (words === 2) score += 8;
  else if (words > 7) score -= 10;

  // پرسش‌ها نیت روشنی دارند و برای کارت پرسش‌های پرتکرار هم مناسبند
  if (/چیست|چگونه|چطور|چرا|آیا|کدام/.test(keyword)) score += 15;
  // نیت آموزشی و رفع اشکال، مخاطب وفادار می‌آورد
  if (/آموزش|نصب|راه‌اندازی|راه اندازی|رفع|خطا|مشکل/.test(keyword)) score += 12;
  // نیت خرید، به فروش نزدیک‌تر است
  if (/خرید|قیمت|ارزان|تعرفه|بهترین/.test(keyword)) score += 10;

  // عبارتی که از پیشنهاد واقعی گوگل آمده، بر حدس ما ترجیح دارد
  if (source === 'suggest') score += 12;
  else if (source === 'related') score += 8;
  else if (source === 'seed') score -= 8;

  return Math.max(0, Math.min(100, score));
}

/** عبارت‌هایی که ارزش مقاله شدن ندارند */
function isUsable(keyword: string): boolean {
  const k = keyword.trim();
  if (k.length < 8 || k.length > 90) return false;
  if (k.split(/\s+/).length < 2) return false;
  if (BLOCKED.test(k)) return false;
  // عبارت باید لااقل یک واژه از حوزه کار ما داشته باشد
  return /سرور|هاست|میزبان|وی\s?پی\s?اس|vps|لینوکس|اوبونتو|دامنه|ssl|دی\s?ان\s?اس|dns|ابری|cloud|داکر|docker|nginx|آپاچی|apache|ssh|بکاپ|فایروال/i.test(
    k,
  );
}

/**
 * عبارت‌های نامزد را از پیشنهادهای گوگل می‌سازد، تکراری‌ها و موضوع‌های
 * نوشته‌شده را حذف می‌کند و بر اساس امتیاز مرتب برمی‌گرداند.
 */
export async function discoverKeywords(limit = 12): Promise<KeywordCandidate[]> {
  const candidates = new Map<string, KeywordCandidate>();

  const add = (keyword: string, source: KeywordCandidate['source'], categorySlug: string) => {
    const clean = keyword.replace(/\s+/g, ' ').trim();
    if (!isUsable(clean)) return;
    const norm = normalizeFa(clean);
    if (!norm || candidates.has(norm)) return;
    candidates.set(norm, {
      keyword: clean,
      keywordNorm: norm,
      source,
      categorySlug,
      score: scoreKeyword(clean, source),
    });
  };

  // دانه‌ها را به هم زده و بخشی را در هر اجرا بررسی می‌کنیم تا موضوع‌ها
  // در طول هفته متنوع بمانند و همیشه از یک دسته مقاله نسازیم
  const seeds = [...SEED_KEYWORDS].sort(() => Math.random() - 0.5).slice(0, 8);

  for (const { seed, categorySlug } of seeds) {
    const queries = [seed, `${seed} ${MODIFIERS[Math.floor(Math.random() * MODIFIERS.length)]}`];
    for (const query of queries) {
      const suggestions = await googleSuggest(query);
      for (const suggestion of suggestions) add(suggestion, 'suggest', categorySlug);
    }
    // اگر سرویس پیشنهاد در دسترس نبود، خود دانه با پسوند پرسشی نامزد می‌شود
    add(`${seed} چیست`, 'seed', categorySlug);
    add(`آموزش ${seed}`, 'seed', categorySlug);
  }

  // موضوع‌هایی که قبلاً برایشان مقاله ساخته‌ایم یا در صف هستند
  const [jobs, posts] = await Promise.all([
    prisma.contentJob.findMany({ select: { keywordNorm: true } }),
    prisma.blogPost.findMany({ select: { title: true, focusKeyword: true } }),
  ]);

  const taken = new Set(jobs.map((j) => j.keywordNorm));
  for (const post of posts) {
    if (post.focusKeyword) taken.add(normalizeFa(post.focusKeyword));
    taken.add(normalizeFa(post.title));
  }

  const fresh = [...candidates.values()].filter((c) => {
    if (taken.has(c.keywordNorm)) return false;
    // موضوعی که بخش زیادی از عنوان مقاله‌های موجود است، تکرار حساب می‌شود
    return ![...taken].some((t) => t.length > 12 && (t.includes(c.keywordNorm) || c.keywordNorm.includes(t)));
  });

  return fresh.sort((a, b) => b.score - a.score).slice(0, limit);
}
