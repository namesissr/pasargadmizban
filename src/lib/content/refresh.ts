import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { z } from 'zod';
import prisma from '../prisma';
import { env } from '../env';
import { ApiError } from '../errors';
import { getSettings } from '../settings';
import { siteInfo, cloudLinks, absoluteUrl } from '../seo';
import { buildPostData, type PostInput } from '../blog-admin';
import { submitToIndexNow } from '../indexnow';
import { withAutoFigure } from '../images/auto-figures';
import { gscConfigured, pagePerformance } from '../gsc';
import { importedPostTotals, postQueries } from '../gsc-import/store';
import type { MetricRow, Metrics } from '../gsc-import/parse';
import { WRITER_SYSTEM } from './writer';
import { researchKeyword, type ResearchBrief } from './research';
import { checkArticle, normalizeHeadings } from './quality';
import { internalLinkPool } from './pipeline';

/**
 * بهبود مقاله موجود با هوش مصنوعی.
 *
 * برای مقاله‌ای که گوگل نزدیک صفحه اول نشانش می‌دهد، کامل‌تر کردن همان
 * صفحه (با همان نشانی) خیلی زودتر از مقاله تازه نتیجه می‌دهد: اعتباری که
 * صفحه تا حالا گرفته حفظ می‌شود و فقط پاسخ بهتری به همان جستجوها می‌دهد.
 *
 * نسخه بهترشده مستقیم منتشر نمی‌شود: به صورت «پیشنهاد» ذخیره می‌شود، مدیر
 * می‌بیند و اعمالش می‌کند، و نسخه قبلی برای بازگشت نگه داشته می‌شود.
 */

const KEEP_BACKUPS = 5;

const improvedSchema = z.object({
  title: z.string().trim().min(10).max(120),
  metaTitle: z.string().trim().min(10).max(70),
  metaDescription: z.string().trim().min(60).max(180),
  excerpt: z.string().trim().min(40).max(300),
  content: z.string().min(1500),
  faqs: z
    .array(z.object({ q: z.string().trim().min(8).max(200), a: z.string().trim().min(20).max(900) }))
    .min(2)
    .max(6),
  changes: z.array(z.string().trim().min(3).max(200)).min(1).max(10),
});

type Improved = z.infer<typeof improvedSchema>;

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'metaTitle', 'metaDescription', 'excerpt', 'content', 'faqs', 'changes'],
  properties: {
    title: { type: 'string', description: 'عنوان مقاله؛ اگر عنوان فعلی خوب است همان را برگردان' },
    metaTitle: { type: 'string', description: 'عنوان سئو، ۳۰ تا ۶۰ نویسه، جذاب برای کلیک' },
    metaDescription: { type: 'string', description: 'توضیح متا، ۱۲۰ تا ۱۶۰ نویسه، شامل کلیدواژه و دلیل کلیک' },
    excerpt: { type: 'string', description: 'خلاصه یک تا دو جمله‌ای' },
    content: { type: 'string', description: 'متن کامل نسخه بهترشده به مارک‌داون' },
    faqs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['q', 'a'],
        properties: { q: { type: 'string' }, a: { type: 'string' } },
      },
      description: 'سه تا پنج پرسش پرتکرار با پاسخ کوتاه',
    },
    changes: {
      type: 'array',
      items: { type: 'string' },
      description: 'فهرست کوتاه تغییرهای اصلی به فارسی، هر کدام یک جمله (برای مدیر سایت)',
    },
  },
} as const;

const IMPROVE_RULES = `

### این بار: بهتر کردن مقاله‌ای که منتشر شده
مقاله‌ای که می‌گیری همین حالا در گوگل ایندکس شده و نزدیک صفحه اول است. کارت بازنویسی از صفر نیست؛ کامل‌تر و دقیق‌تر کردن همان صفحه است تا برای همان جستجوها بهترین پاسخ باشد.
• موضوع و نیت جستجو را عوض نکن. کلیدواژه هدف همان می‌ماند.
• بخش‌های درست و خوب را نگه دار؛ فقط جایی را بازنویسی کن که ضعیف، کلی یا قدیمی است.
• عبارت‌هایی که این صفحه با آن‌ها در گوگل دیده شده ولی متن پاسخشان را نمی‌دهد، مهم‌ترین چیزند: برایشان بخش یا پاراگراف مشخص بنویس.
• پرسش‌های کاربران را که جوابشان در متن نیست، اضافه کن (در متن یا FAQ).
• لینک‌های داخلی و بلوک‌های :::figure و :::tip موجود را نگه دار مگر واقعاً نادرست باشند. لینک داخلی تازه فقط از فهرست مجاز.
• عنوان را فقط وقتی عوض کن که واقعاً کلیک‌خورتر و دقیق‌تر می‌شود؛ کلیدواژه هدف در عنوان بماند. عنوان سئو و توضیح متا را حتماً جذاب و مشخص بنویس، چون نرخ کلیک از همین‌ها می‌آید.
• طول: دست‌کم به اندازه نسخه فعلی و معمولاً ۲۰ تا ۴۰ درصد بیشتر — ولی فقط با مطلب مفید، نه تکرار و پرگویی. سقف ۱۵۰۰ کلمه برای این کار نیست.
• در changes، تغییرهای اصلی را برای مدیر سایت در چند جمله کوتاه بنویس.`;

