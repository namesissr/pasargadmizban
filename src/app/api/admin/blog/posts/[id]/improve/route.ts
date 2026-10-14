import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireAdmin, requireStaff, clientIp, assertSameOrigin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { env } from '@/lib/env';
import { renderMarkdown } from '@/lib/markdown';
import { siteInfo, ownHosts, absoluteUrl } from '@/lib/seo';
import { getSettings } from '@/lib/settings';
import { importedPostTotals } from '@/lib/gsc-import/store';
import { applyImprovement, generateImprovement, revertImprovement } from '@/lib/content/refresh';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** نوشتن نسخه بهتر چند دقیقه طول می‌کشد */
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

/** وضعیت بهبود یک مقاله: پیشنهاد آماده (با پیش‌نمایش) و نسخه قابل بازگشت */
export const GET = route(async (_req: Request, ctx: Ctx) => {
  await requireStaff();
  const { id } = await ctx.params;

  const post = await prisma.blogPost.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      wordCount: true,
      seoScore: true,
      metaTitle: true,
      metaDescription: true,
      faqs: true,
      updatedAt: true,
    },
  });
  if (!post) throw new ApiError('مقاله یافت نشد.', 404);

  const [suggestion, backup, totals] = await Promise.all([
    prisma.blogPostRevision.findFirst({ where: { postId: id, kind: 'suggestion' }, orderBy: { createdAt: 'desc' } }),
    prisma.blogPostRevision.findFirst({
      where: { postId: id, kind: 'backup' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, wordCount: true, seoScore: true, createdAt: true },
    }),
    importedPostTotals(id).catch(() => null),
  ]);

  const [site, settings] = await Promise.all([siteInfo(), getSettings()]);
  const hosts = ownHosts(site);
  return ok({
    url: absoluteUrl((settings.siteUrl || env.appUrl).replace(/\/+$/, ''), `/blog/${post.slug}`),
    post: { ...post, faqCount: Array.isArray(post.faqs) ? post.faqs.length : 0, faqs: undefined },
    suggestion: suggestion
      ? {
          id: suggestion.id,
          title: suggestion.title,
          metaTitle: suggestion.metaTitle,
          metaDescription: suggestion.metaDescription,
          excerpt: suggestion.excerpt,
          faqs: suggestion.faqs,
          changes: suggestion.changes,
          issues: suggestion.issues,
          seoScore: suggestion.seoScore,
          wordCount: suggestion.wordCount,
          createdAt: suggestion.createdAt,
          html: renderMarkdown(suggestion.content, { ownHosts: hosts, slug: post.slug }).html,
        }
      : null,
    backup,
    totals,
    aiReady: Boolean(env.content.apiKey),
  });
});

const schema = z.object({ action: z.enum(['generate', 'apply', 'discard', 'revert']) });

function refresh(slug: string) {
  revalidatePath('/blog');
  revalidatePath('/');
  revalidatePath(`/blog/${slug}`);
}

export const POST = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const { action } = await parseBody(req, schema);
  const ip = await clientIp();

  if (action === 'generate') {
    const result = await generateImprovement(id, admin.id);
    await audit({
      userId: admin.id,
      actorType: 'admin',
      action: 'admin.blog_improve',
      entity: 'blog_post',
      entityId: id,
      ip,
      meta: { seoScore: result.seoScore, wordCount: result.wordCount, issues: result.issues.length, ...result.usage },
    });
    return ok({
      ...result,
      message: result.issues.length
        ? 'نسخه بهتر آماده شد، ولی چند هشدار دارد؛ پیش از اعمال نگاهش کنید.'
        : 'نسخه بهتر آماده شد؛ پیش‌نمایش را ببینید و اگر خوب بود اعمالش کنید.',
    });
  }

  if (action === 'discard') {
    const { count } = await prisma.blogPostRevision.deleteMany({ where: { postId: id, kind: 'suggestion' } });
    if (!count) throw new ApiError('پیشنهادی برای دور انداختن نیست.', 404);
    return ok({ message: 'پیشنهاد دور انداخته شد.' });
  }

  if (action === 'apply') {
    const result = await applyImprovement(id, admin.id);
    refresh(result.post.slug);
    await audit({
      userId: admin.id,
      actorType: 'admin',
      action: 'admin.blog_improve_apply',
      entity: 'blog_post',
      entityId: id,
      ip,
      meta: {
        slug: result.post.slug,
        title: result.post.title,
        wordCount: { from: result.previous.wordCount, to: result.post.wordCount },
        seoScore: { from: result.previous.seoScore, to: result.seoScore },
      },
    });
    return ok({
      post: result.post,
      message: 'نسخه بهتر روی مقاله نشست. حالا در سرچ کنسول برای همین نشانی Request indexing بزنید.',
    });
  }

  const result = await revertImprovement(id);
  refresh(result.post.slug);
  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.blog_improve_revert',
    entity: 'blog_post',
    entityId: id,
    ip,
    meta: { slug: result.post.slug, title: result.post.title },
  });
  return ok({ post: result.post, message: 'مقاله به نسخه قبلی برگشت.' });
});
