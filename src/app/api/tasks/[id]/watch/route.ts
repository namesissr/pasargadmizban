import prisma from '@/lib/prisma';
import { ok, parseBody, route } from '@/lib/api';
import { requireTaskMember, assertSameOrigin } from '@/lib/auth';
import { devTaskWatchSchema } from '@/lib/validation';
import { addWatchers, findTask } from '@/lib/dev-tasks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** دنبال کردن یا رها کردن تسک — دنبال‌کننده همه تغییرات را دریافت می‌کند */
export const POST = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireTaskMember();
  const { id } = await ctx.params;
  const task = await findTask(id);
  const { watch } = await parseBody(req, devTaskWatchSchema);

  if (watch) await addWatchers(task.id, [user.id]);
  else await prisma.devTaskWatcher.deleteMany({ where: { taskId: task.id, userId: user.id } });

  return ok({ watching: watch });
});
