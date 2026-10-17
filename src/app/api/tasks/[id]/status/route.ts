import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireTaskMember, assertSameOrigin, clientIp } from '@/lib/auth';
import { devTaskStatusSchema } from '@/lib/validation';
import { audit } from '@/lib/audit';
import { findTask, logActivity, markSeen, notifyStatusChanged } from '@/lib/dev-tasks';
import { stopTimer } from '@/lib/dev-tasks-time';
import {
  TASK_STATUS_FA,
  allowedTransitions,
  isTaskManager,
  transitionNeedsComment,
  type TaskStatus,
} from '@/lib/dev-tasks-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * تغییر وضعیت تسک طبق گردش کار:
 *   برنامه‌نویس: در صف ← در حال انجام ← «انجام شد» (منتظر تأیید) یا «نیاز به اطلاعات»
 *   مدیر: تأیید و بستن، برگرداندن برای اصلاح، لغو یا بازگشایی
 */
export const POST = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireTaskMember();
  const { id } = await ctx.params;
  const task = await findTask(id);
  const input = await parseBody(req, devTaskStatusSchema);

  const from = task.status as TaskStatus;
  const to = input.status as TaskStatus;
  if (from === to) return ok({ id: task.id, status: to, changed: false });

  if (user.role === 'DEVELOPER' && task.assigneeId && task.assigneeId !== user.id) {
    throw new ApiError('این تسک به برنامه‌نویس دیگری سپرده شده است.', 403);
  }
  if (!allowedTransitions(user.role, from).includes(to)) {
    throw new ApiError(
      `تغییر وضعیت از «${TASK_STATUS_FA[from].label}» به «${TASK_STATUS_FA[to].label}» برای شما مجاز نیست.`,
      403,
    );
  }

  const comment = input.comment?.trim() || null;
  if (transitionNeedsComment(from, to) && !comment) {
    throw new ApiError(
      to === 'BLOCKED'
        ? 'بنویسید برای ادامه کار چه اطلاعات یا تصمیمی لازم است.'
        : 'بنویسید چه چیزی درست نیست یا باید اصلاح شود.',
      422,
      { fields: { comment: 'توضیح لازم است.' } },
    );
  }

  const now = new Date();
  const data: Record<string, unknown> = { status: to, remindedAt: null };
  if (to === 'IN_PROGRESS' && !task.startedAt) data.startedAt = now;
  if (to === 'REVIEW') data.submittedAt = now;
  if (to === 'DONE') {
    data.completedAt = now;
    // امتیاز کیفیت فقط از کارفرما و فقط هنگام تأیید پذیرفته می‌شود
    if (input.rating && isTaskManager(user.role)) {
      data.rating = input.rating;
      data.ratingNote = comment;
      data.ratedById = user.id;
    }
  }
  if (from === 'DONE') {
    data.completedAt = null;
    data.rating = null;
    data.ratingNote = null;
    data.ratedById = null;
  }
  const reopened = (from === 'REVIEW' || from === 'DONE') && (to === 'TODO' || to === 'IN_PROGRESS');
  if (reopened) data.reopenCount = { increment: 1 };
  // برنامه‌نویسی که تسک بی‌مسئول را شروع می‌کند، خودش مسئول آن می‌شود
  if (user.role === 'DEVELOPER' && !task.assigneeId) data.assigneeId = user.id;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.devTask.update({ where: { id: task.id }, data });
    await logActivity(
      task.id,
      user.id,
      'STATUS',
      { from, to, reopened, ...(data.rating ? { rating: data.rating as number } : {}) },
      comment,
      tx,
    );
    return row;
  });

  await markSeen(task.id, user.id);
  await audit({
    userId: user.id,
    actorType: isTaskManager(user.role) ? 'admin' : 'user',
    action: 'task.status',
    entity: 'dev_task',
    entityId: task.id,
    ip: await clientIp(),
    meta: { number: task.number, from, to },
  });
  await notifyStatusChanged(updated, user, from, to, comment);
  // تسکی که بسته یا لغو شد نباید زمان‌سنج روشن داشته باشد
  if (to === 'DONE' || to === 'CANCELED') {
    const running = await prisma.devTaskTimeLog.findMany({ where: { taskId: task.id, endedAt: null }, select: { userId: true } });
    for (const r of running) await stopTimer(r.userId);
  }

  return ok({ id: task.id, status: to, changed: true });
});
