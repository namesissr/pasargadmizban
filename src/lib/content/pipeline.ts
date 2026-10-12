import prisma from '../prisma';
import { audit } from '../audit';
import { env } from '../env';
import { getSettings } from '../settings';
import { buildPostData, syncTags } from '../blog-admin';
import { publishedWhere } from '../blog';
import { discoverKeywords, type KeywordCandidate } from './keywords';
import { researchKeyword } from './research';
import { writeArticle, type InternalLink } from './writer';
import { checkArticle } from './quality';

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

/** لینک‌های داخلی مجاز: صفحه‌های فروش + مقاله‌های موجود */
async function internalLinkPool(): Promise<InternalLink[]> {
  const posts = await prisma.blogPost.findMany({
    where: publishedWhere(),
    select: { slug: true, title: true },
    orderBy: { publishedAt: 'desc' },
    take: 10,
  });

  return [
    { path: '/register', title: 'ثبت‌نام و ساخت سرور' },
    { path: '/#pricing', title: 'قیمت سرورهای ابری' },
    { path: '/blog', title: 'وبلاگ' },
    ...posts.map((p) => ({ path: `/blog/${p.slug}`, title: p.title })),
  ];
}

/** یک موضوع را از صفر تا مقاله می‌برد */
async function processCandidate(
  candidate: KeywordCandidate,
  context: {
    categories: { id: string; slug: string; name: string }[];
    internalLinks: InternalLink[];
    brandName: string;
    autoPublish: boolean;
    minSeoScore: number;
    minWords: number;
  },
): Promise<JobOutcome> {
  // رکورد صف را اول می‌سازیم تا اگر همین موضوع در اجرای بعدی هم آمد، تکرار نشود
  const job = await prisma.contentJob.create({
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
      brandName: context.brandName,
    });

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

    const { data } = await buildPostData({
      title: written.article.title,
      slug: written.article.slug,
      excerpt: written.article.excerpt,
      content: written.article.content,
      metaTitle: written.article.metaTitle,
      metaDescription: written.article.metaDescription,
      focusKeyword: candidate.keyword,
      keywords: written.article.tags.join(', '),
      coverAlt: written.article.coverAlt,
      faqs: written.article.faqs,
      status: context.autoPublish ? 'PUBLISHED' : 'DRAFT',
      categoryId: category?.id ?? null,
      tags: written.article.tags,
      authorName: `تیم فنی ${context.brandName}`,
      authorTitle: 'مهندسی زیرساخت',
    });

    const post = await prisma.blogPost.create({ data, select: { id: true, slug: true, status: true } });
    await syncTags(post.id, written.article.tags);

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
export async function runContentPipeline(options: { count?: number; force?: boolean } = {}): Promise<PipelineResult> {
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

  const internalLinks = await internalLinkPool();

  // چند نامزد بیشتر برمی‌داریم، چون بعضی موضوع‌ها از دروازه کیفیت رد نمی‌شوند
  const candidates = await discoverKeywords(requested * 3);
  if (!candidates.length) {
    return { ...empty, skipped: 'موضوع تازه‌ای پیدا نشد؛ عبارت‌های کشف‌شده قبلاً استفاده شده‌اند.' };
  }

  const context = {
    categories: ordered,
    internalLinks,
    brandName: settings.brandName,
    autoPublish: settings.contentAutoPublish,
    minSeoScore: settings.contentMinSeoScore,
    minWords: settings.contentMinWords,
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
