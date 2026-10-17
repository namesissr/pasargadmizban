import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ok, route } from '@/lib/api';
import { requireTaskMember } from '@/lib/auth';
import { actorName, userBrief } from '@/lib/dev-tasks';
import { isTaskManager } from '@/lib/dev-tasks-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAY = 86_400_000;

const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' });
const faDay = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'short', timeZone: 'Asia/Tehran' });

/**
 * کارکرد ثبت‌شده در یک بازه. برنامه‌نویس فقط کارکرد خودش را می‌بیند؛
 * کارفرما کارکرد همه یا یک نفر را. با format=csv خروجی اکسل می‌دهد.
 */
export const GET = route(async (req: Request) => {
  const user = await requireTaskMember();
  const url = new URL(req.url);
  const days = Math.min(366, Math.max(1, Number(url.searchParams.get('days')) || 7));
  const requested = url.searchParams.get('user') ?? (isTaskManager(user.role) ? 'all' : 'me');
  const userId = !isTaskManager(user.role) || requested === 'me' ? user.id : requested === 'all' ? undefined : requested;
  const since = new Date(Date.now() - days * DAY);

  const logs = await prisma.devTaskTimeLog.findMany({
    where: { ...(userId ? { userId } : {}), OR: [{ endedAt: { gte: since } }, { endedAt: null }] },
    orderBy: { startedAt: 'desc' },
    take: 2000,
    include: {
      user: { select: userBrief },
      task: { select: { id: true, number: true, title: true, status: true } },
    },
  });

  if (url.searchParams.get('format') === 'csv') {
    const cell = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = logs
      .filter((l) => l.endedAt)
      .map((l) =>
        [faDay.format(l.startedAt), actorName(l.user), l.task.number, l.task.title, l.minutes, (l.minutes / 60).toFixed(2), l.manual ? 'دستی' : 'زمان‌سنج', l.note ?? '']
          .map(cell)
          .join(','),
      );
    const csv = '﻿' + ['تاریخ,نام,شماره تسک,عنوان تسک,دقیقه,ساعت,نوع ثبت,توضیح', ...lines].join('\r\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="worklog-${dayKey.format(new Date())}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const finished = logs.filter((l) => l.endedAt);
  const byDay = new Map<string, number>();
  const byUser = new Map<string, { id: string; name: string; minutes: number }>();
  const byTask = new Map<string, { number: number; title: string; minutes: number }>();
  for (const l of finished) {
    const key = dayKey.format(l.endedAt!);
    byDay.set(key, (byDay.get(key) ?? 0) + l.minutes);
    const u = byUser.get(l.userId) ?? { id: l.userId, name: actorName(l.user), minutes: 0 };
    u.minutes += l.minutes;
    byUser.set(l.userId, u);
    const t = byTask.get(l.taskId) ?? { number: l.task.number, title: l.task.title, minutes: 0 };
    t.minutes += l.minutes;
    byTask.set(l.taskId, t);
  }

  // همه روزهای بازه، حتی روزهای بدون کارکرد، تا نمودار فاصله‌ها را درست نشان دهد
  const daysList = Array.from({ length: Math.min(days, 31) }, (_, i) => {
    const d = new Date(Date.now() - i * DAY);
    const key = dayKey.format(d);
    return { day: key, label: faDay.format(d), minutes: byDay.get(key) ?? 0 };
  }).reverse();

  return ok({
    items: logs,
    total: finished.reduce((a, l) => a + l.minutes, 0),
    days: daysList,
    users: [...byUser.values()].sort((a, b) => b.minutes - a.minutes),
    tasks: [...byTask.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 20),
  });
});
