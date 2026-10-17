'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { AlertTriangle, CheckCircle2, HelpCircle, Inbox, ListChecks, Timer, UserX } from 'lucide-react';
import { Card, LoadingBlock, Select, Stat } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiPatch, errorMessage, fetcher } from '@/lib/client';
import { formatNumber } from '@/lib/money';
import { cn, faRelative } from '@/lib/utils';
import { TASK_STATUS_FA, formatMinutes, type TaskStatus } from '@/lib/dev-tasks-shared';
import { useTaskMeta } from './filters';
import { TaskCard } from './task-list';
import { TeamCards, type TeamMember } from './team';
import { Avatar, TaskNumber } from './ui';
import { personName, type Person, type TaskRow } from './types';

type Recent = {
  id: string;
  kind: string;
  meta: Record<string, unknown>;
  body: string | null;
  createdAt: string;
  user: Person | null;
  task: { number: number; title: string };
};

type EmployerHomeData = {
  review: TaskRow[];
  blocked: TaskRow[];
  overdue: TaskRow[];
  unassigned: TaskRow[];
  recent: Recent[];
  employers: Person[];
  team: TeamMember[];
  minutesToday: number;
};

function Section({
  title,
  icon,
  tone,
  count,
  empty,
  more,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  tone?: 'bad' | 'warn';
  count: number;
  empty: string;
  more?: string;
  children: React.ReactNode;
}) {
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          {icon} {title}
          <span
            className={cn(
              'tabular rounded-full px-2 text-[11px] font-bold',
              count && tone === 'bad' ? 'bg-red-500 text-white' : count && tone === 'warn' ? 'bg-amber-500 text-white' : 'surface-2',
            )}
          >
            {formatNumber(count)}
          </span>
        </span>
      }
      action={
        more && count ? (
          <Link href={more} className="text-xs text-[var(--color-brand-600)] hover:underline">
            همه
          </Link>
        ) : null
      }
      bodyClassName={count ? 'p-3' : 'p-4'}
    >
      {count ? <ul className="space-y-2">{children}</ul> : <p className="flex items-center gap-2 text-xs text-emerald-600"><CheckCircle2 size={14} /> {empty}</p>}
    </Card>
  );
}

