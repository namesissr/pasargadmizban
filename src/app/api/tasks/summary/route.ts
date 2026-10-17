import prisma from '@/lib/prisma';
import { ok, route } from '@/lib/api';
import { requireTaskMember } from '@/lib/auth';
import { OPEN_STATUSES } from '@/lib/dev-tasks-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** شمارنده‌های سبک برای نشان‌های منوی کناری */
export const GET = route(async () => {
  const user = await requireTaskMember();
  const open = { archivedAt: null, status: { in: OPEN_STATUSES } };

  const [mine, review, blocked, overdue, unreadRows] = await Promise.all([
    prisma.devTask.count({ where: { ...open, assigneeId: user.id } }),
    prisma.devTask.count({ where: { archivedAt: null, status: 'REVIEW' } }),
    prisma.devTask.count({ where: { archivedAt: null, status: 'BLOCKED' } }),
    prisma.devTask.count({ where: { ...open, dueAt: { lt: new Date() } } }),
    // تسک‌های بازی که از آخرین بازدید این کاربر تغییر کرده‌اند یا هرگز باز نشده‌اند
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM dev_tasks t
      LEFT JOIN dev_task_views v ON v."taskId" = t.id AND v."userId" = ${user.id}
      WHERE t."archivedAt" IS NULL
        AND t.status::text IN ('TODO', 'IN_PROGRESS', 'BLOCKED', 'REVIEW')
        AND (v."seenAt" IS NULL OR t."activityAt" > v."seenAt")`,
  ]);

  return ok({ mine, review, blocked, overdue, unread: Number(unreadRows[0]?.count ?? 0) });
});
