import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireTaskMember, requireAdmin, assertSameOrigin, clientIp } from '@/lib/auth';
import { devTaskUpdateSchema } from '@/lib/validation';
import { audit } from '@/lib/audit';
import {
  actorName,
  assertAssignable,
  findTask,
  logActivity,
  markSeen,
  notifyAssigned,
  notifyPriorityRaised,
  userBrief,
} from '@/lib/dev-tasks';
import { TASK_NECESSITIES, TASK_PRIORITIES, allowedTransitions, type TaskStatus } from '@/lib/dev-tasks-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** جزئیات کامل تسک به‌همراه تاریخچه، چک‌لیست، پیوست‌ها و دسترسی‌های کاربر جاری */
export const GET = route(async (_req: Request, ctx: Ctx) => {
  const user = await requireTaskMember();
  const { id } = await ctx.params;
  const found = await findTask(id);

  const [task, previousView] = await Promise.all([
    prisma.devTask.findUniqueOrThrow({
      where: { id: found.id },
      include: {
        reporter: { select: userBrief },
        assignee: { select: userBrief },
        checklist: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        activities: {
          orderBy: { createdAt: 'asc' },
          include: { user: { select: userBrief } },
        },
        attachments: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, name: true, mime: true, size: true, createdAt: true, activityId: true, userId: true },
        },
      },
    }),
    prisma.devTaskView.findUnique({ where: { taskId_userId: { taskId: found.id, userId: user.id } } }),
  ]);

  await markSeen(task.id, user.id);

  const isAdmin = user.role === 'ADMIN';
  const isReporter = task.reporterId === user.id;
  const isDeveloper = user.role === 'DEVELOPER';
  const ownsOrFree = !task.assigneeId || task.assigneeId === user.id;

  return ok({
    task,
    lastSeenAt: previousView?.seenAt ?? null,
    permissions: {
      manage: isAdmin,
      editContent: isAdmin || isReporter,
      comment: true,
      checklist: isAdmin || isDeveloper || isReporter,
      take: isDeveloper && !task.assigneeId,
      estimate: isAdmin || (isDeveloper && ownsOrFree),
      transitions: isDeveloper && !ownsOrFree ? [] : allowedTransitions(user.role, task.status as TaskStatus),
    },
  });
});

const FIELD_FA: Record<string, string> = {
  title: 'عنوان',
  description: 'شرح',
  type: 'نوع',
  priority: 'اولویت',
  necessity: 'ضرورت',
  area: 'بخش',
  pageUrl: 'آدرس صفحه',
  labels: 'برچسب‌ها',
  dueAt: 'مهلت',
  estimateHours: 'زمان تخمینی',
};

const CONTENT_FIELDS = ['title', 'description', 'type', 'area', 'pageUrl', 'labels'] as const;

