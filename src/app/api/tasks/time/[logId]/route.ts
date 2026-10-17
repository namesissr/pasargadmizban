import prisma from '@/lib/prisma';
import { ok, route, ApiError } from '@/lib/api';
import { requireTaskMember, assertSameOrigin } from '@/lib/auth';
import { logActivity } from '@/lib/dev-tasks';
import { recomputeSpent } from '@/lib/dev-tasks-time';
import { formatMinutes, isTaskManager } from '@/lib/dev-tasks-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ logId: string }> };

/** حذف یک ردیف کارکرد — ثبت‌کننده یا کارفرما */
export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireTaskMember();
  const { logId } = await ctx.params;
  const log = await prisma.devTaskTimeLog.findUnique({ where: { id: logId } });
  if (!log) throw new ApiError('ردیف کارکرد پیدا نشد.', 404);
  if (log.userId !== user.id && !isTaskManager(user.role)) {
    throw new ApiError('فقط ثبت‌کننده یا کارفرما می‌تواند کارکرد را حذف کند.', 403);
  }

  await prisma.$transaction(async (tx) => {
    await tx.devTaskTimeLog.delete({ where: { id: log.id } });
    await recomputeSpent(log.taskId, tx);
  });
  if (log.minutes) {
    await logActivity(log.taskId, user.id, 'TIME_REMOVED', { minutes: log.minutes, label: formatMinutes(log.minutes) });
  }
  return ok({ deleted: true });
});
