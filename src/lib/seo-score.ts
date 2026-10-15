import { renderMarkdown } from './markdown';
import { slugify } from './slugify';

/**
 * چک‌لیست سئوی مقاله.
 *
 * همان کاری را می‌کند که افزونه‌های سئو در وردپرس می‌کنند: پیش از انتشار
 * می‌گوید کجای مقاله لنگ می‌زند. امتیاز، وزنی از چند بررسی است و در
 * ویرایشگر به صورت زنده و هنگام ذخیره در دیتابیس نگه داشته می‌شود.
 */

export type CheckStatus = 'ok' | 'warn' | 'bad';

export type SeoCheck = {
  key: string;
  label: string;
  status: CheckStatus;
  message: string;
  /** وزن در امتیاز نهایی */
  weight: number;
};

export type SeoReport = {
  score: number;
  checks: SeoCheck[];
  stats: {
    wordCount: number;
    readingMinutes: number;
    headings: number;
    internalLinks: number;
    externalLinks: number;
    images: number;
    keywordCount: number;
    keywordDensity: number;
  };
};

export type SeoInput = {
  title: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  slug?: string | null;
  excerpt?: string | null;
  focusKeyword?: string | null;
  content: string;
  coverImage?: string | null;
  coverAlt?: string | null;
  faqs?: { q: string; a: string }[];
  categoryId?: string | null;
  tags?: string[];
  /** دامنه‌های خودمان؛ لینک به پنل ابری هم لینک داخلی حساب می‌شود */
  ownHosts?: string[];
};

/** یکدست‌سازی متن فارسی برای مقایسه: نیم‌فاصله، ی/ك عربی و اعراب */
export function normalizeFa(input: string): string {
  return (input ?? '')
    .toString()
    .toLowerCase()
    .replace(/[يﻱﻲ]/g, 'ی')
    .replace(/[كﻙﻚ]/g, 'ک')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[ۀة]/g, 'ه')
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[‌‎‏]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const h = normalizeFa(haystack);
  const n = normalizeFa(needle);
  if (!n) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const idx = h.indexOf(n, from);
    if (idx === -1) break;
    count++;
    from = idx + n.length;
  }
  return count;
}

const contains = (haystack: string, needle: string) => countOccurrences(haystack, needle) > 0;

