'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { AlertTriangle, CheckCircle2, Clock, Flame, Inbox, Timer, Undo2, UserX } from 'lucide-react';
import { Card, LoadingBlock, Stat } from '@/components/ui';
import { fetcher } from '@/lib/client';
import { formatNumber } from '@/lib/money';
import { faDate } from '@/lib/utils';
import {
  TASK_NECESSITY_FA,
  TASK_PRIORITY_FA,
  TASK_TYPE_FA,
  type TaskNecessity,
  type TaskType,
} from '@/lib/dev-tasks-shared';

type Stats = {
  totals: {
    open: number;
    overdue: number;
    review: number;
    blocked: number;
    unassigned: number;
    hot: number;
    created30: number;
    done30: number;
  };
  avgCycleHours: number | null;
  avgReviewHours: number | null;
  onTimeRate: number | null;
  reopenRate: number | null;
  openByPriority: Record<string, number>;
  openByNecessity: Record<string, number>;
  openByType: Record<string, number>;
  openByArea: Record<string, number>;
  weeks: { start: string; created: number; done: number }[];
  people: { id: string; name: string; role: string; open: number; inProgress: number; review: number; overdue: number; done30: number }[];
};

function hours(h: number | null): string {
  if (h === null) return '—';
  if (h < 24) return `${formatNumber(h, 1)} ساعت`;
  return `${formatNumber(h / 24, 1)} روز`;
}

function pct(v: number | null): string {
  return v === null ? '—' : `${formatNumber(v * 100)}٪`;
}

