import prisma from './prisma';
import { actorName, userBrief } from './dev-tasks';
import { sortTasks, taskListSelect, toListItems } from './dev-tasks-query';
import { EMPLOYER_ROLES, OPEN_STATUSES, isOverdue, type TaskStatus } from './dev-tasks-shared';

/**
 * داده‌های داشبورد دو پنل: میز کار برنامه‌نویس و میز کار کارفرما،
 * به‌علاوه جدول بار کاری تیم برنامه‌نویسان.
 */

const DAY = 86_400_000;

function startOfTehranDay(now = new Date()) {
  // ساعت تهران همیشه ۳:۳۰ جلوتر از UTC است (تغییر ساعت تابستانی ندارد)
  const offset = 3.5 * 3_600_000;
  const local = new Date(now.getTime() + offset);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - offset);
}

async function minutesSince(userId: string | undefined, since: Date) {
  const sum = await prisma.devTaskTimeLog.aggregate({
    where: { ...(userId ? { userId } : {}), endedAt: { gte: since } },
    _sum: { minutes: true },
  });
  return sum._sum.minutes ?? 0;
}

/** بار کاری و کارکرد هر برنامه‌نویس — برای کارفرما */
export async function teamWorkload() {
  const now = Date.now();
  const weekAgo = new Date(now - 7 * DAY);
  const monthAgo = new Date(now - 30 * DAY);

  const [devs, tasks, running] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'DEVELOPER', deletedAt: null, status: { not: 'BANNED' } },
      select: { ...userBrief, lastLoginAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.devTask.findMany({
      where: { archivedAt: null, assignee: { role: 'DEVELOPER' } },
      select: {
        assigneeId: true,
        status: true,
        dueAt: true,
        estimateHours: true,
        completedAt: true,
        rating: true,
        activityAt: true,
      },
    }),
    prisma.devTaskTimeLog.findMany({
      where: { endedAt: null },
      include: { task: { select: { number: true, title: true } } },
    }),
  ]);

  return Promise.all(
    devs.map(async (d) => {
      const mine = tasks.filter((t) => t.assigneeId === d.id);
      const open = mine.filter((t) => OPEN_STATUSES.includes(t.status as TaskStatus));
      const done30 = mine.filter((t) => t.status === 'DONE' && t.completedAt && t.completedAt >= monthAgo);
      const rated = done30.filter((t) => t.rating);
      const timer = running.find((r) => r.userId === d.id);
      const [minutesWeek, minutesMonth] = await Promise.all([minutesSince(d.id, weekAgo), minutesSince(d.id, monthAgo)]);
      const lastActivity = mine.reduce<Date | null>((a, t) => (!a || t.activityAt > a ? t.activityAt : a), null);
      return {
        id: d.id,
        name: actorName(d),
        email: d.email,
        lastLoginAt: d.lastLoginAt,
        lastActivityAt: lastActivity,
        open: open.length,
        todo: open.filter((t) => t.status === 'TODO').length,
        inProgress: open.filter((t) => t.status === 'IN_PROGRESS').length,
        blocked: open.filter((t) => t.status === 'BLOCKED').length,
        review: open.filter((t) => t.status === 'REVIEW').length,
        overdue: open.filter((t) => isOverdue(t)).length,
        estimateHours: open.reduce((a, t) => a + (t.estimateHours ?? 0), 0),
        minutesWeek,
        minutesMonth,
        done30: done30.length,
        avgRating: rated.length ? rated.reduce((a, t) => a + (t.rating ?? 0), 0) / rated.length : null,
        workingOn: timer ? { number: timer.task.number, title: timer.task.title, since: timer.startedAt } : null,
      };
    }),
  );
}

