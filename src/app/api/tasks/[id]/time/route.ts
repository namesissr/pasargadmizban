import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireTaskMember, assertSameOrigin } from '@/lib/auth';
import { devTaskManualTimeSchema } from '@/lib/validation';
import { findTask, markSeen } from '@/lib/dev-tasks';
import { addManualTime } from '@/lib/dev-tasks-time';
import { isTaskManager } from '@/lib/dev-tasks-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** ثبت دستی کارکرد — برای وقتی که زمان‌سنج روشن نشده بود */
export const POST = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireTaskMember();
  const { id } = await ctx.params;
  const task = await findTask(id);
  if (task.assigneeId !== user.id && !isTaskManager(user.role)) {
    throw new ApiError('فقط مسئول تسک می‌تواند برای آن کارکرد ثبت کند.', 403);
  }

  const input = await parseBody(req, devTaskManualTimeSchema);
  const date = input.date ? new Date(input.date) : new Date();
  if (date.getTime() > Date.now() + 5 * 60_000) throw new ApiError('زمان کارکرد نمی‌تواند در آینده باشد.', 422);

  const log = await addManualTime(user.id, task.id, input.minutes, date, input.note);
  await markSeen(task.id, user.id);
  return ok({ id: log.id });
});
