import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, parseBody, pagination, paged, route } from '@/lib/api';
import { requireAdmin, requireStaff, clientIp, assertSameOrigin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { env } from '@/lib/env';
import { runContentPipeline, pipelineStats } from '@/lib/content/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** تولید چند مقاله ممکن است چند دقیقه طول بکشد */
export const maxDuration = 300;

/** صف و تاریخچه تولید محتوا */
export const GET = route(async (req: Request) => {
  await requireStaff();
  const { page, perPage, skip, take } = pagination(req, { page: 1, perPage: 20, maxPerPage: 50 });

  const [items, total, stats] = await Promise.all([
    prisma.contentJob.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        keyword: true,
        source: true,
        score: true,
        status: true,
        seoScore: true,
        wordCount: true,
        model: true,
        inputTokens: true,
        outputTokens: true,
        error: true,
        createdAt: true,
        finishedAt: true,
        post: { select: { id: true, slug: true, title: true, status: true } },
      },
    }),
    prisma.contentJob.count(),
    pipelineStats(),
  ]);

  return ok({
    ...paged(items, total, page, perPage),
    stats,
    config: {
      /** بدون کلید، خط تولید اجرا نمی‌شود */
      apiKeyReady: Boolean(env.content.apiKey),
      model: env.content.model,
      serpProvider: env.content.serpProvider,
      serpKeyReady: Boolean(env.content.serpKey),
    },
  });
});

const runSchema = z.object({ count: z.coerce.number().int().min(1).max(5).optional() });

/** اجرای دستی خط تولید — کلید «فعال بودن» را نادیده می‌گیرد */
export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { count } = await parseBody(req, runSchema);

  const result = await runContentPipeline({ count: count ?? 1, force: true });

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.content_run',
    entity: 'content_job',
    ip: await clientIp(),
    meta: {
      requested: result.requested,
      published: result.published,
      drafted: result.drafted,
      failed: result.failed,
      skipped: result.skipped,
    },
  });

  const message = result.skipped
    ? result.skipped
    : `${result.produced} مقاله ساخته شد (${result.published} منتشرشده، ${result.drafted} پیش‌نویس).`;

  return ok({ result, message });
});
