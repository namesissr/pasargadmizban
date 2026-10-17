import type { DevTask, Prisma } from '@prisma/client';
import prisma from './prisma';
import { ApiError } from './errors';
import { notify } from './notify';
import { formatNumber } from './money';
import { env } from './env';
import { rateLimit } from './rate-limit';
import { readPreferences, inQuietHours } from './preferences';
import { sendSmsDetailed } from './sms';
import {
  EMPLOYER_ROLES,
  OPEN_STATUSES,
  TASK_NECESSITY_FA,
  TASK_PRIORITY_FA,
  TASK_STATUS_FA,
  TASK_TYPE_FA,
  formatMinutes,
  isOverdue,
  isTaskManager,
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

const ASSIGNABLE_ROLES = ['DEVELOPER', ...EMPLOYER_ROLES] as const;

/** کاربرانی که می‌توان تسک را به آن‌ها سپرد: برنامه‌نویس‌ها و کارفرماها */
export async function assignableUsers() {
  return prisma.user.findMany({
    where: { role: { in: [...ASSIGNABLE_ROLES] }, deletedAt: null, status: { not: 'BANNED' } },
    select: userBrief,
    orderBy: [{ role: 'desc' }, { createdAt: 'asc' }],
  });
}

export async function assertAssignable(userId: string | null | undefined) {
  if (!userId) return;
  const target = await prisma.user.findFirst({
    where: { id: userId, role: { in: [...ASSIGNABLE_ROLES] }, deletedAt: null },
    select: { id: true },
  });
  if (!target) {
    throw new ApiError('مسئول انتخاب‌شده معتبر نیست؛ فقط کارفرما یا برنامه‌نویس را می‌توان انتخاب کرد.', 422, {
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

/** دنبال کردن تسک — تکراری بودن مشکلی ایجاد نمی‌کند */
export async function addWatchers(taskId: string, userIds: (string | null | undefined)[]) {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return;
  await prisma.devTaskWatcher.createMany({
    data: ids.map((userId) => ({ taskId, userId })),
    skipDuplicates: true,
  });
}

async function watcherIds(taskId: string): Promise<string[]> {
  const rows = await prisma.devTaskWatcher.findMany({ where: { taskId }, select: { userId: true } });
  return rows.map((r) => r.userId);
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

/** پیوند کوتاه که هر نفر را به صفحه تسک در پنل خودش (کارفرما یا برنامه‌نویس) می‌برد */
function taskLink(task: { number: number }) {
  return `/t/${task.number}`;
}

function taskHeadline(task: { number: number; title: string }) {
  return `#${formatNumber(task.number)} — ${task.title}`;
}

function isHot(task: { priority: string; necessity: string }) {
  return task.priority === 'URGENT' || task.necessity === 'CRITICAL';
}

/** همه کارفرماها (مدیر سایت و کارفرما) */
async function managerIds(): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { role: { in: [...EMPLOYER_ROLES] }, deletedAt: null, status: { not: 'BANNED' } },
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

// ───────────────  پیامک (کاوه‌نگار)  ───────────────

type TaskSms = { text: string; number?: number; throttle?: boolean };

function shortTitle(title: string, max = 45) {
  return title.length > max ? `${title.slice(0, max - 1).trim()}…` : title;
}

/** متن پیامک کوتاه می‌ماند تا هزینه‌اش از دو سه بخش بیشتر نشود */
function taskSms(task: { number: number; title: string }, event: string, opts: { throttle?: boolean } = {}): TaskSms {
  return {
    text: `میز کار #${task.number} «${shortTitle(task.title)}»\n${event}\n${env.appUrl}${taskLink(task)}`,
    number: task.number,
    throttle: opts.throttle,
  };
}

/**
 * پیامک رویداد تسک به یک نفر. مستقل از کانال پیامک فروش سرور است و فقط به شماره
 * موبایل حساب و کلید «پیامک تسک‌ها» در حساب من بستگی دارد. ساعات سکوت رعایت می‌شود
 * مگر برای رویداد فوری.
 */
async function smsOne(userId: string, sms: TaskSms, urgent: boolean) {
  const [user, prefs] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { phone: true, deletedAt: true, status: true } }),
    readPreferences(userId),
  ]);
  if (!user?.phone || user.deletedAt || user.status === 'BANNED') return;
  if (prefs?.taskSms === false) return;
  if (!urgent && inQuietHours(prefs)) return;
  // چند تغییر پشت سر هم روی یک تسک (مثلاً چند مورد چک‌لیست) نباید ده‌ها پیامک بسازد
  if (sms.throttle && sms.number) {
    if (!(await rateLimit(`task-sms:${userId}:${sms.number}`, 5, 600)).allowed) return;
  }
  // سقف کلی برای محافظت از اعتبار پنل پیامک
  if (!(await rateLimit(`task-sms:${userId}`, 40, 3600)).allowed) return;
  await sendSmsDetailed(user.phone, sms.text);
}

function smsMany(ids: string[], sms: TaskSms, opts: { urgent?: boolean; wait?: boolean }) {
  const job = Promise.allSettled(ids.map((id) => smsOne(id, sms, Boolean(opts.urgent))));
  // مثل اعلان تلگرام: در مسیرهای وب پاسخ کاربر معطل پیامک نمی‌ماند
  return opts.wait ? job : undefined;
}

async function sendTo(
  ids: Iterable<string | null | undefined>,
  exceptId: string | null,
  input: Parameters<typeof notify>[1],
  sms?: TaskSms | null,
) {
  const unique = new Set<string>();
  for (const id of ids) if (id && id !== exceptId) unique.add(id);
  const list = [...unique];
  await Promise.all([
    ...list.map((id) => notify(id, { kind: 'ticket', ...input })),
    sms ? smsMany(list, sms, input) : undefined,
  ]);
}

/** اولویت و ضرورت در یک عبارت کوتاه برای پیامک */
function smsLevel(task: Pick<TaskLite, 'priority' | 'necessity'>) {
  return `اولویت ${TASK_PRIORITY_FA[task.priority as TaskPriority]?.label ?? task.priority}، ضرورت ${
    TASK_NECESSITY_FA[task.necessity as TaskNecessity]?.label ?? task.necessity
  }`;
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
  }, taskSms(task, `${hot ? 'تسک فوری' : 'تسک جدید'} از ${actorName(actor)} — ${smsLevel(task)}`));
  // کارفرمای دیگر هم باید بداند چه کاری به تیم سپرده شده
  {
    const byManager = isTaskManager(actor.role);
    await sendTo(
      await managerIds(),
      actor.id,
      {
        type: 'info',
        title: `تسک جدید ثبت شد ${taskHeadline(task)}`,
        body: `${actorName(actor)} ثبت کرد. ${taskSummaryLine(task)}`,
        link: taskLink(task),
        telegram: !byManager,
      },
      byManager ? null : taskSms(task, `تسک جدید از ${actorName(actor)} — ${smsLevel(task)}`),
    );
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
  }, taskSms(task, `${actorName(actor)} این تسک را به شما سپرد — ${smsLevel(task)}`));
}

