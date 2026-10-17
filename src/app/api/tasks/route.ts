import prisma from '@/lib/prisma';
import { ok, paged, pagination, parseBody, route } from '@/lib/api';
import { requireTaskMember, assertSameOrigin, clientIp } from '@/lib/auth';
import { devTaskCreateSchema } from '@/lib/validation';
import { enforceRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { addWatchers, assertAssignable, logActivity, markSeen, notifyTaskCreated } from '@/lib/dev-tasks';
import {
  baseWhere,
  readTaskParams,
  sortTasks,
  statusWhere,
  taskListSelect,
  toListItems,
} from '@/lib/dev-tasks-query';
import { OPEN_STATUSES, isTaskManager } from '@/lib/dev-tasks-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** فهرست تسک‌ها با فیلتر، مرتب‌سازی و شمارش هر نما */
export const GET = route(async (req: Request) => {
  const user = await requireTaskMember();
  const params = readTaskParams(req);
  const { page, perPage } = pagination(req, { page: 1, perPage: 30, maxPerPage: 500 });

  const base = baseWhere(params, user.id);
  const where = { AND: [base, statusWhere(params, user.id)] };

  const [rows, statusCounts, mine, overdue] = await Promise.all([
    prisma.devTask.findMany({ where, select: taskListSelect, take: 5000 }),
    prisma.devTask.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    prisma.devTask.count({ where: { AND: [base, { assigneeId: user.id, status: { in: OPEN_STATUSES } }] } }),
    prisma.devTask.count({
      where: { AND: [base, { status: { in: OPEN_STATUSES }, dueAt: { lt: new Date() } }] },
    }),
  ]);

  const sorted = sortTasks(rows, params.sort);
  const slice = params.view === 'board' ? sorted : sorted.slice((page - 1) * perPage, page * perPage);
  const items = await toListItems(slice, user.id);

  const counts: Record<string, number> = {};
  for (const c of statusCounts) counts[c.status] = c._count._all;

  return ok({
    ...paged(items, sorted.length, page, params.view === 'board' ? Math.max(1, sorted.length) : perPage),
    counts,
    mine,
    overdue,
  });
});

/** ثبت تسک جدید */
export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const user = await requireTaskMember();
  await enforceRateLimit(`task-create:${user.id}`, 60, 3600);

  const input = await parseBody(req, devTaskCreateSchema);

  // برنامه‌نویسی که خودش کاری ثبت می‌کند، به‌طور پیش‌فرض مسئول همان کار است
  const assigneeId = input.assigneeId === undefined && user.role === 'DEVELOPER' ? user.id : input.assigneeId ?? null;
  await assertAssignable(assigneeId);

  const task = await prisma.$transaction(async (tx) => {
    // تسک تازه بالای ستون «در صف» تخته قرار می‌گیرد
    const top = await tx.devTask.findFirst({
      where: { status: 'TODO' },
      orderBy: { sortOrder: 'asc' },
      select: { sortOrder: true },
    });

    const created = await tx.devTask.create({
      data: {
        title: input.title,
        description: input.description,
        type: input.type,
        priority: input.priority,
        necessity: input.necessity,
        area: input.area,
        pageUrl: input.pageUrl,
        labels: input.labels ?? [],
        dueAt: input.dueAt ?? null,
        estimateHours: input.estimateHours ?? null,
        reporterId: user.id,
        assigneeId,
        sortOrder: (top?.sortOrder ?? 0) - 10,
        checklist: input.checklist?.length
          ? { create: input.checklist.map((text, i) => ({ text, sortOrder: i * 10 })) }
          : undefined,
      },
    });
    await logActivity(created.id, user.id, 'CREATED', {}, null, tx);
    return created;
  });

  await markSeen(task.id, user.id);
  // ثبت‌کننده خودکار دنبال‌کننده تسک است؛ کارفرمای دیگر را هم می‌توان همان لحظه اضافه کرد
  await addWatchers(task.id, [user.id, ...(input.watcherIds ?? [])]);
  await audit({
    userId: user.id,
    actorType: isTaskManager(user.role) ? 'admin' : 'user',
    action: 'task.create',
    entity: 'dev_task',
    entityId: task.id,
    ip: await clientIp(),
    meta: { number: task.number, title: task.title, priority: task.priority, necessity: task.necessity },
  });
  await notifyTaskCreated(task, user);

  return ok({ id: task.id, number: task.number });
});