const fa = (n: number) => new Intl.NumberFormat('fa-IR').format(n);

/** جلوی دو درخواست هم‌زمان برای یک مقاله را می‌گیرد (هر کدام هزینه دارد) */
const running = new Set<string>();

async function loadPost(postId: string) {
  const post = await prisma.blogPost.findUnique({
    where: { id: postId },
    include: { tags: { select: { tag: { select: { name: true } } } }, category: { select: { slug: true } } },
  });
  if (!post) throw new ApiError('مقاله یافت نشد.', 404);
  return post;
}

type Performance = { totals: Metrics | null; queries: MetricRow[]; querySource: 'api' | 'page' | 'related' | null };

/** آمار گوگل مقاله، از API یا از خروجی بارگذاری‌شده */
async function performanceOf(post: { id: string; slug: string; title: string; focusKeyword: string | null }): Promise<Performance> {
  if (gscConfigured()) {
    try {
      const settings = await getSettings();
      const url = absoluteUrl((settings.siteUrl || env.appUrl).replace(/\/+$/, ''), `/blog/${post.slug}`);
      const perf = await pagePerformance(url, 90);
      return {
        totals: perf.totals,
        queries: perf.queries.map((q) => ({ key: q.keys[0] ?? '', clicks: q.clicks, impressions: q.impressions, ctr: q.ctr, position: q.position })),
        querySource: 'api',
      };
    } catch {
      // اگر API کار نکرد، سراغ خروجی بارگذاری‌شده می‌رویم
    }
  }
  const [totals, queries] = await Promise.all([importedPostTotals(post.id), postQueries(post)]);
  return { totals, queries: queries?.queries ?? [], querySource: queries?.source ?? null };
}

function buildPrompt(input: {
  post: Awaited<ReturnType<typeof loadPost>>;
  keyword: string;
  perf: Performance;
  brief: ResearchBrief | null;
  links: { path: string; title: string }[];
  brandName: string;
  registerUrl: string;
}): string {
  const { post, keyword, perf, brief, links } = input;
  const faqs = (post.faqs as { q: string; a: string }[] | null) ?? [];
  const t = perf.totals;

  const stats = t
    ? `جایگاه میانگین ${t.position.toFixed(1)}، ${t.impressions} نمایش، ${t.clicks} کلیک، نرخ کلیک ${(t.ctr * 100).toFixed(1)}٪`
    : 'آمار گوگل در دسترس نیست.';

  const queries = perf.queries.length
    ? perf.queries
        .slice(0, 30)
        .map((q) => `• ${q.key} — جایگاه ${q.position.toFixed(1)}، ${q.impressions} نمایش، ${q.clicks} کلیک`)
        .join('\n')
    : '• (داده‌ای نیست)';
  const queryNote =
    perf.querySource === 'related'
      ? 'این عبارت‌ها از آمار کل سایت و از روی شباهت با عنوان انتخاب شده‌اند؛ ممکن است بعضی‌شان مربوط به صفحه دیگری باشند. فقط آن‌هایی را پوشش بده که واقعاً به موضوع این مقاله مربوط‌اند.'
      : 'این‌ها عبارت‌های واقعی‌ای است که همین صفحه با آن‌ها در گوگل نمایش گرفته.';

  const sources = brief?.sources.length
    ? brief.sources.map((s, i) => `${i + 1}. ${s.title} — ${s.url}\n   خلاصه گوگل: ${s.snippet}`).join('\n')
    : '— در دسترس نیست.';

  return `کلیدواژه هدف: «${keyword}»

این مقاله منتشرشده را بهتر کن.

آمار گوگل این صفحه: ${stats}

عبارت‌های جستجو:
${queries}
${queryNote}

پرسش‌هایی که کاربران در گوگل جستجو می‌کنند:
${brief?.questions.length ? brief.questions.map((q) => `• ${q}`).join('\n') : '• (موردی یافت نشد)'}

عبارت‌های مرتبط:
${brief?.relatedTerms.length ? brief.relatedTerms.map((q) => `• ${q}`).join('\n') : '• (موردی یافت نشد)'}

نتایج فعلی بالای گوگل — فقط برای فهمیدن اینکه رقبا چه چیزی را پوشش داده‌اند. از این‌ها هیچ جمله‌ای برنمی‌داری:
${sources}

لینک‌های داخلی مجاز:
${links.map((l) => `• [${l.title}](${l.path})`).join('\n')}

نام برند: ${input.brandName}. دعوت پایانی به ساخت سرور (اگر در متن فعلی هست، نگهش دار) با این لینک: [ساخت سرور ساعتی ایران و خارج](${input.registerUrl})

──────── مقاله فعلی ────────
عنوان: ${post.title}
عنوان سئو: ${post.metaTitle ?? '—'}
توضیح متا: ${post.metaDescription ?? '—'}
خلاصه: ${post.excerpt}
شمار کلمه: ${post.wordCount}

متن:
${post.content}

پرسش‌های پرتکرار فعلی:
${faqs.length ? faqs.map((f) => `• ${f.q}\n  ${f.a}`).join('\n') : '• (ندارد)'}
──────── پایان مقاله فعلی ────────

خروجی را دقیقاً در قالب JSON خواسته‌شده بده.`;
}