/** سپردن سریع تسک بی‌مسئول بدون باز کردن صفحه آن */
function QuickAssign({ task, onDone }: { task: TaskRow; onDone: () => void }) {
  const { data: meta } = useTaskMeta();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const devs = meta?.members.filter((m) => m.role === 'DEVELOPER') ?? [];
  return (
    <li className="card flex flex-wrap items-center gap-2 p-3">
      <Link href={`/tasks/${task.number}`} className="min-w-0 flex-1 text-xs font-semibold hover:text-[var(--color-brand-600)]">
        <TaskNumber number={task.number} className="ml-1" /> {task.title}
      </Link>
      <div className="w-full sm:w-52">
        <Select
          value=""
          disabled={busy}
          className="py-1.5 text-xs"
          onChange={async (e) => {
            if (!e.target.value) return;
            setBusy(true);
            try {
              await apiPatch(`/api/tasks/${task.id}`, { assigneeId: e.target.value });
              toast.success('تسک سپرده شد و برنامه‌نویس باخبر شد.');
              onDone();
            } catch (err) {
              toast.error(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <option value="">سپردن به…</option>
          {devs.map((d) => (
            <option key={d.id} value={d.id}>
              {personName(d)} — {formatNumber(d.openCount ?? 0)} کار باز
            </option>
          ))}
        </Select>
      </div>
    </li>
  );
}

function recentText(r: Recent): string {
  const m = r.meta as { to?: string; reopened?: boolean; label?: string };
  switch (r.kind) {
    case 'CREATED':
      return 'تسک را ثبت کرد';
    case 'COMMENT':
      return `نظر داد: ${r.body ?? 'فایل پیوست کرد'}`;
    case 'ASSIGNED':
      return 'مسئول را تغییر داد';
    case 'TIME':
      return `${m.label ?? ''} کارکرد ثبت کرد`;
    case 'STATUS':
      if (m.to === 'REVIEW') return 'اعلام کرد انجام شد';
      if (m.to === 'DONE') return 'تأیید کرد و بست';
      if (m.to === 'BLOCKED') return `پرسید: ${r.body ?? ''}`;
      if (m.reopened) return 'برای اصلاح برگرداند';
      return `وضعیت را «${TASK_STATUS_FA[m.to as TaskStatus]?.label ?? m.to}» کرد`;
    default:
      return r.kind;
  }
}

export function EmployerHome() {
  const { data, mutate } = useSWR<EmployerHomeData>('/api/tasks/home', fetcher, { refreshInterval: 30_000 });
  if (!data) return <LoadingBlock />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="منتظر تأیید" value={formatNumber(data.review.length)} tone={data.review.length ? 'warn' : 'ok'} icon={<Inbox size={16} />} />
        <Stat label="سؤال بی‌جواب" value={formatNumber(data.blocked.length)} tone={data.blocked.length ? 'bad' : 'ok'} icon={<HelpCircle size={16} />} />
        <Stat label="مهلت گذشته" value={formatNumber(data.overdue.length)} tone={data.overdue.length ? 'bad' : 'ok'} icon={<AlertTriangle size={16} />} />
        <Stat label="بدون مسئول" value={formatNumber(data.unassigned.length)} tone={data.unassigned.length ? 'warn' : undefined} icon={<UserX size={16} />} />
        <Stat label="کارکرد امروز تیم" value={formatMinutes(data.minutesToday)} icon={<Timer size={16} />} />
      </div>

      <div className="grid gap-5 lg:grid-cols-5 lg:items-start">
        <div className="min-w-0 space-y-5 lg:col-span-3">
          <Section
            title="منتظر تأیید شما"
            icon={<Inbox size={15} />}
            tone="warn"
            count={data.review.length}
            empty="کاری منتظر بررسی نیست."
            more="/tasks/list?view=all&status=REVIEW"
          >
            {data.review.slice(0, 8).map((t) => (
              <TaskCard key={t.id} task={t} href={`/tasks/${t.number}`} />
            ))}
          </Section>

          <Section
            title="سؤال‌های بی‌جواب برنامه‌نویس‌ها"
            icon={<HelpCircle size={15} />}
            tone="bad"
            count={data.blocked.length}
            empty="برنامه‌نویسی منتظر پاسخ نیست."
            more="/tasks/list?view=all&status=BLOCKED"
          >
            {data.blocked.slice(0, 8).map((t) => (
              <TaskCard key={t.id} task={t} href={`/tasks/${t.number}`} />
            ))}
          </Section>

          <Section
            title="مهلت گذشته"
            icon={<AlertTriangle size={15} />}
            tone="bad"
            count={data.overdue.length}
            empty="هیچ کاری از مهلتش عقب نیست."
            more="/tasks/list?view=overdue"
          >
            {data.overdue.slice(0, 6).map((t) => (
              <TaskCard key={t.id} task={t} href={`/tasks/${t.number}`} />
            ))}
          </Section>

          <Section
            title="بدون مسئول"
            icon={<UserX size={15} />}
            tone="warn"
            count={data.unassigned.length}
            empty="همه کارها مسئول دارند."
            more="/tasks/list?assignee=none"
          >
            {data.unassigned.slice(0, 8).map((t) => (
              <QuickAssign key={t.id} task={t} onDone={() => mutate()} />
            ))}
          </Section>
        </div>

        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Card
            title="تیم برنامه‌نویسان"
            action={
              <Link href="/tasks/team" className="text-xs text-[var(--color-brand-600)] hover:underline">
                جزئیات
              </Link>
            }
            bodyClassName="p-3"
          >
            {data.team.length ? (
              <TeamCards items={data.team} compact />
            ) : (
              <p className="text-xs leading-6 muted">
                هنوز برنامه‌نویسی تعریف نشده است. از «اعضای تیم و نقش‌ها» نقش حساب برنامه‌نویس‌ها را «برنامه‌نویس» کنید.
              </p>
            )}
          </Card>

          <Card title="آخرین رویدادها" bodyClassName="p-0">
            {data.recent.length ? (
              <ul className="max-h-[32rem] divide-y overflow-y-auto">
                {data.recent.map((r) => (
                  <li key={r.id} className="flex gap-2.5 px-4 py-2.5">
                    <Avatar person={r.user} size={24} />
                    <div className="min-w-0 flex-1 text-xs leading-6">
                      <b>{personName(r.user)}</b> <span className="muted">{recentText(r).slice(0, 120)}</span>
                      <Link href={`/tasks/${r.task.number}`} className="block truncate text-[11px] text-[var(--color-brand-600)] hover:underline">
                        #{formatNumber(r.task.number)} {r.task.title}
                      </Link>
                    </div>
                    <span className="shrink-0 text-[10px] muted">{faRelative(r.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-4 text-xs muted">هنوز رویدادی ثبت نشده است.</p>
            )}
          </Card>

          {data.employers.length > 1 ? (
            <Card title="کارفرماها" bodyClassName="px-4 py-3">
              <ul className="space-y-2">
                {data.employers.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 text-xs">
                    <Avatar person={e} size={22} /> {personName(e)}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] leading-5 muted">
                هر دو کارفرما کارهای منتظر تأیید و سؤال‌ها را می‌بینند و هر کدام می‌تواند پاسخ دهد یا تأیید کند.
              </p>
            </Card>
          ) : null}

          <Link href="/tasks/list" className="btn btn-secondary w-full">
            <ListChecks size={15} /> همه تسک‌ها
          </Link>
        </div>
      </div>
    </div>
  );
}
