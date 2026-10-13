import prisma from './prisma';
import { env } from './env';
import { getSettings } from './settings';
import { publishedWhere } from './blog';
import { renderMarkdown } from './markdown';
import { normalizeFa } from './seo-score';
import { gscConfigured } from './gsc';
import { siteInfo, ownHosts } from './seo';

/**
 * حسابرسی سئوی سایت — بدون نیاز به هیچ سرویس بیرونی.
 *
 * این بخش به پرسش «چه چیزی جلوی رتبه گرفتن ما را گرفته» پاسخ می‌دهد و
 * برعکس آمار سرچ کنسول، همین حالا و بدون تنظیم چیزی کار می‌کند: مقاله‌های
 * بی‌توضیح متا، مقاله‌های یتیم (که هیچ لینک داخلی به آن‌ها نیست)، عنوان‌های
 * تکراری، محتوای نازک و کارهای فنی نیم‌کاره.
 */

export type AuditSeverity = 'critical' | 'warning' | 'info';

export type AuditIssue = {
  key: string;
  severity: AuditSeverity;
  title: string;
  /** چرا مهم است و چه باید کرد */
  detail: string;
  /** شمار موارد درگیر */
  count?: number;
  /** مقاله‌های درگیر، برای رفتن سریع سراغشان */
  posts?: { id: string; title: string; slug: string }[];
  /** لینک رفع مشکل در پنل */
  href?: string;
};

export type SiteSeoHealth = {
  score: number;
  issues: AuditIssue[];
  stats: {
    published: number;
    drafts: number;
    indexable: number;
    noindex: number;
    avgSeoScore: number;
    totalViews: number;
    totalWords: number;
    categories: number;
    tags: number;
    withCover: number;
    orphans: number;
    staleCount: number;
    publishedLast30: number;
  };
  checklist: { key: string; label: string; ok: boolean; hint: string }[];
};

const STALE_DAYS = 180;

