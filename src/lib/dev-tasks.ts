import type { DevTask, Prisma } from '@prisma/client';
import prisma from './prisma';
import { ApiError } from './errors';
import { notify } from './notify';
import { formatNumber } from './money';
import {
  OPEN_STATUSES,
  TASK_NECESSITY_FA,
  TASK_PRIORITY_FA,
  TASK_STATUS_FA,
  TASK_TYPE_FA,
  isOverdue,
  urgencyScore,
  type TaskNecessity,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from './dev-tasks-shared';

/**
 * منطق سمت سرور میز کار تسک‌ها: دسترسی، ثبت تاریخچه، اعلان و یادآوری.
 * این ماژول به Next.js وابسته نیست تا ورکر پس‌زمینه هم بتواند از آن استفاده کند.
 */

export type TaskActor = {
  id: string;
  role: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
};

export function actorName(user: { firstName?: string | null; lastName?: string | null; email?: string | null } | null) {
  if (!user) return 'سیستم';
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email || 'کاربر';
}

export const userBrief = { id: true, email: true, firstName: true, lastName: true, role: true } as const;

/** یافتن تسک با شناسه یا شماره — صفحات با شماره کار می‌کنند و API با هر دو */
export async function findTask(idOrNumber: string): Promise<DevTask> {
  const n = Number(idOrNumber);
  const task = Number.isInteger(n) && n > 0 && String(n) === idOrNumber
    ? await prisma.devTask.findUnique({ where: { number: n } })
    : await prisma.devTask.findUnique({ where: { id: idOrNumber } });
  if (!task) throw new ApiError('تسک موردنظر پیدا نشد.', 404, { code: 'not_found' });
  return task;
}

/** کاربرانی که می‌توان تسک را به آن‌ها سپرد */
export async function assignableUsers() {
  return prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'DEVELOPER'] }, deletedAt: null, status: { not: 'BANNED' } },
    select: userBrief,
    orderBy: [{ role: 'desc' }, { createdAt: 'asc' }],
  });
}

export async function assertAssignable(userId: string | null | undefined) {
  if (!userId) return;
  const target = await prisma.user.findFirst({
    where: { id: userId, role: { in: ['ADMIN', 'DEVELOPER'] }, deletedAt: null },
    select: { id: true },
  });
  if (!target) {
    throw new ApiError('مسئول انتخاب‌شده معتبر نیست؛ فقط مدیر یا برنامه‌نویس را می‌توان انتخاب کرد.', 422, {
      fields: { assigneeId: 'مسئول معتبر نیست.' },
    });
  }
}

/** ثبت یک رویداد در تاریخچه و به‌روز کردن زمان آخرین فعالیت تسک */
export async function logActivity(
  taskId: string,
  userId: string | null,
  kind: string,
  meta: Prisma.InputJsonValue = {},
  body?: string | null,
  tx: Prisma.TransactionClient = prisma,
) {
  const activity = await tx.devTaskActivity.create({
    data: { taskId, userId, kind, meta, body: body ?? null },
  });
  await tx.devTask.update({ where: { id: taskId }, data: { activityAt: new Date() } });
  return activity;
}

/** کسی که الان کاری انجام داده، طبیعتاً آخرین نسخه را دیده است */
export async function markSeen(taskId: string, userId: string) {
  await prisma.devTaskView.upsert({
    where: { taskId_userId: { taskId, userId } },
    create: { taskId, userId, seenAt: new Date() },
    update: { seenAt: new Date() },
  });
}

// ───────────────  اعلان‌ها  ───────────────

type TaskLite = Pick<DevTask, 'id' | 'number' | 'title' | 'priority' | 'necessity' | 'type' | 'assigneeId' | 'reporterId' | 'dueAt'>;

function taskLink(task: { number: number }) {
  return `/tasks/${task.number}`;
}

function taskHeadline(task: { number: number; title: string }) {
  return `#${formatNumber(task.number)} — ${task.title}`;
}

function isHot(task: { priority: string; necessity: string }) {
  return task.priority === 'URGENT' || task.necessity === 'CRITICAL';
}