export async function notifyPriorityRaised(task: TaskLite, actor: TaskActor) {
  if (!task.assigneeId) return;
  await sendTo([task.assigneeId], actor.id, {
    type: 'warning',
    title: `اولویت تسک ${taskHeadline(task)} بالا رفت`,
    body: taskSummaryLine(task),
    link: taskLink(task),
    urgent: isHot(task),
  }, taskSms(task, `${actorName(actor)} اهمیت این تسک را بالا برد — ${smsLevel(task)}`));
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
  const smsNote = comment ? `: «${shortTitle(comment.replace(/\s+/g, ' '), 70)}»` : '';
  const watchers = await watcherIds(task.id);

  if (to === 'REVIEW') {
    await sendTo([...(await managerIds()), task.reporterId, ...watchers], actor.id, {
      type: 'success',
      title: `✅ انجام شد: ${taskHeadline(task)}`,
      body: `${who} اعلام کرد این تسک انجام شده و منتظر بررسی و تأیید شماست.${note}`,
      link: taskLink(task),
      email: true,
    }, taskSms(task, `${who} اعلام کرد انجام شد؛ منتظر تأیید شماست${smsNote}`));
    return;
  }
  if (to === 'BLOCKED') {
    await sendTo([...(await managerIds()), task.reporterId, ...watchers], actor.id, {
      type: 'warning',
      title: `⛔ نیاز به اطلاعات: ${taskHeadline(task)}`,
      body: `${who} برای ادامه کار به پاسخ شما نیاز دارد.${note}`,
      link: taskLink(task),
      email: true,
      urgent: isHot(task),
    }, taskSms(task, `${who} سؤال دارد و منتظر پاسخ شماست${smsNote}`));
    return;
  }
  if (to === 'DONE') {
    await sendTo([task.assigneeId, task.reporterId, ...watchers], actor.id, {
      type: 'success',
      title: `🎉 تأیید شد: ${taskHeadline(task)}`,
      body: `${who} نتیجه کار را تأیید کرد و تسک بسته شد.${note}`,
      link: taskLink(task),
    }, taskSms(task, `${who} تأیید کرد و تسک بسته شد`));
    return;
  }
  if ((from === 'REVIEW' || from === 'DONE') && (to === 'IN_PROGRESS' || to === 'TODO')) {
    await sendTo([task.assigneeId, ...watchers], actor.id, {
      type: 'error',
      title: `↩️ برگشت داده شد: ${taskHeadline(task)}`,
      body: `${who} این کار را برای اصلاح برگرداند.${note}`,
      link: taskLink(task),
      email: true,
      urgent: isHot(task),
    }, taskSms(task, `${who} برای اصلاح برگرداند${smsNote}`));
    return;
  }
  if (to === 'CANCELED') {
    await sendTo([task.assigneeId, task.reporterId, ...watchers], actor.id, {
      type: 'info',
      title: `لغو شد: ${taskHeadline(task)}`,
      body: `${who} این تسک را لغو کرد؛ دیگر لازم نیست روی آن کار کنید.${note}`,
      link: taskLink(task),
    }, taskSms(task, `${who} این تسک را لغو کرد`));
    return;
  }
  // شروع کار یا ادامه کار: مدیر در جریان باشد ولی بدون ایمیل
  if (to === 'IN_PROGRESS' && actor.role === 'DEVELOPER') {
    await sendTo([...(await managerIds()), task.reporterId, ...watchers], actor.id, {
      type: 'info',
      title: `شروع شد: ${taskHeadline(task)}`,
      body: `${who} کار روی این تسک را شروع کرد.`,
      link: taskLink(task),
      telegram: false,
    }, taskSms(task, `${who} کار را شروع کرد`));
  }
}

