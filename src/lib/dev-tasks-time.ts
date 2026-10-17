import type { Prisma } from '@prisma/client';
import prisma from './prisma';
import { ApiError } from './errors';
import { TIMER_MAX_MINUTES, formatMinutes } from './dev-tasks-shared';
import { logActivity } from './dev-tasks';

/**
 * کارکرد برنامه‌نویس‌ها: زمان‌سنج شروع/توقف و ثبت دستی.
 *
 * هر نفر در هر لحظه فقط یک زمان‌سنج روشن دارد؛ شروع زمان‌سنج روی تسک دیگر،
 * قبلی را خودکار می‌بندد. جمع دقیقه‌ها روی خود تسک هم نگه داشته می‌شود تا
 * فهرست‌ها بدون جمع زدن جدول کارکرد سریع بمانند.
 */

export async function activeTimer(userId: string) {
  return prisma.devTaskTimeLog.findFirst({
    where: { userId, endedAt: null },
    include: { task: { select: { id: true, number: true, title: true, status: true } } },
  });
}

/** جمع دوباره دقیقه‌های تسک از روی جدول کارکرد */
export async function recomputeSpent(taskId: string, tx: Prisma.TransactionClient = prisma) {
  const sum = await tx.devTaskTimeLog.aggregate({
    where: { taskId, endedAt: { not: null } },
    _sum: { minutes: true },
  });
  await tx.devTask.update({ where: { id: taskId }, data: { spentMinutes: sum._sum.minutes ?? 0 } });
}

function minutesBetween(start: Date, end: Date) {
  return Math.min(TIMER_MAX_MINUTES, Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000)));
}

/** بستن زمان‌سنج روشن کاربر (روی هر تسکی) — برمی‌گرداند چه تسکی بسته شد */
export async function stopTimer(userId: string, note?: string | null) {
  const running = await prisma.devTaskTimeLog.findFirst({ where: { userId, endedAt: null } });
  if (!running) return null;

  const now = new Date();
  const minutes = minutesBetween(running.startedAt, now);
  // زمان‌سنجی که از سقف یک جلسه گذشته، در همان سقف بسته می‌شود
  const endedAt = minutes >= TIMER_MAX_MINUTES ? new Date(running.startedAt.getTime() + TIMER_MAX_MINUTES * 60_000) : now;

  await prisma.$transaction(async (tx) => {
    await tx.devTaskTimeLog.update({
      where: { id: running.id },
      data: { endedAt, minutes, note: note?.trim() || running.note },
    });
    await recomputeSpent(running.taskId, tx);
  });
  if (minutes > 0) {
    await logActivity(running.taskId, userId, 'TIME', { minutes, label: formatMinutes(minutes) }, note?.trim() || null);
  }
  return { taskId: running.taskId, minutes };
}

export async function startTimer(userId: string, taskId: string) {
  const stopped = await stopTimer(userId);
  const log = await prisma.devTaskTimeLog.create({
    data: { taskId, userId, startedAt: new Date() },
  });
  return { log, stopped };
}

export async function addManualTime(userId: string, taskId: string, minutes: number, date: Date, note?: string | null) {
  if (minutes <= 0 || minutes > 16 * 60) throw new ApiError('کارکرد باید بین ۱ دقیقه تا ۱۶ ساعت باشد.', 422);
  const startedAt = new Date(date.getTime() - minutes * 60_000);
  const log = await prisma.$transaction(async (tx) => {
    const row = await tx.devTaskTimeLog.create({
      data: { taskId, userId, startedAt, endedAt: date, minutes, note: note?.trim() || null, manual: true },
    });
    await recomputeSpent(taskId, tx);
    return row;
  });
  await logActivity(taskId, userId, 'TIME', { minutes, label: formatMinutes(minutes), manual: true }, note?.trim() || null);
  return log;
}

/** زمان‌سنج‌های فراموش‌شده که از سقف یک جلسه گذشته‌اند — ورکر آن‌ها را می‌بندد */
export async function closeStaleTimers(now = new Date()) {
  const cutoff = new Date(now.getTime() - TIMER_MAX_MINUTES * 60_000);
  const stale = await prisma.devTaskTimeLog.findMany({
    where: { endedAt: null, startedAt: { lt: cutoff } },
    select: { userId: true },
  });
  for (const t of stale) await stopTimer(t.userId, 'بسته‌شدن خودکار — زمان‌سنج بیش از ۱۰ ساعت روشن مانده بود');
  return stale.length;
}