async function managerIds(): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { role: 'ADMIN', deletedAt: null },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function developerIds(): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { role: 'DEVELOPER', deletedAt: null, status: { not: 'BANNED' } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function sendTo(
  ids: Iterable<string | null | undefined>,
  exceptId: string | null,
  input: Parameters<typeof notify>[1],
) {
  const unique = new Set<string>();
  for (const id of ids) if (id && id !== exceptId) unique.add(id);
  await Promise.all([...unique].map((id) => notify(id, { kind: 'ticket', ...input })));
}

function taskSummaryLine(task: TaskLite) {
  const parts = [
    `${TASK_TYPE_FA[task.type as TaskType]?.label ?? task.type}`,
    `اولویت ${TASK_PRIORITY_FA[task.priority as TaskPriority]?.label ?? task.priority}`,
    `ضرورت ${TASK_NECESSITY_FA[task.necessity as TaskNecessity]?.label ?? task.necessity}`,
  ];
  if (task.dueAt) {
    parts.push(
      `مهلت ${new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'medium', timeZone: 'Asia/Tehran' }).format(task.dueAt)}`,
    );
  }
  return parts.join(' · ');
}

/** تسک تازه ثبت شد: مسئول (یا اگر مسئولی ندارد همه برنامه‌نویس‌ها) و مدیران باخبر شوند */
export async function notifyTaskCreated(task: TaskLite, actor: TaskActor) {
  const hot = isHot(task);
  const recipients = task.assigneeId ? [task.assigneeId] : await developerIds();
  await sendTo(recipients, actor.id, {
    type: hot ? 'error' : 'info',
    title: `${hot ? '🔥 تسک فوری' : 'تسک جدید'} ${taskHeadline(task)}`,
    body: `${actorName(actor)} این تسک را ${task.assigneeId ? 'به شما سپرد' : 'ثبت کرد'}.\n${taskSummaryLine(task)}`,
    link: taskLink(task),
    email: true,
    urgent: hot,
  });
  // اگر پشتیبان یا برنامه‌نویس تسک ثبت کرده، مدیر هم باید ببیند
  if (actor.role !== 'ADMIN') {
    await sendTo(await managerIds(), actor.id, {
      type: 'info',
      title: `تسک جدید ثبت شد ${taskHeadline(task)}`,
      body: `${actorName(actor)} ثبت کرد. ${taskSummaryLine(task)}`,
      link: taskLink(task),
    });
  }
}

export async function notifyAssigned(task: TaskLite, actor: TaskActor) {
  if (!task.assigneeId) return;
  await sendTo([task.assigneeId], actor.id, {
    type: isHot(task) ? 'error' : 'info',
    title: `تسک ${taskHeadline(task)} به شما سپرده شد`,
    body: taskSummaryLine(task),
    link: taskLink(task),
    email: true,
    urgent: isHot(task),
  });
}

export async function notifyPriorityRaised(task: TaskLite, actor: TaskActor) {
  if (!task.assigneeId) return;
  await sendTo([task.assigneeId], actor.id, {
    type: 'warning',
    title: `اولویت تسک ${taskHeadline(task)} بالا رفت`,
    body: taskSummaryLine(task),
    link: taskLink(task),
    urgent: isHot(task),
  });
}

export async function notifyStatusChanged(
  task: TaskLite,
  actor: TaskActor,
  from: TaskStatus,
  to: TaskStatus,
  comment?: string | null,
) {
  const who = actorName(actor);
  const note = comment ? `\n«${comment.slice(0, 400)}»` : '';

  if (to === 'REVIEW') {
    await sendTo([...(await managerIds()), task.reporterId], actor.id, {
      type: 'success',
      title: `✅ انجام شد: ${taskHeadline(task)}`,
      body: `${who} اعلام کرد این تسک انجام شده و منتظر بررسی و تأیید شماست.${note}`,
      link: taskLink(task),
      email: true,
    });
    return;
  }
  if (to === 'BLOCKED') {
    await sendTo([...(await managerIds()), task.reporterId], actor.id, {
      type: 'warning',
      title: `⛔ نیاز به اطلاعات: ${taskHeadline(task)}`,
      body: `${who} برای ادامه کار به پاسخ شما نیاز دارد.${note}`,
      link: taskLink(task),
      email: true,
      urgent: isHot(task),
    });
    return;
  }
  if (to === 'DONE') {
    await sendTo([task.assigneeId, task.reporterId], actor.id, {
      type: 'success',
      title: `🎉 تأیید شد: ${taskHeadline(task)}`,
      body: `${who} نتیجه کار را تأیید کرد و تسک بسته شد.${note}`,
      link: taskLink(task),
    });
    return;
  }
  if ((from === 'REVIEW' || from === 'DONE') && (to === 'IN_PROGRESS' || to === 'TODO')) {
    await sendTo([task.assigneeId], actor.id, {
      type: 'error',
      title: `↩️ برگشت داده شد: ${taskHeadline(task)}`,
      body: `${who} این کار را برای اصلاح برگرداند.${note}`,
      link: taskLink(task),
      email: true,
      urgent: isHot(task),
    });
    return;
  }
  if (to === 'CANCELED') {
    await sendTo([task.assigneeId, task.reporterId], actor.id, {
      type: 'info',
      title: `لغو شد: ${taskHeadline(task)}`,
      body: `${who} این تسک را لغو کرد؛ دیگر لازم نیست روی آن کار کنید.${note}`,
      link: taskLink(task),
    });
    return;
  }
  // شروع کار یا ادامه کار: مدیر در جریان باشد ولی بدون ایمیل
  if (to === 'IN_PROGRESS' && actor.role === 'DEVELOPER') {
    await sendTo([...(await managerIds()), task.reporterId], actor.id, {
      type: 'info',
      title: `شروع شد: ${taskHeadline(task)}`,
      body: `${who} کار روی این تسک را شروع کرد.`,
      link: taskLink(task),
      telegram: false,
    });
  }
}

/** نظر جدید: همه طرف‌های درگیر به‌جز نویسنده باخبر می‌شوند */
export async function notifyComment(task: TaskLite, actor: TaskActor, body: string) {
  const recipients: (string | null)[] = [task.assigneeId, task.reporterId];
  // پاسخ برنامه‌نویس یا پشتیبان باید حتماً به دست مدیر برسد
  if (actor.role !== 'ADMIN') recipients.push(...(await managerIds()));
  // کسانی که پیش‌تر در گفتگو نظر داده‌اند هم در جریان می‌مانند
  const commenters = await prisma.devTaskActivity.findMany({
    where: { taskId: task.id, kind: 'COMMENT', userId: { not: null } },
    select: { userId: true },
    distinct: ['userId'],
  });
  recipients.push(...commenters.map((c) => c.userId));

  await sendTo(recipients, actor.id, {
    type: 'info',
    title: `💬 نظر جدید در ${taskHeadline(task)}`,
    body: `${actorName(actor)}: ${body.slice(0, 500)}`,
    link: taskLink(task),
  });
}

// ───────────────  یادآوری خودکار (ورکر)  ───────────────

const HOUR = 3_600_000;

/**
 * یادآوری‌های ساعتی تا هیچ تسکی فراموش نشود:
 *  • مهلت کمتر از ۲۴ ساعت مانده
 *  • از مهلت گذشته (هر ۲۴ ساعت یک بار)
 *  • تسک فوری/حیاتی که هنوز شروع نشده (هر ۶ ساعت)
 *  • تسک «منتظر تأیید» یا «نیاز به اطلاعات» که بیش از ۲۴ ساعت بی‌جواب مانده (به مدیر)
 */
export async function runTaskReminders(now = new Date()) {
  const open = await prisma.devTask.findMany({
    where: { status: { in: OPEN_STATUSES }, archivedAt: null },
  });

  let sent = 0;
  const managers = await managerIds();
  const developers = await developerIds();

  for (const task of open) {
    const sinceReminder = task.remindedAt ? now.getTime() - task.remindedAt.getTime() : Infinity;
    const owner = task.assigneeId ? [task.assigneeId] : developers;
    let message: { title: string; body: string; to: string[]; type: 'warning' | 'error' } | null = null;

    const dueIn = task.dueAt ? task.dueAt.getTime() - now.getTime() : null;
    const idleFor = now.getTime() - task.activityAt.getTime();

    if (task.status === 'REVIEW' || task.status === 'BLOCKED') {
      // توپ در زمین مدیر است
      if (idleFor > 24 * HOUR && sinceReminder > 24 * HOUR) {
        message = {
          to: managers,
          type: 'warning',
          title: `⏳ ${task.status === 'REVIEW' ? 'منتظر تأیید شما' : 'منتظر پاسخ شما'}: ${taskHeadline(task)}`,
          body:
            task.status === 'REVIEW'
              ? 'برنامه‌نویس این کار را انجام‌شده اعلام کرده؛ لطفاً بررسی و تأیید یا برگشت بزنید.'
              : 'برنامه‌نویس برای ادامه این کار به پاسخ شما نیاز دارد.',
        };
      }
    } else if (dueIn !== null && dueIn < 0) {
      if (sinceReminder > 24 * HOUR) {
        message = {
          to: [...owner, ...managers],
          type: 'error',
          title: `🔴 مهلت گذشته: ${taskHeadline(task)}`,
          body: `مهلت این تسک تمام شده و هنوز ${TASK_STATUS_FA[task.status as TaskStatus].label} است.`,
        };
      }
    } else if (dueIn !== null && dueIn < 24 * HOUR) {
      if (sinceReminder > 20 * HOUR) {
        message = {
          to: owner,
          type: 'warning',
          title: `⏰ کمتر از یک روز تا مهلت: ${taskHeadline(task)}`,
          body: taskSummaryLine(task),
        };
      }
    } else if (task.status === 'TODO' && isHot(task) && now.getTime() - task.createdAt.getTime() > 2 * HOUR) {
      if (sinceReminder > 6 * HOUR) {
        message = {
          to: owner,
          type: 'error',
          title: `🔥 تسک فوری هنوز شروع نشده: ${taskHeadline(task)}`,
          body: taskSummaryLine(task),
        };
      }
    }

    if (!message) continue;
    await sendTo(message.to, null, {
      type: message.type,
      title: message.title,
      body: message.body,
      link: taskLink(task),
      wait: true,
    });
    await prisma.devTask.update({ where: { id: task.id }, data: { remindedAt: now } });
    sent++;
  }

  return { checked: open.length, sent };
}

/**
 * خلاصه روزانه: هر برنامه‌نویس فهرست کارهای باز خودش را به ترتیب اهمیت می‌گیرد
 * و هر مدیر وضعیت کلی، کارهای منتظر تأیید و کارهای عقب‌افتاده را.
 */
export async function runTaskDigest(now = new Date()) {
  const open = await prisma.devTask.findMany({
    where: { status: { in: OPEN_STATUSES }, archivedAt: null },
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      priority: true,
      necessity: true,
      dueAt: true,
      assigneeId: true,
      activityAt: true,
    },
  });
  if (!open.length) return { sent: 0, open: 0 };

  const ranked = [...open].sort((a, b) => urgencyScore(b) - urgencyScore(a));
  const line = (t: (typeof open)[number]) => {
    const flags = [
      isOverdue(t) ? '🔴 عقب‌افتاده' : '',
      t.priority === 'URGENT' ? '🔥 فوری' : '',
      t.status === 'BLOCKED' ? '⛔ متوقف' : '',
    ].filter(Boolean);
    return `• #${formatNumber(t.number)} ${t.title}${flags.length ? ` (${flags.join('، ')})` : ''}`;
  };

  let sent = 0;

  // برنامه‌نویس‌ها
  const developers = await prisma.user.findMany({
    where: { role: 'DEVELOPER', deletedAt: null, status: { not: 'BANNED' } },
    select: { id: true },
  });
  for (const dev of developers) {
    const mine = ranked.filter(
      (t) => (t.assigneeId === dev.id || !t.assigneeId) && t.status !== 'REVIEW',
    );
    if (!mine.length) continue;
    const overdue = mine.filter((t) => isOverdue(t)).length;
    await notify(dev.id, {
      kind: 'ticket',
      type: overdue ? 'warning' : 'info',
      title: `📋 کارهای امروز شما: ${formatNumber(mine.length)} تسک باز${overdue ? `، ${formatNumber(overdue)} عقب‌افتاده` : ''}`,
      body: mine.slice(0, 8).map(line).join('\n') + (mine.length > 8 ? `\n… و ${formatNumber(mine.length - 8)} مورد دیگر` : ''),
      link: '/tasks?view=mine',
      email: true,
      wait: true,
    });
    sent++;
  }

  // مدیران
  const review = ranked.filter((t) => t.status === 'REVIEW');
  const blocked = ranked.filter((t) => t.status === 'BLOCKED');
  const overdue = ranked.filter((t) => isOverdue(t));
  const stale = ranked.filter(
    (t) => t.status === 'IN_PROGRESS' && now.getTime() - t.activityAt.getTime() > 3 * 24 * HOUR,
  );
  const sections: string[] = [];
  if (review.length) sections.push(`منتظر تأیید شما:\n${review.slice(0, 6).map(line).join('\n')}`);
  if (blocked.length) sections.push(`منتظر پاسخ شما:\n${blocked.slice(0, 6).map(line).join('\n')}`);
  if (overdue.length) sections.push(`عقب‌افتاده:\n${overdue.slice(0, 6).map(line).join('\n')}`);
  if (stale.length) sections.push(`بیش از ۳ روز بدون فعالیت:\n${stale.slice(0, 6).map(line).join('\n')}`);

  for (const id of await managerIds()) {
    await notify(id, {
      kind: 'ticket',
      type: review.length || blocked.length || overdue.length ? 'warning' : 'info',
      title: `📊 گزارش روزانه تسک‌ها: ${formatNumber(open.length)} باز، ${formatNumber(review.length)} منتظر تأیید`,
      body: sections.join('\n\n') || 'همه کارها روال عادی دارند.',
      link: '/tasks',
      email: true,
      wait: true,
    });
    sent++;
  }

  return { sent, open: open.length };
}