/**
 * نظر جدید: همه طرف‌های درگیر به‌جز نویسنده باخبر می‌شوند. کسانی که در نظر
 * نامشان برده شده (mention) اعلان جداگانه و برجسته می‌گیرند و دنبال‌کننده تسک می‌شوند.
 */
export async function notifyComment(task: TaskLite, actor: TaskActor, body: string, mentionIds: string[] = []) {
  const mentioned = new Set(mentionIds.filter((id) => id !== actor.id));
  if (mentioned.size) {
    await addWatchers(task.id, [...mentioned]);
    await sendTo(mentioned, actor.id, {
      type: 'warning',
      title: `📣 ${actorName(actor)} شما را در ${taskHeadline(task)} صدا زد`,
      body: body.slice(0, 500),
      link: taskLink(task),
      email: true,
    }, taskSms(task, `${actorName(actor)} شما را صدا زد: «${shortTitle(body.replace(/\s+/g, ' '), 70)}»`));
  }

  const recipients: (string | null)[] = [task.assigneeId, task.reporterId, ...(await watcherIds(task.id))];
  // پاسخ برنامه‌نویس یا پشتیبان باید حتماً به دست کارفرماها برسد
  if (!isTaskManager(actor.role)) recipients.push(...(await managerIds()));
  // کسانی که پیش‌تر در گفتگو نظر داده‌اند هم در جریان می‌مانند
  const commenters = await prisma.devTaskActivity.findMany({
    where: { taskId: task.id, kind: 'COMMENT', userId: { not: null } },
    select: { userId: true },
    distinct: ['userId'],
  });
  recipients.push(...commenters.map((c) => c.userId));

  await sendTo(recipients.filter((id) => !id || !mentioned.has(id)), actor.id, {
    type: 'info',
    title: `💬 نظر جدید در ${taskHeadline(task)}`,
    body: `${actorName(actor)}: ${body.slice(0, 500)}`,
    link: taskLink(task),
  }, taskSms(task, `نظر ${actorName(actor)}: «${shortTitle(body.replace(/\s+/g, ' '), 70)}»`, { throttle: true }));
}

/**
 * تغییرهای دیگر روی تسک (پیوست، چک‌لیست، ویرایش جزئیات): مسئول، ثبت‌کننده و
 * دنبال‌کننده‌ها باخبر می‌شوند و اگر کار را برنامه‌نویس کرده، کارفرماها هم.
 */
