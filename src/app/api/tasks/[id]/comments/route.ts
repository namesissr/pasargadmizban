import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireTaskMember, assertSameOrigin } from '@/lib/auth';
import { devTaskCommentSchema } from '@/lib/validation';
import { enforceRateLimit } from '@/lib/rate-limit';
import { findTask, logActivity, markSeen, notifyComment } from '@/lib/dev-tasks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** نظر تازه در گفتگوی تسک — می‌تواند پیوست‌هایی را که همین حالا آپلود شده‌اند همراه داشته باشد */
export const POST = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireTaskMember();
  await enforceRateLimit(`task-comment:${user.id}`, 120, 3600);
  const { id } = await ctx.params;
  const task = await findTask(id);
  const input = await parseBody(req, devTaskCommentSchema);

  const attachmentIds = input.attachmentIds ?? [];
  if (!input.body && !attachmentIds.length) {
    throw new ApiError('متن نظر را بنویسید یا فایلی پیوست کنید.', 422, { fields: { body: 'نظر خالی است.' } });
  }

  const activity = await prisma.$transaction(async (tx) => {
    const created = await logActivity(task.id, user.id, 'COMMENT', {}, input.body || null, tx);
    if (attachmentIds.length) {
      // فقط پیوست‌های همین کاربر روی همین تسک که هنوز به نظری وصل نشده‌اند
      await tx.devTaskAttachment.updateMany({
        where: { id: { in: attachmentIds }, taskId: task.id, userId: user.id, activityId: null },
        data: { activityId: created.id },
      });
    }
    return created;
  });

  await markSeen(task.id, user.id);
  // فقط اعضای میز کار را می‌توان صدا زد
  const mentions = input.mentionIds?.length
    ? (
        await prisma.user.findMany({
          where: { id: { in: input.mentionIds }, role: { in: ['ADMIN', 'EMPLOYER', 'SUPPORT', 'DEVELOPER'] }, deletedAt: null },
          select: { id: true },
        })
      ).map((u) => u.id)
    : [];
  if (mentions.length) {
    await prisma.devTaskActivity.update({ where: { id: activity.id }, data: { meta: { mentions } } });
  }
  await notifyComment(task, user, input.body || `${attachmentIds.length} فایل پیوست کرد.`, mentions);

  return ok({ id: activity.id });
});