/** ویرایش تسک — هر فیلد طبق نقش کاربر مجاز است و هر تغییر در تاریخچه ثبت می‌شود */
export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireTaskMember();
  const { id } = await ctx.params;
  const task = await findTask(id);
  const input = await parseBody(req, devTaskUpdateSchema);

  const isAdmin = user.role === 'ADMIN';
  const isReporter = task.reporterId === user.id;
  const isDeveloper = user.role === 'DEVELOPER';

  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const current = (key: string): unknown => {
    if (key === 'archived') return Boolean(task.archivedAt);
    const v = task[key as keyof typeof task];
    return v instanceof Date ? v.toISOString() : v;
  };
  const incoming = (v: unknown) => (v instanceof Date ? v.toISOString() : v);

  // ── بررسی دسترسی هر فیلد (فیلدی که مقدارش عوض نشده، بررسی نمی‌شود) ──
  const denied: string[] = [];
  for (const key of Object.keys(input) as (keyof typeof input)[]) {
    if (input[key] === undefined || isAdmin) continue;
    if (same(current(key), incoming(input[key]))) continue;
    if ((CONTENT_FIELDS as readonly string[]).includes(key) && isReporter) continue;
    if (key === 'labels' && isDeveloper) continue;
    if (key === 'estimateHours' && isDeveloper && (!task.assigneeId || task.assigneeId === user.id)) continue;
    // برنامه‌نویس می‌تواند تسک بی‌مسئول را خودش بردارد یا کار خودش را رها کند
    if (
      key === 'assigneeId' &&
      isDeveloper &&
      ((input.assigneeId === user.id && !task.assigneeId) || (input.assigneeId === null && task.assigneeId === user.id))
    ) {
      continue;
    }
    denied.push(FIELD_FA[key] ?? (key === 'assigneeId' ? 'مسئول' : key === 'archived' ? 'بایگانی' : key));
  }
  if (denied.length) {
    throw new ApiError(`اجازه تغییر این موارد را ندارید: ${denied.join('، ')}`, 403);
  }

  if (input.assigneeId !== undefined) await assertAssignable(input.assigneeId);

  // ── تشخیص تغییرات واقعی ──
  const data: Record<string, unknown> = {};
  const changes: { field: string; from: unknown; to: unknown }[] = [];

  for (const key of Object.keys(FIELD_FA) as (keyof typeof FIELD_FA)[]) {
    const next = input[key as keyof typeof input];
    if (next === undefined) continue;
    const normalizedPrev = current(key);
    const normalizedNext = incoming(next);
    if (same(normalizedPrev, normalizedNext)) continue;
    data[key] = next;
    // متن بلند شرح در تاریخچه تکرار نمی‌شود؛ فقط خود تغییر ثبت می‌شود
    changes.push(
      key === 'description'
        ? { field: key, from: null, to: null }
        : { field: key, from: normalizedPrev ?? null, to: normalizedNext ?? null },
    );
  }

  const assigneeChanged = input.assigneeId !== undefined && input.assigneeId !== task.assigneeId;
  if (assigneeChanged) data.assigneeId = input.assigneeId;

  if (input.dueAt !== undefined && changes.some((c) => c.field === 'dueAt')) {
    // مهلت تازه یعنی یادآوری‌ها از نو شروع شوند
    data.remindedAt = null;
  }

  let archiveChange: 'ARCHIVED' | 'UNARCHIVED' | null = null;
  if (input.archived !== undefined && input.archived !== Boolean(task.archivedAt)) {
    data.archivedAt = input.archived ? new Date() : null;
    archiveChange = input.archived ? 'ARCHIVED' : 'UNARCHIVED';
  }

  if (!Object.keys(data).length) return ok({ id: task.id, changed: false });

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.devTask.update({ where: { id: task.id }, data });
    if (changes.length) await logActivity(task.id, user.id, 'FIELDS', { changes } as never, null, tx);
    if (assigneeChanged) {
      const [from, to] = await Promise.all([
        task.assigneeId ? tx.user.findUnique({ where: { id: task.assigneeId }, select: userBrief }) : null,
        input.assigneeId ? tx.user.findUnique({ where: { id: input.assigneeId }, select: userBrief }) : null,
      ]);
      await logActivity(
        task.id,
        user.id,
        'ASSIGNED',
        { from: from ? actorName(from) : null, to: to ? actorName(to) : null },
        null,
        tx,
      );
    }
    if (archiveChange) await logActivity(task.id, user.id, archiveChange, {}, null, tx);
    return row;
  });

  await markSeen(task.id, user.id);
  await audit({
    userId: user.id,
    actorType: isAdmin ? 'admin' : 'user',
    action: 'task.update',
    entity: 'dev_task',
    entityId: task.id,
    ip: await clientIp(),
    meta: { number: task.number, fields: [...changes.map((c) => c.field), ...(assigneeChanged ? ['assigneeId'] : [])] },
  });

  // مسئول تازه را خبر کن؛ اگر خودش تسک را برداشته، لازم نیست
  if (assigneeChanged && updated.assigneeId && updated.assigneeId !== user.id) {
    await notifyAssigned(updated, user);
  }
  const rank = (list: readonly string[], v: string) => list.indexOf(v);
  const raised =
    rank(TASK_PRIORITIES, updated.priority) > rank(TASK_PRIORITIES, task.priority) ||
    rank(TASK_NECESSITIES, updated.necessity) > rank(TASK_NECESSITIES, task.necessity);
  if (raised && !assigneeChanged) await notifyPriorityRaised(updated, user);

  return ok({ id: task.id, changed: true });
});

/** حذف کامل تسک — فقط مدیر. برای کنار گذاشتن معمولاً بایگانی بهتر است */
export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const task = await findTask(id);

  await prisma.devTask.delete({ where: { id: task.id } });
  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'task.delete',
    entity: 'dev_task',
    entityId: task.id,
    ip: await clientIp(),
    meta: { number: task.number, title: task.title },
  });

  return ok({ deleted: true });
});
