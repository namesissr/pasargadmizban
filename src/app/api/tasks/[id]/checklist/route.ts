import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireTaskMember, assertSameOrigin } from '@/lib/auth';
import { devTaskChecklistSchema } from '@/lib/validation';
import { findTask, logActivity, markSeen } from '@/lib/dev-tasks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** افزودن مورد به چک‌لیست — مدیر، برنامه‌نویس یا ثبت‌کننده تسک */
export const POST = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireTaskMember();
  const { id } = await ctx.params;
  const task = await findTask(id);
  if (user.role === 'SUPPORT' && task.reporterId !== user.id) {
    throw new ApiError('فقط ثبت‌کننده تسک، مدیر یا برنامه‌نویس می‌تواند چک‌لیست را تغییر دهد.', 403);
  }

  const input = await parseBody(req, devTaskChecklistSchema);
  const count = await prisma.devTaskChecklistItem.count({ where: { taskId: task.id } });
  if (count >= 100) throw new ApiError('چک‌لیست حداکثر ۱۰۰ مورد می‌تواند داشته باشد.', 400);

  const last = await prisma.devTaskChecklistItem.findFirst({
    where: { taskId: task.id },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  const item = await prisma.devTaskChecklistItem.create({
    data: { taskId: task.id, text: input.text, sortOrder: (last?.sortOrder ?? 0) + 10 },
  });
  await logActivity(task.id, user.id, 'CHECKLIST', { action: 'add', text: input.text });
  await markSeen(task.id, user.id);

  return ok(item);
});
