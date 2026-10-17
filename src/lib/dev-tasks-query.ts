import type { Prisma } from '@prisma/client';
import prisma from './prisma';
import {
  OPEN_STATUSES,
  TASK_NECESSITIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TYPES,
  isOverdue,
  urgencyScore,
  type TaskStatus,
} from './dev-tasks-shared';

/**
 * فیلتر و مرتب‌سازی فهرست تسک‌ها — مشترک بین فهرست، تخته و خروجی CSV.
 *
 * تعداد تسک‌های یک تیم کوچک در حد صدها تاست؛ پس مرتب‌سازی هوشمند (ترکیب
 * اولویت، ضرورت و مهلت) در حافظه انجام می‌شود و نیازی به ستون محاسبه‌شده نیست.
 */

export type TaskListParams = {
  view: string;
  status: string[];
  priority: string[];
  necessity: string[];
  type: string[];
  assignee: string;
  q: string;
  area: string;
  label: string;
  sort: string;
};

function list(value: string | null, allowed: readonly string[]): string[] {
  if (!value) return [];
  return value.split(',').filter((v) => allowed.includes(v));
}

export function readTaskParams(req: Request): TaskListParams {
  const url = new URL(req.url);
  const get = (k: string) => url.searchParams.get(k);
  return {
    view: get('view') ?? 'open',
    status: list(get('status'), TASK_STATUSES),
    priority: list(get('priority'), TASK_PRIORITIES),
    necessity: list(get('necessity'), TASK_NECESSITIES),
    type: list(get('type'), TASK_TYPES),
    assignee: (get('assignee') ?? '').slice(0, 40),
    q: (get('q') ?? '').trim().slice(0, 100),
    area: (get('area') ?? '').slice(0, 60),
    label: (get('label') ?? '').slice(0, 30),
    sort: get('sort') ?? 'smart',
  };
}

