import prisma from '../prisma';
import { audit } from '../audit';
import { env } from '../env';
import { getSettings } from '../settings';
import { siteInfo, cloudLinks } from '../seo';
import { buildPostData, syncTags } from '../blog-admin';
import { publishedWhere } from '../blog';
import { discoverKeywords, type KeywordCandidate } from './keywords';
import { researchKeyword } from './research';
import { writeArticle, type InternalLink } from './writer';
import { checkArticle, normalizeHeadings } from './quality';
import { submitToIndexNow } from '../indexnow';
import { withAutoFigure } from '../images/auto-figures';

/**
 * خط تولید محتوا: از کشف موضوع تا مقاله آماده.
 *
 * هر اجرا تا سقف تعیین‌شده (پیش‌فرض سه مقاله در روز) موضوع تازه برمی‌دارد،
 * تحقیق می‌کند، مقاله اصیل می‌نویسد، از دروازه کیفیت می‌گذراند و در دسته
 * مناسب ذخیره می‌کند — پیش‌نویس یا منتشرشده، بسته به تنظیمات.
 *
 * چیزی که این سیستم عمداً انجام نمی‌دهد: برداشتن مقاله سایت‌های دیگر و
 * بازنشر یا بازنویسی‌اش. آن کار نقض حق نشر است و سیاست «محتوای کپی‌شده» و
 * «تولید انبوه بی‌ارزش» گوگل، همان روز اول جریمه‌اش می‌کند. جایش این است:
 * می‌فهمیم مردم چه چیزی را جستجو می‌کنند و برای همان پرسش، پاسخ تازه و
 * بهتری می‌نویسیم.
 */

export type JobOutcome = {
  jobId: string;
  keyword: string;
  status: 'PUBLISHED' | 'DRAFTED' | 'FAILED' | 'REJECTED';
  postId?: string;
  slug?: string;
  seoScore?: number;
  wordCount?: number;
  reasons?: string[];
  error?: string;
};

export type PipelineResult = {
  requested: number;
  produced: number;
  published: number;
  drafted: number;
  failed: number;
  outcomes: JobOutcome[];
  /** اگر خط تولید اصلاً اجرا نشد، دلیلش */
  skipped?: string;
};

/**
 * لینک‌های داخلی مجاز: صفحه‌های فروش پنل ابری + مقاله‌های موجود.
 * آدرس پنل از تنظیمات می‌آید تا همه مقاله‌ها کاربر را به همان جایی ببرند
 * که ثبت‌نام و ساخت سرور انجام می‌شود.
 */
export async function internalLinkPool(cloud: { register: string; pricing: string }): Promise<InternalLink[]> {
  const posts = await prisma.blogPost.findMany({
    where: publishedWhere(),
    select: { slug: true, title: true },
    orderBy: { publishedAt: 'desc' },
    take: 10,
  });

  return [
    { path: cloud.register, title: 'ساخت سرور ساعتی ایران و خارج' },
    { path: cloud.pricing, title: 'قیمت سرورهای ساعتی' },
    { path: '/blog', title: 'وبلاگ' },
    ...posts.map((p) => ({ path: `/blog/${p.slug}`, title: p.title })),
  ];
}

/**
 * موضوع‌هایی که مدیر خودش در صف گذاشته است.
 *
 * اینها بر موضوع‌های کشف‌شده اولویت دارند: اگر مدیر وقت گذاشته و کلیدواژه‌ای
 * را دستی وارد کرده، همان اول نوبت نوشته می‌شود.
 */
async function queuedCandidates(limit: number, jobIds?: string[]): Promise<QueuedCandidate[]> {
  if (limit <= 0) return [];
  const rows = await prisma.contentJob.findMany({
    where: jobIds?.length ? { id: { in: jobIds } } : { status: 'PENDING' },
    orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
    take: limit,
    select: { id: true, keyword: true, keywordNorm: true, source: true, score: true, brief: true },
  });

  return rows.map((row) => {
    const brief = (row.brief ?? null) as { categorySlug?: string } | null;
    return {
      jobId: row.id,
      keyword: row.keyword,
      keywordNorm: row.keywordNorm,
      source: (row.source as KeywordCandidate['source']) ?? 'manual',
      categorySlug: brief?.categorySlug ?? '',
      score: row.score,
    };
  });
}

