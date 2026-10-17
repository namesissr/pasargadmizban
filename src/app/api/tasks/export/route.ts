import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { route } from '@/lib/api';
import { requireTaskMember } from '@/lib/auth';
import { actorName } from '@/lib/dev-tasks';
import { baseWhere, readTaskParams, sortTasks, statusWhere, taskListSelect } from '@/lib/dev-tasks-query';
import {
  TASK_NECESSITY_FA,
  TASK_PRIORITY_FA,
  TASK_STATUS_FA,
  TASK_TYPE_FA,
  type TaskNecessity,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from '@/lib/dev-tasks-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const dateFmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Tehran',
  hour12: false,
});

function cell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** خروجی CSV فهرست فعلی (با همان فیلترها) — با BOM تا اکسل حروف فارسی را درست نشان دهد */
export const GET = route(async (req: Request) => {
  const user = await requireTaskMember();
  const params = readTaskParams(req);
  const rows = await prisma.devTask.findMany({
    where: { AND: [baseWhere(params, user.id), statusWhere(params, user.id)] },
    select: taskListSelect,
    take: 5000,
  });

  const header = ['شماره', 'عنوان', 'نوع', 'وضعیت', 'اولویت', 'ضرورت', 'بخش', 'برچسب‌ها', 'مسئول', 'ثبت‌کننده', 'مهلت', 'تاریخ ثبت', 'تاریخ تأیید', 'دفعات برگشت'];
  const lines = sortTasks(rows, params.sort).map((t) =>
    [
      t.number,
      t.title,
      TASK_TYPE_FA[t.type as TaskType]?.label,
      TASK_STATUS_FA[t.status as TaskStatus]?.label,
      TASK_PRIORITY_FA[t.priority as TaskPriority]?.label,
      TASK_NECESSITY_FA[t.necessity as TaskNecessity]?.label,
      t.area,
      t.labels.join('، '),
      t.assignee ? actorName(t.assignee) : '',
      t.reporter ? actorName(t.reporter) : '',
      t.dueAt ? dateFmt.format(t.dueAt) : '',
      dateFmt.format(t.createdAt),
      t.completedAt ? dateFmt.format(t.completedAt) : '',
      t.reopenCount,
    ]
      .map(cell)
      .join(','),
  );

  const csv = '﻿' + [header.join(','), ...lines].join('\r\n');
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="tasks-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});
