import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireTaskMember, assertSameOrigin } from '@/lib/auth';
import { devTaskCommentSchema } from '@/lib/validation';
import { findTask } from '@/lib/dev-tasks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; cid: string }> };

async function loadComment(ctx: Ctx) {
  const { id, cid } = await ctx.params;
  const task = await findTask(id);
  const comment = await prisma.devTaskActivity.findFirst({ where: { id: cid, taskId: task.id, kind: 'COMMENT' } });
  if (!comment) throw new ApiError('نظر موردنظر پیدا نشد.', 404);
  return comment;
}

/** ویرایش نظر — فقط نویسنده */
export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireTaskMember();
  const comment = await loadComment(ctx);
  if (comment.userId !== user.id) throw new ApiError('فقط نویسنده می‌تواند نظر را ویرایش کند.', 403);

  const input = await parseBody(req, devTaskCommentSchema);
  if (!input.body) throw new ApiError('متن نظر نمی‌تواند خالی باشد.', 422, { fields: { body: 'متن را بنویسید.' } });

  await prisma.devTaskActivity.update({
    where: { id: comment.id },
    data: { body: input.body, editedAt: new Date() },
  });
  return ok({ id: comment.id });
});

/** حذف نظر — نویسنده یا مدیر */
export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireTaskMember();
  const comment = await loadComment(ctx);
  if (comment.userId !== user.id && user.role !== 'ADMIN') {
    throw new ApiError('فقط نویسنده یا مدیر می‌تواند نظر را حذف کند.', 403);
  }

  // پیوست‌های نظر حذف‌شده هم پاک می‌شوند تا فایل یتیم نماند
  await prisma.$transaction([
    prisma.devTaskAttachment.deleteMany({ where: { activityId: comment.id } }),
    prisma.devTaskActivity.delete({ where: { id: comment.id } }),
  ]);
  return ok({ deleted: true });
});