function Bars({ data, labels, colors }: { data: Record<string, number>; labels?: Record<string, string>; colors?: Record<string, string> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (!entries.length) return <p className="py-6 text-center text-xs muted">کار بازی وجود ندارد.</p>;
  return (
    <ul className="space-y-2.5">
      {entries.map(([k, v]) => (
        <li key={k} className="text-xs">
          <div className="mb-1 flex justify-between">
            <span>{labels?.[k] ?? k}</span>
            <span className="tabular font-bold">{formatNumber(v)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full surface-2">
            <div className="h-full rounded-full" style={{ width: `${(v / max) * 100}%`, background: colors?.[k] ?? 'var(--color-brand-600)' }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function TaskReports() {
  const { data } = useSWR<Stats>('/api/tasks/stats', fetcher, { refreshInterval: 60_000 });
  if (!data) return <LoadingBlock />;
  const t = data.totals;
  const maxWeek = Math.max(1, ...data.weeks.flatMap((w) => [w.created, w.done]));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link href="/tasks/list">
          <Stat label="کارهای باز" value={formatNumber(t.open)} icon={<Inbox size={16} />} />
        </Link>
        <Link href="/tasks/list?view=overdue">
          <Stat label="مهلت گذشته" value={formatNumber(t.overdue)} tone={t.overdue ? 'bad' : 'ok'} icon={<AlertTriangle size={16} />} />
        </Link>
        <Link href="/tasks/list?view=all&status=REVIEW">
          <Stat label="منتظر تأیید" value={formatNumber(t.review)} tone={t.review ? 'warn' : undefined} icon={<CheckCircle2 size={16} />} />
        </Link>
        <Link href="/tasks/list?view=all&status=BLOCKED">
          <Stat label="نیاز به اطلاعات" value={formatNumber(t.blocked)} tone={t.blocked ? 'bad' : undefined} icon={<Clock size={16} />} />
        </Link>
        <Stat label="فوری یا حیاتی (باز)" value={formatNumber(t.hot)} tone={t.hot ? 'bad' : undefined} icon={<Flame size={16} />} />
        <Link href="/tasks/list?assignee=none">
          <Stat label="بدون مسئول" value={formatNumber(t.unassigned)} tone={t.unassigned ? 'warn' : undefined} icon={<UserX size={16} />} />
        </Link>
        <Stat label="ثبت‌شده در ۳۰ روز" value={formatNumber(t.created30)} />
        <Stat label="تأییدشده در ۳۰ روز" value={formatNumber(t.done30)} tone="ok" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="میانگین ثبت تا تأیید" value={hours(data.avgCycleHours)} hint="۹۰ روز اخیر" icon={<Timer size={16} />} />
        <Stat label="میانگین انتظار برای تأیید مدیر" value={hours(data.avgReviewHours)} hint="از اعلام «انجام شد» تا تأیید" icon={<Clock size={16} />} />
        <Stat label="انجام در مهلت" value={pct(data.onTimeRate)} hint="از کارهای مهلت‌دار تأییدشده" tone={data.onTimeRate !== null && data.onTimeRate < 0.7 ? 'warn' : 'ok'} />
        <Stat label="نرخ برگشت برای اصلاح" value={pct(data.reopenRate)} hint="کارهایی که حداقل یک بار برگشت خوردند" icon={<Undo2 size={16} />} tone={data.reopenRate !== null && data.reopenRate > 0.3 ? 'warn' : undefined} />
      </div>

      <Card title="روند هشت هفته اخیر" description="ستون آبی: تسک‌های ثبت‌شده — ستون سبز: تسک‌های تأییدشده">
        <div className="flex h-44 items-end gap-2 sm:gap-4">
          {data.weeks.map((w) => (
            <div key={w.start} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-36 w-full items-end justify-center gap-1">
                <div className="w-1/2 max-w-6 rounded-t bg-sky-500" style={{ height: `${(w.created / maxWeek) * 100}%` }} title={`ثبت: ${formatNumber(w.created)}`} />
                <div className="w-1/2 max-w-6 rounded-t bg-emerald-500" style={{ height: `${(w.done / maxWeek) * 100}%` }} title={`تأیید: ${formatNumber(w.done)}`} />
              </div>
              <span className="text-[9px] muted">{faDate(w.start).slice(5)}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="وضعیت هر نفر" bodyClassName="p-0">
        <div className="scroll-x">
          <table className="table table-cards">
            <thead>
              <tr>
                <th>نام</th>
                <th>کار باز</th>
                <th>در حال انجام</th>
                <th>منتظر تأیید</th>
                <th>مهلت گذشته</th>
                <th>تأییدشده (۳۰ روز)</th>
              </tr>
            </thead>
            <tbody>
              {data.people.map((p) => (
                <tr key={p.id}>
                  <td data-label="نام" className="text-xs font-semibold">
                    <Link href={`/tasks/list?view=all&assignee=${p.id}`} className="hover:text-[var(--color-brand-600)]">
                      {p.name}
                    </Link>
                    <span className="mr-1 text-[10px] font-normal muted">{p.role === 'DEVELOPER' ? 'برنامه‌نویس' : 'کارفرما'}</span>
                  </td>
                  <td data-label="کار باز" className="tabular text-xs">{formatNumber(p.open)}</td>
                  <td data-label="در حال انجام" className="tabular text-xs">{formatNumber(p.inProgress)}</td>
                  <td data-label="منتظر تأیید" className="tabular text-xs">{formatNumber(p.review)}</td>
                  <td data-label="مهلت گذشته" className={`tabular text-xs ${p.overdue ? 'font-bold text-red-600' : ''}`}>{formatNumber(p.overdue)}</td>
                  <td data-label="تأییدشده" className="tabular text-xs text-emerald-600">{formatNumber(p.done30)}</td>
                </tr>
              ))}
              {!data.people.length ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs muted">
                    هنوز برنامه‌نویسی تعریف نشده است.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="کارهای باز بر اساس اولویت">
          <Bars
            data={data.openByPriority}
            labels={Object.fromEntries(Object.entries(TASK_PRIORITY_FA).map(([k, v]) => [k, v.label]))}
            colors={Object.fromEntries(Object.entries(TASK_PRIORITY_FA).map(([k, v]) => [k, v.color]))}
          />
        </Card>
        <Card title="کارهای باز بر اساس ضرورت">
          <Bars data={data.openByNecessity} labels={Object.fromEntries((Object.keys(TASK_NECESSITY_FA) as TaskNecessity[]).map((k) => [k, TASK_NECESSITY_FA[k].label]))} />
        </Card>
        <Card title="کارهای باز بر اساس نوع">
          <Bars data={data.openByType} labels={Object.fromEntries((Object.keys(TASK_TYPE_FA) as TaskType[]).map((k) => [k, `${TASK_TYPE_FA[k].emoji} ${TASK_TYPE_FA[k].label}`]))} />
        </Card>
        <Card title="کارهای باز بر اساس بخش سایت">
          <Bars data={data.openByArea} labels={{ '—': 'بدون بخش' }} />
        </Card>
      </div>
    </div>
  );
}