export async function auditSite(): Promise<SiteSeoHealth> {
  const settings = await getSettings();
  const hosts = ownHosts(await siteInfo());

  const [posts, drafts, categories, tags] = await Promise.all([
    prisma.blogPost.findMany({
      where: publishedWhere(),
      select: {
        id: true,
        slug: true,
        title: true,
        metaTitle: true,
        metaDescription: true,
        excerpt: true,
        content: true,
        coverImage: true,
        coverAlt: true,
        focusKeyword: true,
        noindex: true,
        seoScore: true,
        wordCount: true,
        views: true,
        faqs: true,
        categoryId: true,
        publishedAt: true,
        updatedAt: true,
        _count: { select: { tags: true } },
      },
      orderBy: { publishedAt: 'desc' },
    }),
    prisma.blogPost.count({ where: { status: 'DRAFT' } }),
    prisma.blogCategory.count({ where: { active: true } }),
    prisma.blogTag.count(),
  ]);

  // ── نقشه لینک‌های داخلی: کدام مقاله به کدام مقاله لینک داده ──
  const incoming = new Map<string, number>();
  for (const post of posts) {
    const rendered = renderMarkdown(post.content, { ownHosts: hosts });
    for (const link of rendered.links) {
      if (link.external) continue;
      const match = /^\/blog\/([^/?#]+)/.exec(link.href);
      if (!match) continue;
      const slug = decodeURIComponent(match[1]);
      if (slug === post.slug) continue;
      incoming.set(slug, (incoming.get(slug) ?? 0) + 1);
    }
  }

  const brief = (list: typeof posts) => list.slice(0, 12).map((p) => ({ id: p.id, title: p.title, slug: p.slug }));

  const issues: AuditIssue[] = [];
  const add = (issue: AuditIssue) => {
    if ((issue.count ?? 1) > 0) issues.push(issue);
  };

  // ── تنظیمات پایه ──
  const siteUrlOk = Boolean(settings.siteUrl && !/localhost|127\.0\.0\.1/.test(settings.siteUrl));
  if (!siteUrlOk) {
    add({
      key: 'site-url',
      severity: 'critical',
      title: 'آدرس سایت تنظیم نشده است',
      detail:
        'canonical، نقشه سایت، RSS و داده ساخت‌یافته همه از این آدرس ساخته می‌شوند. تا درست نشود، بقیه کارهای سئو بی‌اثر است.',
      href: '/admin/seo',
    });
  }
  if (!settings.googleSiteVerification) {
    add({
      key: 'gsc-verify',
      severity: 'warning',
      title: 'سایت در گوگل سرچ کنسول تأیید نشده است',
      detail:
        'بدون سرچ کنسول نمی‌دانید گوگل چه چیزی از سایت دیده و با چه عبارت‌هایی نمایش گرفته‌اید. کد تأیید را در تنظیمات سئو بگذارید و نقشه سایت را ثبت کنید.',
      href: '/admin/seo',
    });
  }
  if (!gscConfigured()) {
    add({
      key: 'gsc-api',
      severity: 'info',
      title: 'اتصال API سرچ کنسول برقرار نیست',
      detail:
        'با اتصال سرویس‌اکانت، جایگاه واقعی هر مقاله در گوگل، عبارت‌های جستجو و وضعیت ایندکس در همین پنل نمایش داده می‌شود. متغیرهای GSC_* را تنظیم کنید.',
    });
  }
  if (!settings.blogOgImage) {
    add({
      key: 'og-image',
      severity: 'info',
      title: 'تصویر پیش‌فرض اشتراک‌گذاری ندارید',
      detail: 'مقاله‌هایی که تصویر شاخص ندارند، در تلگرام و شبکه‌های اجتماعی بدون کارت تصویری دیده می‌شوند.',
      href: '/admin/seo',
    });
  }
  if (!settings.orgSameAs.trim()) {
    add({
      key: 'same-as',
      severity: 'info',
      title: 'نشانی شبکه‌های اجتماعی ثبت نشده است',
      detail:
        'این نشانی‌ها در داده ساخت‌یافته سازمان (sameAs) می‌آیند و به گوگل کمک می‌کنند برند شما را یک موجودیت مستقل بشناسد.',
      href: '/admin/seo',
    });
  }

  // ── محتوا ──
  if (posts.length < 10) {
    add({
      key: 'few-posts',
      severity: posts.length < 5 ? 'critical' : 'warning',
      title: `فقط ${new Intl.NumberFormat('fa-IR').format(posts.length)} مقاله منتشرشده دارید`,
      detail:
        'گوگل به سایتی که چند مقاله دارد اعتماد موضوعی نمی‌دهد. برای دیده شدن در یک حوزه، دست‌کم ۱۵ تا ۲۰ مقاله لازم است.',
      href: '/admin/blog',
    });
  }

  const noMeta = posts.filter((p) => !p.metaDescription?.trim());
  add({
    key: 'no-meta-description',
    severity: 'warning',
    title: 'مقاله بدون توضیحات متا',
    detail: 'گوگل در این حالت خودش تکه‌ای از متن را نشان می‌دهد؛ نرخ کلیک پایین‌تر می‌آید.',
    count: noMeta.length,
    posts: brief(noMeta),
  });

  const noKeyword = posts.filter((p) => !p.focusKeyword?.trim());
  add({
    key: 'no-keyword',
    severity: 'info',
    title: 'مقاله بدون کلیدواژه هدف',
    detail: 'بدون کلیدواژه هدف نمی‌توان سنجید مقاله برای چه عبارتی نوشته شده و امتیاز سئو دقیق نیست.',
    count: noKeyword.length,
    posts: brief(noKeyword),
  });

  const lowScore = posts.filter((p) => p.seoScore < 70);
  add({
    key: 'low-score',
    severity: 'warning',
    title: 'مقاله با امتیاز سئوی زیر ۷۰',
    detail: 'ویرایشگر هر مقاله دقیقاً می‌گوید چه چیزی کم است؛ رفع همان موارد، ارزان‌ترین راه بهبود است.',
    count: lowScore.length,
    posts: brief(lowScore),
  });

  const thin = posts.filter((p) => p.wordCount < 500);
  add({
    key: 'thin',
    severity: 'warning',
    title: 'محتوای نازک (زیر ۵۰۰ کلمه)',
    detail: 'مقاله‌های کوتاه معمولاً رتبه نمی‌گیرند. یا کامل‌ترشان کنید یا با مقاله‌ای مرتبط ادغامشان کنید.',
    count: thin.length,
    posts: brief(thin),
  });

  const noCover = posts.filter((p) => !p.coverImage);
  add({
    key: 'no-cover',
    severity: 'info',
    title: 'مقاله بدون تصویر شاخص',
    detail: 'تصویر شاخص هم در کارت اشتراک‌گذاری و هم در گوگل دیسکاور اثر دارد.',
    count: noCover.length,
    posts: brief(noCover),
  });

  const badAlt = posts.filter((p) => p.coverImage && !p.coverAlt?.trim());
  add({
    key: 'no-alt',
    severity: 'info',
    title: 'تصویر شاخص بدون متن جانشین',
    detail: 'متن جانشین برای دسترس‌پذیری لازم است و شانس دیده شدن در جستجوی تصویر را بالا می‌برد.',
    count: badAlt.length,
    posts: brief(badAlt),
  });

  const noFaq = posts.filter((p) => !Array.isArray(p.faqs) || (p.faqs as unknown[]).length < 2);
  add({
    key: 'no-faq',
    severity: 'info',
    title: 'مقاله بدون پرسش‌های پرتکرار',
    detail: 'هر مقاله با دو پرسش، داده ساخت‌یافته FAQ می‌گیرد و شانس کارت بازشو در نتایج گوگل دارد.',
    count: noFaq.length,
    posts: brief(noFaq),
  });

  const noCategory = posts.filter((p) => !p.categoryId);
  add({
    key: 'no-category',
    severity: 'info',
    title: 'مقاله بی‌دسته',
    detail: 'دسته‌بندی، ساختار موضوعی سایت را برای گوگل روشن می‌کند.',
    count: noCategory.length,
    posts: brief(noCategory),
  });

  const fewTags = posts.filter((p) => p._count.tags < 2);
  add({
    key: 'few-tags',
    severity: 'info',
    title: 'مقاله با کمتر از دو برچسب',
    detail: 'برچسب‌ها مقاله‌های هم‌موضوع را به هم وصل می‌کنند.',
    count: fewTags.length,
    posts: brief(fewTags),
  });

  // ── لینک داخلی ──
  const orphans = posts.filter((p) => (incoming.get(p.slug) ?? 0) === 0);
  add({
    key: 'orphan',
    severity: 'warning',
    title: 'مقاله یتیم (هیچ مقاله‌ای به آن لینک نداده)',
    detail:
      'صفحه‌ای که لینک داخلی ندارد، دیرتر خزیده می‌شود و اعتبار کمتری می‌گیرد. از دو سه مقاله مرتبط به آن لینک بدهید.',
    count: orphans.length,
    posts: brief(orphans),
  });

  const fewOutLinks = posts.filter(
    (p) => renderMarkdown(p.content, { ownHosts: hosts }).links.filter((l) => !l.external).length < 2,
  );
  add({
    key: 'few-internal-links',
    severity: 'info',
    title: 'مقاله با کمتر از دو لینک داخلی',
    detail: 'لینک به صفحه خرید و مقاله‌های مرتبط، هم کاربر را نگه می‌دارد و هم اعتبار را در سایت پخش می‌کند.',
    count: fewOutLinks.length,
    posts: brief(fewOutLinks),
  });

  // ── عنوان و آدرس تکراری ──
  const titleMap = new Map<string, typeof posts>();
  for (const post of posts) {
    const key = normalizeFa(post.metaTitle || post.title);
    const list = titleMap.get(key) ?? [];
    list.push(post);
    titleMap.set(key, list);
  }
  const duplicateTitles = [...titleMap.values()].filter((list) => list.length > 1).flat();
  add({
    key: 'duplicate-title',
    severity: 'warning',
    title: 'عنوان تکراری',
    detail: 'دو صفحه با یک عنوان، سر یک عبارت با هم رقابت می‌کنند و هر دو ضرر می‌کنند.',
    count: duplicateTitles.length,
    posts: brief(duplicateTitles),
  });

  // ── تازگی محتوا ──
  const stale = posts.filter((p) => Date.now() - p.updatedAt.getTime() > STALE_DAYS * 24 * 3600 * 1000);
  add({
    key: 'stale',
    severity: 'info',
    title: 'مقاله به‌روزرسانی‌نشده (بیش از ۶ ماه)',
    detail: 'به‌روزرسانی مقاله‌های قدیمی، ارزان‌ترین راه بازگرداندن رتبه از دست رفته است.',
    count: stale.length,
    posts: brief(stale),
  });

  const noindexPosts = posts.filter((p) => p.noindex);
  add({
    key: 'noindex',
    severity: 'info',
    title: 'مقاله با کلید «از گوگل پنهان شود»',
    detail: 'اگر عمدی نبوده، این کلید را خاموش کنید تا مقاله ایندکس شود.',
    count: noindexPosts.length,
    posts: brief(noindexPosts),
  });

  const publishedLast30 = posts.filter(
    (p) => p.publishedAt && Date.now() - p.publishedAt.getTime() < 30 * 24 * 3600 * 1000,
  ).length;
  if (publishedLast30 === 0 && posts.length > 0) {
    add({
      key: 'no-recent',
      severity: 'warning',
      title: 'در ۳۰ روز گذشته مقاله‌ای منتشر نشده',
      detail: 'انتشار منظم، دفعات خزیدن گوگل را بالا می‌برد. خط تولید خودکار محتوا را روشن کنید.',
      href: '/admin/blog',
    });
  }

  // ── امتیاز سلامت ──
  const weights: Record<AuditSeverity, number> = { critical: 14, warning: 6, info: 2 };
  // ایرادی که چند مقاله را درگیر کرده، سنگین‌تر است؛ ولی وزنش بی‌نهایت بالا نمی‌رود
  const penalty = issues.reduce((sum, issue) => {
    const multiplier = issue.count ? Math.min(3, Math.max(0.5, issue.count / 4)) : 1;
    return sum + weights[issue.severity] * multiplier;
  }, 0);
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));

  const indexable = posts.filter((p) => !p.noindex).length;
  const avgSeoScore = posts.length ? Math.round(posts.reduce((s, p) => s + p.seoScore, 0) / posts.length) : 0;

  const checklist = [
    { key: 'site-url', label: 'آدرس سایت تنظیم شده', ok: siteUrlOk, hint: 'مبنای canonical و نقشه سایت' },
    {
      key: 'verify',
      label: 'تأیید مالکیت گوگل',
      ok: Boolean(settings.googleSiteVerification),
      hint: 'کد تأیید سرچ کنسول در تنظیمات سئو',
    },
    { key: 'gsc', label: 'اتصال API سرچ کنسول', ok: gscConfigured(), hint: 'نمایش جایگاه واقعی در پنل' },
    { key: 'sitemap', label: 'نقشه سایت خودکار', ok: true, hint: '/sitemap.xml از مقاله‌های منتشرشده' },
    { key: 'robots', label: 'robots.txt درست', ok: true, hint: 'پنل و API بسته، وبلاگ باز' },
    { key: 'rss', label: 'خوراک RSS', ok: true, hint: '/blog/rss.xml با متن کامل' },
    { key: 'schema', label: 'داده ساخت‌یافته مقاله‌ها', ok: true, hint: 'BlogPosting، FAQPage، BreadcrumbList' },
    {
      key: 'home-schema',
      label: 'داده ساخت‌یافته صفحه اصلی',
      ok: settings.homeSchemaEnabled,
      hint: 'پرسش‌های پرتکرار و پلن‌ها',
    },
    {
      key: 'indexnow',
      label: 'اعلام فوری به بینگ (IndexNow)',
      ok: settings.indexNowEnabled,
      hint: 'هر انتشار تازه خودکار اعلام می‌شود',
    },
    { key: 'canonical', label: 'canonical و صفحه‌بندی', ok: true, hint: 'روی همه صفحه‌های عمومی' },
    {
      key: 'author',
      label: 'نویسنده پیش‌فرض',
      ok: Boolean(settings.defaultAuthorName || settings.brandName),
      hint: 'اعتبار نویسنده در ارزیابی کیفیت',
    },
    {
      key: 'content-engine',
      label: 'تولید منظم محتوا',
      ok: settings.contentAutoEnabled && Boolean(env.content.apiKey),
      hint: 'انتشار منظم، خزش را بیشتر می‌کند',
    },
  ];

  return {
    score,
    issues: issues.sort((a, b) => weights[b.severity] - weights[a.severity]),
    stats: {
      published: posts.length,
      drafts,
      indexable,
      noindex: noindexPosts.length,
      avgSeoScore,
      totalViews: posts.reduce((s, p) => s + p.views, 0),
      totalWords: posts.reduce((s, p) => s + p.wordCount, 0),
      categories,
      tags,
      withCover: posts.filter((p) => p.coverImage).length,
      orphans: orphans.length,
      staleCount: stale.length,
      publishedLast30,
    },
    checklist,
  };
}