/** نامزد تولید؛ اگر از صف آمده باشد، شناسه ردیف صف را هم دارد */
type QueuedCandidate = KeywordCandidate & { jobId?: string };

/** یک موضوع را از صفر تا مقاله می‌برد */
async function processCandidate(
  candidate: QueuedCandidate,
  context: {
    categories: { id: string; slug: string; name: string }[];
    internalLinks: InternalLink[];
    existingTags: { name: string; posts: number }[];
    brandName: string;
    cloudRegisterUrl: string;
    author: { name: string; title: string; bio: string };
    autoPublish: boolean;
    minSeoScore: number;
    minWords: number;
    autoFigures: boolean;
  },
): Promise<JobOutcome> {
  // رکورد صف را اول می‌سازیم تا اگر همین موضوع در اجرای بعدی هم آمد، تکرار نشود.
  // موضوع‌هایی که مدیر دستی در صف گذاشته، ردیفشان از قبل هست و فقط تازه می‌شود.
  const job = candidate.jobId
    ? await prisma.contentJob.update({
        where: { id: candidate.jobId },
        data: { status: 'RESEARCHING', startedAt: new Date(), error: null },
        select: { id: true },
      })
    : await prisma.contentJob.create({
        data: {
          keyword: candidate.keyword,
          keywordNorm: candidate.keywordNorm,
          source: candidate.source,
          score: candidate.score,
          status: 'RESEARCHING',
          startedAt: new Date(),
        },
        select: { id: true },
      });

  const fail = async (status: 'FAILED' | 'REJECTED', error: string, extra?: Record<string, unknown>) => {
    await prisma.contentJob.update({
      where: { id: job.id },
      data: { status, error: error.slice(0, 1000), finishedAt: new Date(), ...extra },
    });
    return { jobId: job.id, keyword: candidate.keyword, status, error } satisfies JobOutcome;
  };

  try {
    const brief = await researchKeyword(candidate.keyword);

    await prisma.contentJob.update({
      where: { id: job.id },
      data: {
        sources: brief.sources,
        brief: { questions: brief.questions, relatedTerms: brief.relatedTerms, usedSerp: brief.usedSerp },
      },
    });

    const written = await writeArticle({
      brief,
      internalLinks: context.internalLinks,
      categories: context.categories.map((c) => ({ slug: c.slug, name: c.name })),
      existingTags: context.existingTags,
      brandName: context.brandName,
      cloudRegisterUrl: context.cloudRegisterUrl,
    });

    // تیتر سطح یک دلیل رد شدن نیست؛ درست‌شدنی است
    written.article.content = normalizeHeadings(written.article.content, written.article.title);

    const verdict = await checkArticle({
      article: written.article,
      keyword: candidate.keyword,
      sources: brief.sources,
      minSeoScore: context.minSeoScore,
      minWords: context.minWords,
    });

    if (!verdict.ok) {
      await prisma.contentJob.update({
        where: { id: job.id },
        data: {
          status: 'REJECTED',
          error: verdict.reasons.join(' | ').slice(0, 1000),
          seoScore: verdict.seoScore,
          wordCount: verdict.wordCount,
          model: written.model,
          inputTokens: written.inputTokens,
          outputTokens: written.outputTokens,
          finishedAt: new Date(),
        },
      });
      return {
        jobId: job.id,
        keyword: candidate.keyword,
        status: 'REJECTED',
        reasons: verdict.reasons,
        seoScore: verdict.seoScore,
        wordCount: verdict.wordCount,
      };
    }

    // دسته: اول پیشنهاد مدل، بعد دسته پیشنهادی کلیدواژه، در نهایت دسته پیش‌فرض
    const category =
      context.categories.find((c) => c.slug === written.article.categorySlug) ??
      context.categories.find((c) => c.slug === candidate.categorySlug) ??
      null;

    // اگر نویسنده نموداری نگذاشته بود، یکی از ساختار خود مقاله ساخته می‌شود
    const content = context.autoFigures
      ? (withAutoFigure(written.article.content)?.content ?? written.article.content)
      : written.article.content;

    const { data } = await buildPostData({
      title: written.article.title,
      slug: written.article.slug,
      excerpt: written.article.excerpt,
      content,
      metaTitle: written.article.metaTitle,
      metaDescription: written.article.metaDescription,
      focusKeyword: candidate.keyword,
      keywords: written.article.tags.join(', '),
      coverAlt: written.article.coverAlt,
      faqs: written.article.faqs,
      status: context.autoPublish ? 'PUBLISHED' : 'DRAFT',
      categoryId: category?.id ?? null,
      tags: written.article.tags,
      authorName: context.author.name,
      authorTitle: context.author.title,
      authorBio: context.author.bio,
    });

    const post = await prisma.blogPost.create({ data, select: { id: true, slug: true, status: true } });
    await syncTags(post.id, written.article.tags);

    // مقاله منتشرشده را فوری به موتورهای جستجو اعلام می‌کنیم
    if (context.autoPublish) await submitToIndexNow([`/blog/${post.slug}`, '/blog']);

    const status = context.autoPublish ? 'PUBLISHED' : 'DRAFTED';
    await prisma.contentJob.update({
      where: { id: job.id },
      data: {
        status,
        postId: post.id,
        seoScore: verdict.seoScore,
        wordCount: verdict.wordCount,
        model: written.model,
        inputTokens: written.inputTokens,
        outputTokens: written.outputTokens,
        finishedAt: new Date(),
      },
    });

    await audit({
      actorType: 'system',
      action: context.autoPublish ? 'content.auto_publish' : 'content.auto_draft',
      entity: 'blog_post',
      entityId: post.id,
      meta: {
        keyword: candidate.keyword,
        slug: post.slug,
        seoScore: verdict.seoScore,
        wordCount: verdict.wordCount,
        model: written.model,
        usedSerp: brief.usedSerp,
      },
    });

    return {
      jobId: job.id,
      keyword: candidate.keyword,
      status,
      postId: post.id,
      slug: post.slug,
      seoScore: verdict.seoScore,
      wordCount: verdict.wordCount,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'خطای ناشناخته در تولید مقاله.';
    return fail('FAILED', message);
  }
}

/**
 * اجرای خط تولید.
 * `force` برای اجرای دستی از پنل است و کلید «فعال بودن» را نادیده می‌گیرد.
 */
export async function runContentPipeline(
  options: { count?: number; force?: boolean; jobIds?: string[] } = {},
): Promise<PipelineResult> {
  const settings = await getSettings();
  const requested = Math.max(1, Math.min(10, options.count ?? settings.contentPerDay));

  const empty: PipelineResult = {
    requested,
    produced: 0,
    published: 0,
    drafted: 0,
    failed: 0,
    outcomes: [],
  };

  if (!options.force && !settings.contentAutoEnabled) {
    return { ...empty, skipped: 'تولید خودکار محتوا در تنظیمات خاموش است.' };
  }
  if (!env.content.apiKey) {
    return { ...empty, skipped: 'کلید ANTHROPIC_API_KEY تنظیم نشده است.' };
  }

  const categories = await prisma.blogCategory.findMany({
    where: { active: true },
    select: { id: true, slug: true, name: true },
    orderBy: { order: 'asc' },
  });
  if (!categories.length) {
    return { ...empty, skipped: 'هیچ دسته‌ای در وبلاگ نیست؛ اول دسته بسازید (یا npm run blog:seed را اجرا کنید).' };
  }

  // دسته پیش‌فرض تنظیمات، اگر وجود داشته باشد، اول فهرست می‌آید تا وقتی
  // مدل دسته‌ای پیشنهاد نکرد، همین انتخاب شود
  const fallback = categories.find((c) => c.slug === settings.contentFallbackCategory);
  const ordered = fallback ? [fallback, ...categories.filter((c) => c.id !== fallback.id)] : categories;

  const site = await siteInfo();
  const cloud = cloudLinks(site);
  const internalLinks = await internalLinkPool(cloud);

  // پرکاربردترین برچسب‌ها، تا نویسنده به‌جای ساختن برچسب تازه از همین‌ها استفاده کند
  const tagRows = await prisma.blogTag.findMany({
    select: { name: true, _count: { select: { posts: true } } },
    orderBy: { posts: { _count: 'desc' } },
    take: 60,
  });
  const existingTags = tagRows.filter((t) => t._count.posts > 0).map((t) => ({ name: t.name, posts: t._count.posts }));

  // اول صف دستی مدیر، بعد موضوع‌های کشف‌شده. چند نامزد بیشتر برمی‌داریم،
  // چون بعضی موضوع‌ها از دروازه کیفیت رد نمی‌شوند.
  const queued = await queuedCandidates(options.jobIds?.length ? options.jobIds.length : requested, options.jobIds);
  const discovered = options.jobIds?.length
    ? []
    : queued.length >= requested
      ? []
      : await discoverKeywords((requested - queued.length) * 3);
  const candidates: QueuedCandidate[] = [...queued, ...discovered];

  if (!candidates.length) {
    return {
      ...empty,
      skipped: options.jobIds?.length
        ? 'این موضوع‌ها در صف پیدا نشدند.'
        : 'موضوع تازه‌ای پیدا نشد؛ عبارت‌های کشف‌شده قبلاً استفاده شده‌اند. از بخش «افزودن موضوع» کلیدواژه دلخواه را دستی در صف بگذارید.',
    };
  }

  const context = {
    categories: ordered,
    internalLinks,
    existingTags,
    brandName: settings.brandName,
    cloudRegisterUrl: cloud.register,
    author: {
      name: settings.defaultAuthorName || `تیم فنی ${settings.brandName}`,
      title: settings.defaultAuthorTitle || 'مهندسی زیرساخت',
      bio:
        settings.defaultAuthorBio ||
        `تیم فنی ${settings.brandName} — تجربه‌های راه‌اندازی و نگهداری سرور ابری را به زبان ساده می‌نویسیم.`,
    },
    autoPublish: settings.contentAutoPublish,
    minSeoScore: settings.contentMinSeoScore,
    minWords: settings.contentMinWords,
    autoFigures: settings.blogAutoFigures,
  };

  const outcomes: JobOutcome[] = [];
  let produced = 0;

  for (const candidate of candidates) {
    if (produced >= requested) break;

    // ممکن است همین موضوع در فاصله کشف تا اینجا ثبت شده باشد
    const exists = await prisma.contentJob.findUnique({
      where: { keywordNorm: candidate.keywordNorm },
      select: { id: true },
    });
    if (exists) continue;

    const outcome = await processCandidate(candidate, context);
    outcomes.push(outcome);
    if (outcome.status === 'PUBLISHED' || outcome.status === 'DRAFTED') produced++;
  }

  const published = outcomes.filter((o) => o.status === 'PUBLISHED').length;
  const drafted = outcomes.filter((o) => o.status === 'DRAFTED').length;
  const failed = outcomes.filter((o) => o.status === 'FAILED' || o.status === 'REJECTED').length;

  return { requested, produced, published, drafted, failed, outcomes };
}

/** آمار خط تولید برای پنل مدیریت */
export async function pipelineStats() {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const [counts, tokens, today] = await Promise.all([
    prisma.contentJob.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.contentJob.aggregate({
      where: { createdAt: { gte: since } },
      _sum: { inputTokens: true, outputTokens: true },
    }),
    prisma.contentJob.count({
      where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    }),
  ]);

  const byStatus = (status: string) => counts.find((c) => c.status === status)?._count._all ?? 0;

  return {
    total: counts.reduce((sum, c) => sum + c._count._all, 0),
    published: byStatus('PUBLISHED'),
    drafted: byStatus('DRAFTED'),
    rejected: byStatus('REJECTED'),
    failed: byStatus('FAILED'),
    today,
    tokens30d: {
      input: Number(tokens._sum.inputTokens ?? 0),
      output: Number(tokens._sum.outputTokens ?? 0),
    },
  };
}
