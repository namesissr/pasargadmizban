import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireAdmin, clientIp, assertSameOrigin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { normalizeFa } from '@/lib/seo-score';
import { runContentPipeline } from '@/lib/content/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** نوشتن فوری یک مقاله چند دقیقه طول می‌کشد */
export const maxDuration = 300;

const schema = z.object({
  keyword: z.string().trim().min(3, 'کلیدواژه دست‌کم ۳ نویسه باشد.').max(120),
  /** دسته پیشنهادی برای مقاله */
  categorySlug: z.string().trim().max(80).optional(),
  /** همین حالا نوشته شود یا در نوبت اجرای بعدی بماند */
  runNow: z.boolean().optional(),
});

/**
 * افزودن کلیدواژه دلخواه به صف تولید.
 *
 * کشف خودکار موضوع کارش را می‌کند، ولی شما بازار خودتان را بهتر می‌شناسید:
 * عبارتی که مشتری‌ها در تیکت‌ها می‌پرسند، همان است که باید رویش مقاله باشد.
 * موضوع‌های دستی اول نوبت نوشته می‌شوند.
 */
export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { keyword, categorySlug, runNow } = await parseBody(req, schema);

  const keywordNorm = normalizeFa(keyword);
  if (!keywordNorm) throw new ApiError('کلیدواژه معتبر نیست.', 422, { fields: { keyword: 'معتبر نیست.' } });

  const existing = await prisma.contentJob.findUnique({
    where: { keywordNorm },
    select: { id: true, status: true },
  });
  if (existing) {
    throw new ApiError(
      existing.status === 'PENDING'
        ? 'این موضوع از قبل در صف است.'
        : 'برای این موضوع قبلاً مقاله ساخته شده است؛ برای تکرارش ردیف قبلی را از صف حذف کنید.',
      409,
      { fields: { keyword: 'تکراری است.' } },
    );
  }

  if (categorySlug) {
    const category = await prisma.blogCategory.findUnique({ where: { slug: categorySlug }, select: { id: true } });
    if (!category) throw new ApiError('دسته انتخاب‌شده وجود ندارد.', 422);
  }

  const job = await prisma.contentJob.create({
    data: {
      keyword,
      keywordNorm,
      source: 'manual',
      // موضوع دستی بالاترین اولویت را دارد
      score: 1000,
      status: 'PENDING',
      brief: categorySlug ? { categorySlug } : undefined,
    },
    select: { id: true, keyword: true },
  });

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.content_keyword',
    entity: 'content_job',
    entityId: job.id,
    ip: await clientIp(),
    meta: { keyword, categorySlug: categorySlug ?? null, runNow: Boolean(runNow) },
  });

  if (!runNow) {
    return ok({ job, message: 'موضوع به صف اضافه شد؛ در اجرای بعدی نوشته می‌شود.' }, { status: 201 });
  }

  const result = await runContentPipeline({ count: 1, force: true, jobIds: [job.id] });
  const outcome = result.outcomes[0];

  return ok({
    job,
    result,
    message:
      result.skipped ??
      (outcome?.status === 'PUBLISHED'
        ? 'مقاله نوشته و منتشر شد.'
        : outcome?.status === 'DRAFTED'
          ? 'مقاله نوشته شد و به عنوان پیش‌نویس ذخیره شد.'
          : outcome?.status === 'REJECTED'
            ? `مقاله از دروازه کیفیت رد شد: ${outcome.reasons?.join(' · ') ?? '—'}`
            : (outcome?.error ?? 'نوشتن مقاله انجام نشد.')),
  });
});