/** شرط پایه بدون فیلتر وضعیت — برای شمارش تب‌ها هم استفاده می‌شود */
export function baseWhere(p: TaskListParams, meId: string): Prisma.DevTaskWhereInput {
  const and: Prisma.DevTaskWhereInput[] = [];

  and.push(p.view === 'archived' ? { archivedAt: { not: null } } : { archivedAt: null });

  if (p.priority.length) and.push({ priority: { in: p.priority as never } });
  if (p.necessity.length) and.push({ necessity: { in: p.necessity as never } });
  if (p.type.length) and.push({ type: { in: p.type as never } });
  if (p.area) and.push({ area: p.area });
  if (p.label) and.push({ labels: { has: p.label } });

  if (p.assignee === 'me') and.push({ assigneeId: meId });
  else if (p.assignee === 'none') and.push({ assigneeId: null });
  else if (p.assignee) and.push({ assigneeId: p.assignee });

  if (p.q) {
    const n = Number(p.q.replace(/^#/, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
    and.push({
      OR: [
        { title: { contains: p.q, mode: 'insensitive' } },
        { description: { contains: p.q, mode: 'insensitive' } },
        { pageUrl: { contains: p.q, mode: 'insensitive' } },
        ...(Number.isInteger(n) && n > 0 ? [{ number: n }] : []),
      ],
    });
  }

  return { AND: and };
}

/** شرط وضعیت بر اساس نمای انتخاب‌شده یا فیلتر صریح وضعیت */
export function statusWhere(p: TaskListParams, meId: string): Prisma.DevTaskWhereInput {
  if (p.status.length) return { status: { in: p.status as never } };
  switch (p.view) {
    case 'all':
    case 'archived':
      return {};
    case 'mine':
      return { status: { in: OPEN_STATUSES }, assigneeId: meId };
    case 'reported':
      return { reporterId: meId };
    case 'overdue':
      return { status: { in: OPEN_STATUSES }, dueAt: { lt: new Date() } };
    case 'closed':
      return { status: { in: ['DONE', 'CANCELED'] } };
    case 'board':
      // تخته: کارهای باز + کارهایی که در دو هفته اخیر بسته شده‌اند
      return {
        OR: [
          { status: { in: OPEN_STATUSES } },
          { status: 'DONE', completedAt: { gte: new Date(Date.now() - 14 * 86_400_000) } },
        ],
      };
    default:
      return { status: { in: OPEN_STATUSES } };
  }
}

export const taskListSelect = {
  id: true,
  number: true,
  title: true,
  type: true,
  status: true,
  priority: true,
  necessity: true,
  area: true,
  labels: true,
  dueAt: true,
  estimateHours: true,
  reopenCount: true,
  sortOrder: true,
  createdAt: true,
  activityAt: true,
  completedAt: true,
  archivedAt: true,
  spentMinutes: true,
  rating: true,
  assignee: { select: { id: true, email: true, firstName: true, lastName: true } },
  reporter: { select: { id: true, email: true, firstName: true, lastName: true } },
  checklist: { select: { done: true } },
  _count: { select: { attachments: true, activities: { where: { kind: 'COMMENT' } } } },
} satisfies Prisma.DevTaskSelect;

export type TaskListRow = Prisma.DevTaskGetPayload<{ select: typeof taskListSelect }>;

const STATUS_ORDER: Record<TaskStatus, number> = {
  BLOCKED: 0,
  REVIEW: 1,
  IN_PROGRESS: 2,
  TODO: 3,
  DONE: 4,
  CANCELED: 5,
};

export function sortTasks<T extends TaskListRow>(rows: T[], sort: string): T[] {
  const copy = [...rows];
  const time = (d: Date | null) => (d ? d.getTime() : Number.POSITIVE_INFINITY);
  switch (sort) {
    case 'newest':
      return copy.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    case 'oldest':
      return copy.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    case 'updated':
      return copy.sort((a, b) => b.activityAt.getTime() - a.activityAt.getTime());
    case 'due':
      return copy.sort((a, b) => time(a.dueAt) - time(b.dueAt) || urgencyScore(b) - urgencyScore(a));
    case 'number':
      return copy.sort((a, b) => b.number - a.number);
    case 'manual':
      // ترتیب دستی مدیر روی تخته؛ در صورت برابری، امتیاز هوشمند
      return copy.sort((a, b) => a.sortOrder - b.sortOrder || urgencyScore(b) - urgencyScore(a));
    default:
      // هوشمند: کارهای باز قبل از بسته، سپس امتیاز اولویت/ضرورت/مهلت، سپس قدیمی‌ترها اول
      return copy.sort(
        (a, b) =>
          Number(!OPEN_STATUSES.includes(a.status as TaskStatus)) -
            Number(!OPEN_STATUSES.includes(b.status as TaskStatus)) ||
          urgencyScore(b) - urgencyScore(a) ||
          STATUS_ORDER[a.status as TaskStatus] - STATUS_ORDER[b.status as TaskStatus] ||
          a.createdAt.getTime() - b.createdAt.getTime(),
      );
  }
}

/** زمان آخرین بازدید کاربر از هر تسک — برای نشانه «به‌روزرسانی جدید» */
export async function seenMap(userId: string, taskIds: string[]): Promise<Map<string, Date>> {
  if (!taskIds.length) return new Map();
  const views = await prisma.devTaskView.findMany({
    where: { userId, taskId: { in: taskIds } },
    select: { taskId: true, seenAt: true },
  });
  return new Map(views.map((v) => [v.taskId, v.seenAt]));
}

/** ردیف خام پایگاه داده به ردیف فهرست با شمارنده‌ها و نشان «جدید» برای کاربر جاری */
export async function toListItems<T extends TaskListRow>(rows: T[], userId: string) {
  const seen = await seenMap(userId, rows.map((t) => t.id));
  return rows.map(({ checklist, _count, ...t }) => {
    const seenAt = seen.get(t.id);
    return {
      ...t,
      checklistTotal: checklist.length,
      checklistDone: checklist.filter((c) => c.done).length,
      comments: _count.activities,
      attachments: _count.attachments,
      overdue: isOverdue(t),
      // تسکی که هرگز باز نشده یا بعد از آخرین بازدید تغییر کرده
      unread: !seenAt || t.activityAt > seenAt,
    };
  });
}
