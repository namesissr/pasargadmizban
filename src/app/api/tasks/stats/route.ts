import prisma from '@/lib/prisma';
import { ok, route } from '@/lib/api';
import { requireTaskMember } from '@/lib/auth';
import { actorName, userBrief } from '@/lib/dev-tasks';
import { OPEN_STATUSES, isOverdue, type TaskStatus } from '@/lib/dev-tasks-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAY = 86_400_000;

/** گزارش عملکرد: حجم کار باز، سرعت انجام، دقت در مهلت و سهم هر نفر */
export const GET = route(async () => {
  await requireTaskMember();
  const now = Date.now();

  const [tasks, users] = await Promise.all([
    prisma.devTask.findMany({
      where: { archivedAt: null },
      select: {
        status: true,
        priority: true,
        necessity: true,
        type: true,
        area: true,
        assigneeId: true,
        createdAt: true,
        submittedAt: true,
        completedAt: true,
        dueAt: true,
        reopenCount: true,
      },
    }),
    prisma.user.findMany({ where: { role: { in: ['ADMIN', 'EMPLOYER', 'DEVELOPER'] }, deletedAt: null }, select: userBrief }),
  ]);

  const open = tasks.filter((t) => OPEN_STATUSES.includes(t.status as TaskStatus));
  const done = tasks.filter((t) => t.status === 'DONE' && t.completedAt);
  const done30 = done.filter((t) => now - t.completedAt!.getTime() < 30 * DAY);
  const done90 = done.filter((t) => now - t.completedAt!.getTime() < 90 * DAY);

  const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
  const withDue = done90.filter((t) => t.dueAt);

  const group = (rows: typeof tasks, key: 'priority' | 'necessity' | 'type' | 'status' | 'area') => {
    const out: Record<string, number> = {};
    for (const r of rows) {
      const k = (r[key] as string | null) ?? '—';
      out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  };

  // هشت هفته اخیر: چند تسک ثبت شد و چند تسک بسته شد
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = now - i * 7 * DAY;
    const start = end - 7 * DAY;
    return {
      start: new Date(start).toISOString(),
      created: tasks.filter((t) => t.createdAt.getTime() >= start && t.createdAt.getTime() < end).length,
      done: done.filter((t) => t.completedAt!.getTime() >= start && t.completedAt!.getTime() < end).length,
    };
  }).reverse();

  const people = users
    .map((u) => {
      const mine = tasks.filter((t) => t.assigneeId === u.id);
      return {
        id: u.id,
        name: actorName(u),
        role: u.role,
        open: mine.filter((t) => OPEN_STATUSES.includes(t.status as TaskStatus)).length,
        inProgress: mine.filter((t) => t.status === 'IN_PROGRESS').length,
        review: mine.filter((t) => t.status === 'REVIEW').length,
        overdue: mine.filter((t) => isOverdue(t)).length,
        done30: done30.filter((t) => t.assigneeId === u.id).length,
      };
    })
    .filter((p) => p.open || p.done30 || p.role === 'DEVELOPER');

  return ok({
    totals: {
      open: open.length,
      overdue: open.filter((t) => isOverdue(t)).length,
      review: open.filter((t) => t.status === 'REVIEW').length,
      blocked: open.filter((t) => t.status === 'BLOCKED').length,
      unassigned: open.filter((t) => !t.assigneeId).length,
      hot: open.filter((t) => t.priority === 'URGENT' || t.necessity === 'CRITICAL').length,
      created30: tasks.filter((t) => now - t.createdAt.getTime() < 30 * DAY).length,
      done30: done30.length,
    },
    // میانگین زمان از ثبت تا تأیید نهایی (ساعت)
    avgCycleHours: avg(done90.map((t) => (t.completedAt!.getTime() - t.createdAt.getTime()) / 3_600_000)),
    // میانگین زمانی که کار انجام‌شده منتظر تأیید مدیر ماند (ساعت)
    avgReviewHours: avg(
      done90.filter((t) => t.submittedAt).map((t) => (t.completedAt!.getTime() - t.submittedAt!.getTime()) / 3_600_000),
    ),
    onTimeRate: withDue.length ? withDue.filter((t) => t.completedAt! <= t.dueAt!).length / withDue.length : null,
    reopenRate: done90.length ? done90.filter((t) => t.reopenCount > 0).length / done90.length : null,
    byStatus: group(tasks, 'status'),
    openByPriority: group(open, 'priority'),
    openByNecessity: group(open, 'necessity'),
    openByType: group(open, 'type'),
    openByArea: group(open, 'area'),
    weeks,
    people,
  });
});