/** نسخه بهترشده را می‌سازد و به صورت پیشنهاد ذخیره می‌کند */
export async function generateImprovement(postId: string, userId: string | null) {
  if (!env.content.apiKey) {
    throw new ApiError('کلید ANTHROPIC_API_KEY تنظیم نشده است؛ بدون آن بهبود مقاله ممکن نیست.', 503);
  }
  if (running.has(postId)) throw new ApiError('بهبود این مقاله همین حالا در جریان است؛ چند دقیقه صبر کنید.', 409);
  running.add(postId);

  try {
    const post = await loadPost(postId);
    const [settings, site] = await Promise.all([getSettings(), siteInfo()]);
    const keyword = post.focusKeyword?.trim() || post.title;

    const [perf, brief, pool] = await Promise.all([
      performanceOf(post),
      researchKeyword(keyword).catch(() => null),
      internalLinkPool(cloudLinks(site)),
    ]);
    const links = pool.filter((l) => l.path !== `/blog/${post.slug}`);

    const client = new Anthropic({ apiKey: env.content.apiKey, maxRetries: 2 });
    const response = await client.messages.parse({
      model: env.content.model,
      max_tokens: 20000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: jsonSchemaOutputFormat(OUTPUT_SCHEMA) },
      system: WRITER_SYSTEM + IMPROVE_RULES,
      messages: [
        {
          role: 'user',
          content: buildPrompt({
            post,
            keyword,
            perf,
            brief,
            links,
            brandName: settings.brandName,
            registerUrl: cloudLinks(site).register,
          }),
        },
      ],
    });

    if (response.stop_reason === 'refusal') throw new ApiError('مدل بازنویسی این مقاله را رد کرد.', 422);
    if (response.stop_reason === 'max_tokens') throw new ApiError('پاسخ مدل نیمه‌کاره ماند؛ دوباره امتحان کنید.', 502);

    const parsed = improvedSchema.safeParse(response.parsed_output);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new ApiError(`خروجی مدل با ساختار مقاله نخواند: ${first?.path.join('.') || '?'} — ${first?.message ?? ''}`, 502);
    }

    const improved: Improved = parsed.data;
    let content = normalizeHeadings(improved.content, improved.title);
    if (settings.blogAutoFigures) content = withAutoFigure(content)?.content ?? content;

    const verdict = await checkArticle({
      article: {
        title: improved.title,
        slug: post.slug,
        excerpt: improved.excerpt,
        metaTitle: improved.metaTitle,
        metaDescription: improved.metaDescription,
        content,
        tags: post.tags.map((t) => t.tag.name),
        faqs: improved.faqs,
        coverAlt: post.coverAlt || improved.title,
        categorySlug: post.category?.slug,
      },
      keyword,
      sources: brief?.sources ?? [],
      minSeoScore: settings.contentMinSeoScore,
      minWords: settings.contentMinWords,
      excludePostId: post.id,
    });

    const issues = [...verdict.reasons];
    if (post.wordCount && verdict.wordCount < post.wordCount * 0.9) {
      issues.push(`نسخه تازه ${fa(verdict.wordCount)} کلمه است و از نسخه فعلی (${fa(post.wordCount)} کلمه) کوتاه‌تر شده.`);
    }

    await prisma.blogPostRevision.deleteMany({ where: { postId, kind: 'suggestion' } });
    const revision = await prisma.blogPostRevision.create({
      data: {
        postId,
        kind: 'suggestion',
        title: improved.title,
        excerpt: improved.excerpt,
        content,
        metaTitle: improved.metaTitle,
        metaDescription: improved.metaDescription,
        faqs: improved.faqs,
        changes: improved.changes,
        issues,
        seoScore: verdict.seoScore,
        wordCount: verdict.wordCount,
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        createdById: userId,
      },
      select: { id: true },
    });

    return {
      revisionId: revision.id,
      issues,
      seoScore: verdict.seoScore,
      wordCount: verdict.wordCount,
      usage: { model: response.model, input: response.usage.input_tokens, output: response.usage.output_tokens },
    };
  } finally {
    running.delete(postId);
  }
}