export type PostSeoRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  publishedAt: string | null;
  updatedAt: string;
  views: number;
  seoScore: number;
  wordCount: number;
  readingMinutes: number;
  focusKeyword: string | null;
  noindex: boolean;
  category: string | null;
  incomingLinks: number;
  hasCover: boolean;
  hasMeta: boolean;
  faqCount: number;
};

/** جدول سئوی مقاله‌ها — داده‌های درون‌سایتی، بدون نیاز به سرچ کنسول */
export async function postSeoRows(): Promise<PostSeoRow[]> {
  const hosts = ownHosts(await siteInfo());
  const posts = await prisma.blogPost.findMany({
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      publishedAt: true,
      updatedAt: true,
      views: true,
      seoScore: true,
      wordCount: true,
      readingMinutes: true,
      focusKeyword: true,
      noindex: true,
      coverImage: true,
      metaDescription: true,
      faqs: true,
      content: true,
      category: { select: { name: true } },
    },
    orderBy: [{ status: 'asc' }, { publishedAt: 'desc' }],
    take: 300,
  });

  const incoming = new Map<string, number>();
  for (const post of posts) {
    for (const link of renderMarkdown(post.content, { ownHosts: hosts }).links) {
      if (link.external) continue;
      const match = /^\/blog\/([^/?#]+)/.exec(link.href);
      if (!match) continue;
      const slug = decodeURIComponent(match[1]);
      if (slug !== post.slug) incoming.set(slug, (incoming.get(slug) ?? 0) + 1);
    }
  }

  return posts.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    status: p.status,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    updatedAt: p.updatedAt.toISOString(),
    views: p.views,
    seoScore: p.seoScore,
    wordCount: p.wordCount,
    readingMinutes: p.readingMinutes,
    focusKeyword: p.focusKeyword,
    noindex: p.noindex,
    category: p.category?.name ?? null,
    incomingLinks: incoming.get(p.slug) ?? 0,
    hasCover: Boolean(p.coverImage),
    hasMeta: Boolean(p.metaDescription?.trim()),
    faqCount: Array.isArray(p.faqs) ? (p.faqs as unknown[]).length : 0,
  }));
}
