import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireTaskMember, assertSameOrigin } from '@/lib/auth';
import { devTaskChecklistUpdateSchema } from '@/lib/validation';
import { findTask, logActivity, markSeen } from '@/lib/dev-tasks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; itemId: string }> };

async function load(ctx: Ctx) {
  const user = await requireTaskMember();
  const { id, itemId } = await ctx.params;
  const task = await findTask(id);
  if (user.role === 'SUPPORT' && task.reporterId !== user.id) {
    throw new ApiError('فقط ثبت‌کننده تسک، کارفرما یا برنامه‌نویس می‌تواند چک‌لیست را تغییر دهد.', 403);
  }
  const item = await prisma.devTaskChecklistItem.findFirst({ where: { id: itemId, taskId: task.id } });
  if (!item) throw new ApiError('مورد چک‌لیست پیدا نشد.', 404);
  return { user, task, item };
}

/** تیک زدن یا ویرایش متن یک مورد */
export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const { user, task, item } = await load(ctx);
  const input = await parseBody(req, devTaskChecklistUpdateSchema);

  const updated = await prisma.devTaskChecklistItem.update({
    where: { id: item.id },
    data: {
      ...(input.text !== undefined ? { text: input.text } : {}),
      ...(input.done !== undefined ? { done: input.done, doneAt: input.done ? new Date() : null } : {}),
    },
  });
  if (input.done !== undefined && input.done !== item.done) {
    await logActivity(task.id, user.id, 'CHECKLIST', { action: input.done ? 'done' : 'undone', text: updated.text });
  }
  await markSeen(task.id, user.id);
  return ok(updated);
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const { user, task, item } = await load(ctx);
  await prisma.devTaskChecklistItem.delete({ where: { id: item.id } });
  await logActivity(task.id, user.id, 'CHECKLIST', { action: 'remove', text: item.text });
  await markSeen(task.id, user.id);
  return ok({ deleted: true });
});