/** میز کار برنامه‌نویس: کار بعدی، کارهای برگشتی، تسک‌های آزاد و آمار خودش */
export async function developerHome(userId: string) {
  const now = Date.now();
  const [mineRows, poolRows, running, doneWeek, rated, minutesToday, minutesWeek] = await Promise.all([
    prisma.devTask.findMany({
      where: { archivedAt: null, assigneeId: userId, status: { in: OPEN_STATUSES } },
      select: { ...taskListSelect, startedAt: true },
    }),
    prisma.devTask.findMany({
      where: { archivedAt: null, assigneeId: null, status: { in: ['TODO', 'BLOCKED'] } },
      select: taskListSelect,
    }),
    prisma.devTaskTimeLog.findFirst({
      where: { userId, endedAt: null },
      include: { task: { select: { id: true, number: true, title: true } } },
    }),
    prisma.devTask.count({
      where: { assigneeId: userId, status: 'DONE', completedAt: { gte: new Date(now - 7 * DAY) } },
    }),
    prisma.devTask.aggregate({
      where: { assigneeId: userId, rating: { not: null }, completedAt: { gte: new Date(now - 90 * DAY) } },
      _avg: { rating: true },
      _count: { rating: true },
    }),
    minutesSince(userId, startOfTehranDay()),
    minutesSince(userId, new Date(now - 7 * DAY)),
  ]);

  const ranked = sortTasks(mineRows, 'smart');
  const mine = await toListItems(ranked, userId);
  const pool = await toListItems(sortTasks(poolRows, 'smart').slice(0, 10), userId);

  // «کار بعدی»: کاری که در جریان است مقدم است؛ وگرنه مهم‌ترین کار در صف
  const next =
    mine.find((t) => t.status === 'IN_PROGRESS' && t.reopenCount > 0) ??
    mine.find((t) => t.status === 'IN_PROGRESS') ??
    mine.find((t) => t.status === 'TODO') ??
    null;

  return {
    running: running ? { startedAt: running.startedAt, task: running.task } : null,
    next,
    returned: mine.filter((t) => t.reopenCount > 0 && (t.status === 'TODO' || t.status === 'IN_PROGRESS')),
    active: mine.filter((t) => t.status === 'IN_PROGRESS' || t.status === 'TODO'),
    waiting: mine.filter((t) => t.status === 'BLOCKED'),
    inReview: mine.filter((t) => t.status === 'REVIEW'),
    pool,
    stats: {
      open: mine.length,
      overdue: mine.filter((t) => t.overdue).length,
      doneWeek,
      minutesToday,
      minutesWeek,
      avgRating: rated._avg.rating,
      ratedCount: rated._count.rating,
    },
  };
}

/** میز کار کارفرما: صف تأیید، سؤال‌های بی‌جواب، عقب‌افتاده‌ها، تیم و آخرین رویدادها */
export async function employerHome(userId: string) {
  const [reviewRows, blockedRows, overdueRows, unassignedRows, recent, employers, team, minutesToday] = await Promise.all([
    prisma.devTask.findMany({ where: { archivedAt: null, status: 'REVIEW' }, select: taskListSelect }),
    prisma.devTask.findMany({ where: { archivedAt: null, status: 'BLOCKED' }, select: taskListSelect }),
    prisma.devTask.findMany({
      where: { archivedAt: null, status: { in: ['TODO', 'IN_PROGRESS'] }, dueAt: { lt: new Date() } },
      select: taskListSelect,
    }),
    prisma.devTask.findMany({
      where: { archivedAt: null, status: { in: OPEN_STATUSES }, assigneeId: null },
      select: taskListSelect,
    }),
    prisma.devTaskActivity.findMany({
      where: { kind: { in: ['CREATED', 'STATUS', 'COMMENT', 'ASSIGNED', 'TIME'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        user: { select: userBrief },
        task: { select: { number: true, title: true } },
      },
    }),
    prisma.user.findMany({ where: { role: { in: [...EMPLOYER_ROLES] }, deletedAt: null }, select: userBrief }),
    teamWorkload(),
    minutesSince(undefined, startOfTehranDay()),
  ]);

  // کارهای منتظر تأیید: قدیمی‌ترین ارسال اول، تا هیچ کاری پشت صف نماند
  const review = await toListItems(sortTasks(reviewRows, 'oldest'), userId);
  return {
    review,
    blocked: await toListItems(sortTasks(blockedRows, 'smart'), userId),
    overdue: await toListItems(sortTasks(overdueRows, 'due'), userId),
    unassigned: await toListItems(sortTasks(unassignedRows, 'smart'), userId),
    recent: recent.map((a) => ({
      id: a.id,
      kind: a.kind,
      meta: a.meta,
      body: a.body?.slice(0, 200) ?? null,
      createdAt: a.createdAt,
      user: a.user,
      task: a.task,
    })),
    employers,
    team,
    minutesToday,
  };
}
