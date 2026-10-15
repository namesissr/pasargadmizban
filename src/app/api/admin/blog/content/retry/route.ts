import prisma from '@/lib/prisma';
import { ok, route } from '@/lib/api';
import { requireAdmin, clientIp, assertSameOrigin } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** متنی که هنگام رد دستی مدیر ثبت می‌شود؛ این موضوع‌ها عمداً کنار گذاشته شده‌اند */
const ADMIN_REJECTED = 'مدیر این مقاله را رد کرد.';

/**
 * بازگرداندن همه موضوع‌های ردشده و ناموفق به صف.
 *
 * برای وقتی که علت رد شدن برطرف شده (مثلاً دروازه کیفیت اصلاح شده یا کلید
 * API تازه گذاشته شده). موضوع‌هایی که مدیر خودش رد کرده برنمی‌گردند.
 */
export const POST = route(async () => {
  await assertSameOrigin();
  const admin = await requireAdmin();

  const result = await prisma.contentJob.updateMany({
    where: {
      status: { in: ['REJECTED', 'FAILED'] },
      postId: null,
      NOT: { error: ADMIN_REJECTED },
    },
    data: { status: 'PENDING', error: null, seoScore: null, wordCount: null, startedAt: null, finishedAt: null },
  });

  if (result.count) {
    await audit({
      userId: admin.id,
      actorType: 'admin',
      action: 'admin.content_retry',
      entity: 'content_job',
      ip: await clientIp(),
      meta: { count: result.count, bulk: true },
    });
  }

  return ok({
    count: result.count,
    message: result.count
      ? `${new Intl.NumberFormat('fa-IR').format(result.count)} موضوع به صف برگشت؛ اول از همه نوشته می‌شوند.`
      : 'موضوع ردشده‌ای برای تلاش دوباره نبود.',
  });
});