export function seoReport(input: SeoInput): SeoReport {
  const rendered = renderMarkdown(input.content ?? '', { ownHosts: input.ownHosts });
  const title = (input.title ?? '').trim();
  const seoTitle = (input.metaTitle || title).trim();
  const description = (input.metaDescription || input.excerpt || '').trim();
  const keyword = (input.focusKeyword ?? '').trim();
  const slug = (input.slug ?? '').trim();
  const body = rendered.text;
  const firstWords = body.split(/\s+/).slice(0, 100).join(' ');

  const headings = rendered.toc.filter((t) => t.level === 2);
  const internalLinks = rendered.links.filter((l) => !l.external);
  const externalLinks = rendered.links.filter((l) => l.external);
  const keywordCount = keyword ? countOccurrences(body, keyword) : 0;
  const density = rendered.wordCount ? (keywordCount * (keyword.split(/\s+/).length || 1) * 100) / rendered.wordCount : 0;
  const faqs = (input.faqs ?? []).filter((f) => f.q?.trim() && f.a?.trim());

  const checks: SeoCheck[] = [];
  const add = (key: string, label: string, weight: number, status: CheckStatus, message: string) =>
    checks.push({ key, label, weight, status, message });

  // ── کلیدواژه هدف ──
  if (!keyword) {
    add('keyword', 'کلیدواژه هدف', 10, 'bad', 'کلیدواژه هدف را وارد کنید؛ بدون آن نمی‌دانیم مقاله برای چه عبارتی نوشته شده است.');
  } else {
    add('keyword', 'کلیدواژه هدف', 10, 'ok', `کلیدواژه «${keyword}» تعیین شده است.`);
  }

  // ── عنوان سئو ──
  if (!seoTitle) {
    add('title-length', 'طول عنوان', 8, 'bad', 'عنوان خالی است.');
  } else if (seoTitle.length < 25) {
    add('title-length', 'طول عنوان', 8, 'warn', `عنوان ${seoTitle.length} نویسه است؛ بین ۳۰ تا ۶۰ نویسه بهتر دیده می‌شود.`);
  } else if (seoTitle.length > 65) {
    add('title-length', 'طول عنوان', 8, 'warn', `عنوان ${seoTitle.length} نویسه است؛ گوگل انتهای آن را نشان نمی‌دهد. زیر ۶۰ نویسه بنویسید.`);
  } else {
    add('title-length', 'طول عنوان', 8, 'ok', `طول عنوان مناسب است (${seoTitle.length} نویسه).`);
  }

  if (keyword) {
    const inTitle = contains(seoTitle, keyword);
    const early = normalizeFa(seoTitle).indexOf(normalizeFa(keyword)) <= Math.ceil(seoTitle.length * 0.4);
    add(
      'keyword-title',
      'کلیدواژه در عنوان',
      10,
      inTitle ? (early ? 'ok' : 'warn') : 'bad',
      inTitle
        ? early
          ? 'کلیدواژه در ابتدای عنوان آمده است — بهترین حالت.'
          : 'کلیدواژه در عنوان هست، ولی نزدیک‌تر به ابتدای عنوان اثر بیشتری دارد.'
        : 'کلیدواژه هدف در عنوان نیست؛ مهم‌ترین جای ممکن همین عنوان است.',
    );
  }

  // ── توضیحات متا ──
  if (!description) {
    add('description', 'توضیحات متا', 9, 'bad', 'توضیحات متا را بنویسید؛ همین متن زیر عنوان در نتایج گوگل دیده می‌شود.');
  } else if (description.length < 70) {
    add('description', 'توضیحات متا', 9, 'warn', `توضیحات ${description.length} نویسه است؛ بین ۱۲۰ تا ۱۶۰ نویسه کامل‌تر است.`);
  } else if (description.length > 170) {
    add('description', 'توضیحات متا', 9, 'warn', `توضیحات ${description.length} نویسه است و انتهایش بریده می‌شود؛ زیر ۱۶۰ نویسه بنویسید.`);
  } else {
    add('description', 'توضیحات متا', 9, 'ok', `طول توضیحات مناسب است (${description.length} نویسه).`);
  }

  if (keyword && description) {
    add(
      'keyword-description',
      'کلیدواژه در توضیحات',
      5,
      contains(description, keyword) ? 'ok' : 'warn',
      contains(description, keyword)
        ? 'کلیدواژه در توضیحات متا آمده است.'
        : 'کلیدواژه را در توضیحات متا هم بیاورید؛ در نتایج گوگل پررنگ می‌شود و نرخ کلیک را بالا می‌برد.',
    );
  }

  // ── آدرس صفحه ──
  if (!slug) {
    add('slug', 'آدرس صفحه', 6, 'warn', 'آدرس صفحه خالی است؛ از عنوان ساخته می‌شود.');
  } else {
    const parts = slug.split('-').filter(Boolean);
    const keywordInSlug = keyword ? contains(slug.replace(/-/g, ' '), keyword) : true;
    if (!keywordInSlug) {
      add('slug', 'آدرس صفحه', 6, 'warn', 'کلیدواژه در آدرس صفحه نیست؛ آدرس کوتاه و شامل کلیدواژه بهتر است.');
    } else if (parts.length > 8) {
      add('slug', 'آدرس صفحه', 6, 'warn', 'آدرس طولانی است؛ ۳ تا ۵ کلمه کافی است.');
    } else {
      add('slug', 'آدرس صفحه', 6, 'ok', 'آدرس صفحه کوتاه و گویاست.');
    }
  }

  // ── طول محتوا ──
  if (rendered.wordCount < 300) {
    add('length', 'طول محتوا', 10, 'bad', `${rendered.wordCount} کلمه؛ مقاله‌های زیر ۳۰۰ کلمه تقریباً هیچ‌وقت رتبه نمی‌گیرند. دست‌کم ۷۰۰ کلمه بنویسید.`);
  } else if (rendered.wordCount < 700) {
    add('length', 'طول محتوا', 10, 'warn', `${rendered.wordCount} کلمه؛ برای رقابت روی عبارت‌های پرجستجو ۹۰۰ تا ۱۵۰۰ کلمه مناسب‌تر است.`);
  } else {
    add('length', 'طول محتوا', 10, 'ok', `${rendered.wordCount} کلمه — طول مناسبی برای یک مقاله کامل.`);
  }

  // ── کلیدواژه در ابتدای متن و چگالی ──
  if (keyword) {
    add(
      'keyword-intro',
      'کلیدواژه در پاراگراف اول',
      6,
      contains(firstWords, keyword) ? 'ok' : 'warn',
      contains(firstWords, keyword)
        ? 'کلیدواژه در ۱۰۰ کلمه اول آمده است.'
        : 'کلیدواژه را در پاراگراف اول بیاورید تا موضوع صفحه از ابتدا روشن باشد.',
    );

    let densityStatus: CheckStatus = 'ok';
    let densityMessage = `چگالی کلیدواژه ${density.toFixed(1)}٪ است (${keywordCount} بار) — طبیعی و مناسب.`;
    if (keywordCount === 0) {
      densityStatus = 'bad';
      densityMessage = 'کلیدواژه هدف در متن مقاله تکرار نشده است.';
    } else if (density < 0.4) {
      densityStatus = 'warn';
      densityMessage = `چگالی ${density.toFixed(1)}٪ کم است؛ چند بار دیگر به شکل طبیعی در متن بیاورید.`;
    } else if (density > 2.8) {
      densityStatus = 'warn';
      densityMessage = `چگالی ${density.toFixed(1)}٪ زیاد است؛ تکرار بیش از حد، نشانه اسپم است. از عبارت‌های هم‌معنا استفاده کنید.`;
    }
    add('keyword-density', 'چگالی کلیدواژه', 7, densityStatus, densityMessage);
  }

  // ── ساختار تیترها ──
  if (headings.length === 0) {
    add('headings', 'تیترهای میانی', 8, 'bad', 'مقاله هیچ تیتر H2 ندارد؛ متن بدون تیتر نه برای خواننده و نه برای گوگل قابل مرور نیست.');
  } else if (headings.length < 3) {
    add('headings', 'تیترهای میانی', 8, 'warn', `${headings.length} تیتر H2 دارید؛ دست‌کم ۳ تیتر، مقاله را خوانا و قابل فهرست‌بندی می‌کند.`);
  } else {
    add('headings', 'تیترهای میانی', 8, 'ok', `${headings.length} تیتر H2 — ساختار مقاله روشن است.`);
  }

  if (keyword && headings.length) {
    const inHeading = headings.some((h) => contains(h.text, keyword));
    add(
      'keyword-heading',
      'کلیدواژه در تیترها',
      5,
      inHeading ? 'ok' : 'warn',
      inHeading ? 'کلیدواژه در یکی از تیترها آمده است.' : 'کلیدواژه (یا شکل نزدیکش) را در یکی از تیترهای H2 بیاورید.',
    );
  }

  // ── تصویرها ──
  if (!input.coverImage) {
    add('cover', 'تصویر شاخص', 7, 'warn', 'تصویر شاخص ندارید؛ همین تصویر در شبکه‌های اجتماعی و کارت گوگل دیسکاور نشان داده می‌شود.');
  } else if (!input.coverAlt?.trim()) {
    add('cover', 'تصویر شاخص', 7, 'warn', 'برای تصویر شاخص متن جانشین (alt) بنویسید.');
  } else {
    add('cover', 'تصویر شاخص', 7, 'ok', 'تصویر شاخص با متن جانشین تنظیم شده است.');
  }

  const imagesWithoutAlt = rendered.images.filter((img) => !img.alt.trim()).length;
  if (rendered.images.length === 0) {
    add('images', 'تصویر در متن', 4, 'warn', 'متن هیچ تصویری ندارد؛ یک نمودار یا اسکرین‌شات، زمان ماندن کاربر را بالا می‌برد.');
  } else if (imagesWithoutAlt) {
    add('images', 'تصویر در متن', 4, 'warn', `${imagesWithoutAlt} تصویر متن جانشین (alt) ندارد.`);
  } else {
    add('images', 'تصویر در متن', 4, 'ok', `${rendered.images.length} تصویر، همه با متن جانشین.`);
  }

  // ── لینک‌دهی ──
  if (internalLinks.length === 0) {
    add('internal-links', 'لینک داخلی', 8, 'bad', 'هیچ لینک داخلی ندارید؛ لینک به صفحه خرید سرور یا مقاله‌های مرتبط، هم کاربر را نگه می‌دارد هم رتبه را پخش می‌کند.');
  } else if (internalLinks.length < 3) {
    add('internal-links', 'لینک داخلی', 8, 'warn', `${internalLinks.length} لینک داخلی دارید؛ ۳ تا ۵ لینک مرتبط بهتر است.`);
  } else {
    add('internal-links', 'لینک داخلی', 8, 'ok', `${internalLinks.length} لینک داخلی — خوب است.`);
  }

  add(
    'external-links',
    'لینک بیرونی',
    3,
    externalLinks.length ? 'ok' : 'warn',
    externalLinks.length
      ? `${externalLinks.length} لینک به منبع بیرونی.`
      : 'یک لینک به منبع معتبر (مستندات رسمی) اعتبار مقاله را بالا می‌برد.',
  );

  // ── خلاصه، دسته، برچسب ──
  add(
    'excerpt',
    'خلاصه مقاله',
    3,
    input.excerpt?.trim() ? 'ok' : 'warn',
    input.excerpt?.trim() ? 'خلاصه نوشته شده است.' : 'خلاصه کوتاه بنویسید؛ در فهرست وبلاگ و اشتراک‌گذاری استفاده می‌شود.',
  );

  add(
    'category',
    'دسته‌بندی',
    3,
    input.categoryId ? 'ok' : 'warn',
    input.categoryId ? 'مقاله دسته دارد.' : 'یک دسته انتخاب کنید؛ ساختار موضوعی سایت را برای گوگل روشن می‌کند.',
  );

  const tagCount = (input.tags ?? []).filter(Boolean).length;
  add(
    'tags',
    'برچسب‌ها',
    3,
    tagCount >= 2 ? 'ok' : 'warn',
    tagCount >= 2 ? `${tagCount} برچسب.` : 'دست‌کم دو برچسب مرتبط بزنید تا مقاله‌های هم‌موضوع به هم وصل شوند.',
  );

  // ── پرسش‌های پرتکرار (کارت غنی) ──
  add(
    'faq',
    'پرسش‌های پرتکرار',
    5,
    faqs.length >= 2 ? 'ok' : 'warn',
    faqs.length >= 2
      ? `${faqs.length} پرسش — داده ساخت‌یافته FAQ برای این مقاله ساخته می‌شود.`
      : 'دو پرسش پرتکرار اضافه کنید؛ گوگل آن‌ها را به صورت کارت بازشو زیر نتیجه نشان می‌دهد.',
  );

  // ── خوانایی ──
  const sentences = body.split(/[.!?؟۔\n]+/).filter((s) => s.trim().split(/\s+/).length > 1);
  const avgSentence = sentences.length ? rendered.wordCount / sentences.length : 0;
  add(
    'readability',
    'خوانایی',
    4,
    avgSentence === 0 ? 'warn' : avgSentence > 28 ? 'warn' : 'ok',
    avgSentence === 0
      ? 'متنی برای سنجش خوانایی نیست.'
      : avgSentence > 28
        ? `میانگین هر جمله ${Math.round(avgSentence)} کلمه است؛ جمله‌ها را کوتاه‌تر کنید.`
        : `میانگین طول جمله ${Math.round(avgSentence)} کلمه — روان است.`,
  );

  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
  const earned = checks.reduce((sum, c) => sum + c.weight * (c.status === 'ok' ? 1 : c.status === 'warn' ? 0.5 : 0), 0);
  const score = totalWeight ? Math.round((earned / totalWeight) * 100) : 0;

  return {
    score,
    checks,
    stats: {
      wordCount: rendered.wordCount,
      readingMinutes: rendered.readingMinutes,
      headings: headings.length,
      internalLinks: internalLinks.length,
      externalLinks: externalLinks.length,
      images: rendered.images.length,
      keywordCount,
      keywordDensity: Number(density.toFixed(2)),
    },
  };
}

/** پیشنهاد اسلاگ از کلیدواژه هدف یا عنوان */
export function suggestSlug(title: string, keyword?: string | null): string {
  return slugify(keyword?.trim() || title);
}
