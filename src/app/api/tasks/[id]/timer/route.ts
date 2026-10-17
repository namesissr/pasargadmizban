import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireTaskMember, assertSameOrigin } from '@/lib/auth';
import { devTaskTimerSchema } from '@/lib/validation';
import prisma from '@/lib/prisma';
import { findTask, logActivity, markSeen, notifyStatusChanged } from '@/lib/dev-tasks';
import { activeTimer, startTimer, stopTimer } from '@/lib/dev-tasks-time';
import { OPEN_STATUSES, isTaskManager, type TaskStatus } from '@/lib/dev-tasks-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** شروع یا توقف زمان‌سنج کارکرد روی این تسک */
export const POST = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireTaskMember();
  const { id } = await ctx.params;
  const task = await findTask(id);
  const input = await parseBody(req, devTaskTimerSchema);

  if (input.action === 'stop') {
    const running = await activeTimer(user.id);
    if (!running || running.taskId !== task.id) throw new ApiError('زمان‌سنجی روی این تسک روشن نیست.', 400);
    const stopped = await stopTimer(user.id, input.note);
    await markSeen(task.id, user.id);
    return ok({ running: false, minutes: stopped?.minutes ?? 0 });
  }

  if (!OPEN_STATUSES.includes(task.status as TaskStatus)) {
    throw new ApiError('روی تسک بسته‌شده نمی‌توان زمان ثبت کرد.', 400);
  }
  if (task.assigneeId !== user.id && !isTaskManager(user.role)) {
    throw new ApiError(
      task.assigneeId ? 'این تسک به شخص دیگری سپرده شده است.' : 'اول تسک را بردارید، بعد زمان‌سنج را روشن کنید.',
      403,
    );
  }

  const { log, stopped } = await startTimer(user.id, task.id);

  // روشن کردن زمان‌سنج روی کاری که هنوز در صف است، یعنی کار شروع شده
  let started = false;
  if (task.status === 'TODO' && task.assigneeId === user.id) {
    const updated = await prisma.devTask.update({
      where: { id: task.id },
      data: { status: 'IN_PROGRESS', startedAt: task.startedAt ?? new Date(), remindedAt: null },
    });
    await logActivity(task.id, user.id, 'STATUS', { from: 'TODO', to: 'IN_PROGRESS', reopened: false });
    await notifyStatusChanged(updated, user, 'TODO', 'IN_PROGRESS');
    started = true;
  }
  await markSeen(task.id, user.id);
  return ok({ running: true, startedAt: log.startedAt, stoppedTaskId: stopped?.taskId ?? null, started });
});