type Fields = {
  title: string;
  excerpt: string;
  content: string;
  metaTitle: string | null;
  metaDescription: string | null;
  faqs: unknown;
};

/** متن تازه را روی مقاله می‌نشاند؛ نشانی، تاریخ انتشار، دسته و برچسب‌ها دست نمی‌خورند */
async function writeFields(post: Awaited<ReturnType<typeof loadPost>>, fields: Fields) {
  const input: PostInput = {
    title: fields.title,
    slug: post.slug,
    excerpt: fields.excerpt,
    content: fields.content,
    coverImage: post.coverImage ?? undefined,
    coverAlt: post.coverAlt ?? undefined,
    metaTitle: fields.metaTitle ?? undefined,
    metaDescription: fields.metaDescription ?? undefined,
    focusKeyword: post.focusKeyword ?? undefined,
    keywords: post.keywords ?? undefined,
    canonicalUrl: post.canonicalUrl ?? undefined,
    ogImage: post.ogImage ?? undefined,
    noindex: post.noindex,
    faqs: (fields.faqs as { q: string; a: string }[]) ?? [],
    status: post.status,
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    featured: post.featured,
    categoryId: post.categoryId,
    tags: post.tags.map((t) => t.tag.name),
    authorName: post.authorName ?? undefined,
    authorTitle: post.authorTitle ?? undefined,
    authorBio: post.authorBio ?? undefined,
  };

  const { data, report } = await buildPostData(input, post.id);
  const updated = await prisma.blogPost.update({
    where: { id: post.id },
    data,
    select: { id: true, slug: true, title: true, status: true, wordCount: true, seoScore: true },
  });
  if (updated.status === 'PUBLISHED') await submitToIndexNow([`/blog/${updated.slug}`]);
  return { post: updated, seoScore: report.score };
}

/** پیشنهاد را اعمال می‌کند و نسخه فعلی را برای بازگشت نگه می‌دارد */
export async function applyImprovement(postId: string, userId: string | null) {
  const post = await loadPost(postId);
  const suggestion = await prisma.blogPostRevision.findFirst({
    where: { postId, kind: 'suggestion' },
    orderBy: { createdAt: 'desc' },
  });
  if (!suggestion) throw new ApiError('پیشنهادی برای اعمال نیست؛ اول نسخه بهتر را بسازید.', 404);

  await prisma.blogPostRevision.create({
    data: {
      postId,
      kind: 'backup',
      title: post.title,
      excerpt: post.excerpt,
      content: post.content,
      metaTitle: post.metaTitle,
      metaDescription: post.metaDescription,
      faqs: post.faqs ?? [],
      seoScore: post.seoScore,
      wordCount: post.wordCount,
      createdById: userId,
    },
  });

  const result = await writeFields(post, suggestion);
  await prisma.blogPostRevision.delete({ where: { id: suggestion.id } });

  // نسخه‌های پشتیبان قدیمی‌تر از چند تای آخر لازم نیست
  const stale = await prisma.blogPostRevision.findMany({
    where: { postId, kind: 'backup' },
    orderBy: { createdAt: 'desc' },
    skip: KEEP_BACKUPS,
    select: { id: true },
  });
  if (stale.length) await prisma.blogPostRevision.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });

  return { ...result, previous: { title: post.title, wordCount: post.wordCount, seoScore: post.seoScore } };
}

/** مقاله را به نسخه پیش از آخرین بهبود برمی‌گرداند */
export async function revertImprovement(postId: string) {
  const post = await loadPost(postId);
  const backup = await prisma.blogPostRevision.findFirst({
    where: { postId, kind: 'backup' },
    orderBy: { createdAt: 'desc' },
  });
  if (!backup) throw new ApiError('نسخه قبلی‌ای برای بازگشت نیست.', 404);

  const result = await writeFields(post, backup);
  await prisma.blogPostRevision.delete({ where: { id: backup.id } });
  return result;
}