export async function notifyTaskChange(task: TaskLite, actor: TaskActor, what: string) {
  const recipients: (string | null)[] = [task.assigneeId, task.reporterId, ...(await watcherIds(task.id))];
  if (!isTaskManager(actor.role)) recipients.push(...(await managerIds()));
  await sendTo(
    recipients,
    actor.id,
    {
      type: 'info',
      title: `✏️ تغییر در ${taskHeadline(task)}`,
      body: `${actorName(actor)} ${what}`,
      link: taskLink(task),
    },
    taskSms(task, `${actorName(actor)} ${what}`, { throttle: true }),
  );
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
    let message: { title: string; body: string; sms: string; to: string[]; type: 'warning' | 'error' } | null = null;

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
          sms: `یادآوری: ${task.status === 'REVIEW' ? 'منتظر تأیید شما' : 'منتظر پاسخ شما'}`,
        };
      }
    } else if (dueIn !== null && dueIn < 0) {
      if (sinceReminder > 24 * HOUR) {
        message = {
          to: [...owner, ...managers],
          type: 'error',
          title: `🔴 مهلت گذشته: ${taskHeadline(task)}`,
          body: `مهلت این تسک تمام شده و هنوز ${TASK_STATUS_FA[task.status as TaskStatus].label} است.`,
          sms: 'مهلت این تسک گذشته است',
        };
      }
    } else if (dueIn !== null && dueIn < 24 * HOUR) {
      if (sinceReminder > 20 * HOUR) {
        message = {
          to: owner,
          type: 'warning',
          title: `⏰ کمتر از یک روز تا مهلت: ${taskHeadline(task)}`,
          body: taskSummaryLine(task),
          sms: 'کمتر از یک روز تا مهلت مانده',
        };
      }
    } else if (task.status === 'TODO' && isHot(task) && now.getTime() - task.createdAt.getTime() > 2 * HOUR) {
      if (sinceReminder > 6 * HOUR) {
        message = {
          to: owner,
          type: 'error',
          title: `🔥 تسک فوری هنوز شروع نشده: ${taskHeadline(task)}`,
          body: taskSummaryLine(task),
          sms: 'تسک فوری هنوز شروع نشده',
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
    }, taskSms(task, message.sms));
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
      link: '/dev',
      email: true,
      wait: true,
    });
    await smsMany(
      [dev.id],
      {
        text: `میز کار: امروز ${formatNumber(mine.length)} تسک باز دارید${overdue ? `، ${formatNumber(overdue)} عقب‌افتاده` : ''}.\n${env.appUrl}/dev`,
      },
      { wait: true },
    );
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

  // کارکرد دیروز هر برنامه‌نویس: چه چیزی تحویل داد و چقدر وقت ثبت کرد
  const since = new Date(now.getTime() - 24 * HOUR);
  const report: string[] = [];
  for (const dev of developers) {
    const [user, submitted, minutes] = await Promise.all([
      prisma.user.findUnique({ where: { id: dev.id }, select: { firstName: true, lastName: true, email: true } }),
      prisma.devTaskActivity.count({
        where: { userId: dev.id, kind: 'STATUS', createdAt: { gte: since }, meta: { path: ['to'], equals: 'REVIEW' } },
      }),
      prisma.devTaskTimeLog.aggregate({
        where: { userId: dev.id, endedAt: { gte: since } },
        _sum: { minutes: true },
      }),
    ]);
    const openCount = open.filter((t) => t.assigneeId === dev.id).length;
    const spent = minutes._sum.minutes ?? 0;
    report.push(
      `• ${actorName(user)}: ${formatNumber(submitted)} کار تحویل داد، ${formatMinutes(spent)} کارکرد، ${formatNumber(openCount)} کار باز`,
    );
  }
  if (report.length) sections.push(`کارکرد ۲۴ ساعت گذشته تیم:\n${report.join('\n')}`);

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
    await smsMany(
      [id],
      {
        text: `میز کار — گزارش امروز: ${formatNumber(open.length)} باز، ${formatNumber(review.length)} منتظر تأیید، ${formatNumber(
          blocked.length,
        )} منتظر پاسخ، ${formatNumber(overdue.length)} عقب‌افتاده.\n${env.appUrl}/tasks`,
      },
      { wait: true },
    );
    sent++;
  }

  return { sent, open: open.length };
}
