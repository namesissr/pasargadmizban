'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { AlertTriangle, ArrowLeft, CheckCircle2, Hand, HelpCircle, Inbox, Pause, Play, Star, Timer, Undo2 } from 'lucide-react';
import { Alert, Button, Card, LoadingBlock, Stat } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiPatch, apiPost, errorMessage, fetcher } from '@/lib/client';
import { formatNumber } from '@/lib/money';
import { formatMinutes } from '@/lib/dev-tasks-shared';
import { useTaskMeta } from './filters';
import { TaskCard } from './task-list';
import { DueLabel, NecessityBadge, PriorityBadge, StatusBadge, TaskNumber, TypeTag } from './ui';
import type { TaskRow } from './types';

type DevHomeData = {
  running: { startedAt: string; task: { id: string; number: number; title: string } } | null;
  next: TaskRow | null;
  returned: TaskRow[];
  active: TaskRow[];
  waiting: TaskRow[];
  inReview: TaskRow[];
  pool: TaskRow[];
  stats: {
    open: number;
    overdue: number;
    doneWeek: number;
    minutesToday: number;
    minutesWeek: number;
    avgRating: number | null;
    ratedCount: number;
  };
};

const href = (n: number) => `/dev/tasks/${n}`;

function List({ title, icon, items, note }: { title: string; icon: React.ReactNode; items: TaskRow[]; note?: string }) {
  if (!items.length) return null;
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          {icon} {title} <span className="tabular rounded-full px-2 text-[11px] font-bold surface-2">{formatNumber(items.length)}</span>
        </span>
      }
      description={note}
      bodyClassName="p-3"
    >
      <ul className="space-y-2">
        {items.map((t) => (
          <TaskCard key={t.id} task={t} href={href(t.number)} />
        ))}
      </ul>
    </Card>
  );
}

export function DeveloperHome() {
  const { data, mutate } = useSWR<DevHomeData>('/api/tasks/home', fetcher, { refreshInterval: 30_000 });
  const { data: meta } = useTaskMeta();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  if (!data) return <LoadingBlock />;
  const s = data.stats;

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const next = data.next;
  const nextRunning = Boolean(next && data.running?.task.id === next.id);

  return (
    <div className="space-y-5">
      {data.running ? (
        <Alert
          tone="success"
          title={`زمان‌سنج روشن است: #${formatNumber(data.running.task.number)} ${data.running.task.title}`}
          action={
            <Button
              size="sm"
              variant="danger"
              icon={<Pause size={14} />}
              loading={busy === 'stop'}
              onClick={() =>
                run('stop', () => apiPost(`/api/tasks/${data.running!.task.id}/timer`, { action: 'stop' }), 'کارکرد ثبت شد.')
              }
            >
              توقف
            </Button>
          }
        >
          از {new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(new Date(data.running.startedAt))} —{' '}
          <Link href={href(data.running.task.number)} className="font-semibold underline">
            رفتن به تسک
          </Link>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="کارهای باز من" value={formatNumber(s.open)} icon={<Inbox size={16} />} />
        <Stat label="مهلت گذشته" value={formatNumber(s.overdue)} tone={s.overdue ? 'bad' : 'ok'} icon={<AlertTriangle size={16} />} />
        <Stat label="تأییدشده این هفته" value={formatNumber(s.doneWeek)} tone="ok" icon={<CheckCircle2 size={16} />} />
        <Stat label="کارکرد امروز" value={formatMinutes(s.minutesToday)} icon={<Timer size={16} />} />
        <Stat label="کارکرد ۷ روز" value={formatMinutes(s.minutesWeek)} />
        <Stat
          label="میانگین امتیاز کیفیت"
          value={s.avgRating ? `${formatNumber(s.avgRating, 1)} از ۵` : '—'}
          hint={s.ratedCount ? `${formatNumber(s.ratedCount)} کار امتیازدار در ۹۰ روز` : undefined}
          icon={<Star size={16} />}
        />
      </div>

      {next ? (
        <div className="card overflow-hidden border-[var(--color-brand-500)]">
          <div className="flex items-center gap-2 border-b bg-[color-mix(in_srgb,var(--color-brand-500)_10%,transparent)] px-4 py-2 text-xs font-bold text-[var(--color-brand-600)]">
            <ArrowLeft size={14} /> کار بعدی شما
          </div>
          <div className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <TaskNumber number={next.number} />
              <TypeTag type={next.type} />
              <StatusBadge status={next.status} />
              <PriorityBadge priority={next.priority} />
              <NecessityBadge necessity={next.necessity} />
              <DueLabel dueAt={next.dueAt} />
            </div>
            <h2 className="mt-2 text-base font-extrabold leading-7">{next.title}</h2>
            {next.reopenCount ? (
              <p className="mt-1 text-xs font-semibold text-red-600">برای اصلاح برگشت خورده — توضیح کارفرما در تاریخچه تسک است.</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={href(next.number)} className="btn btn-secondary btn-sm">
                باز کردن تسک
              </Link>
              {next.status === 'TODO' ? (
                <Button
                  size="sm"
                  icon={<Play size={14} />}
                  loading={busy === 'begin'}
                  onClick={() =>
                    run(
                      'begin',
                      // روشن کردن زمان‌سنج روی کار در صف، خودش کار را «در حال انجام» می‌کند
                      () => apiPost(`/api/tasks/${next.id}/timer`, { action: 'start' }),
                      'کار شروع شد و زمان‌سنج روشن شد.',
                    )
                  }
                >
                  شروع کار و زمان‌سنج
                </Button>
              ) : !nextRunning ? (
                <Button
                  size="sm"
                  icon={<Play size={14} />}
                  loading={busy === 'timer'}
                  onClick={() => run('timer', () => apiPost(`/api/tasks/${next.id}/timer`, { action: 'start' }), 'زمان‌سنج روشن شد.')}
                >
                  شروع زمان‌سنج
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : !s.open ? (
        <Alert tone="info" title="فعلاً کار بازی به شما سپرده نشده است">
          {data.pool.length ? 'از «تسک‌های آزاد» پایین همین صفحه یکی را بردارید.' : 'به محض اینکه کارفرما تسکی به شما بسپارد، اینجا و در تلگرام باخبر می‌شوید.'}
        </Alert>
      ) : null}

      <List
        title="برگشت داده شده برای اصلاح"
        icon={<Undo2 size={15} className="text-red-500" />}
        items={data.returned.filter((t) => t.id !== next?.id)}
        note="این کارها را کارفرما بررسی کرده و ایراد گرفته؛ معمولاً مقدم بر کار تازه‌اند."
      />
      <List
        title="در جریان و در صف"
        icon={<Play size={15} />}
        items={data.active.filter((t) => t.id !== next?.id && !data.returned.some((r) => r.id === t.id))}
      />
      <List
        title="منتظر پاسخ کارفرما"
        icon={<HelpCircle size={15} className="text-red-500" />}
        items={data.waiting}
        note="کارفرماها هر روز یادآوری می‌گیرند. اگر پاسخ آمد، «ادامه کار» را بزنید."
      />
      <List title="منتظر تأیید کارفرما" icon={<CheckCircle2 size={15} className="text-amber-500" />} items={data.inReview} />

      {data.pool.length ? (
        <Card
          title={
            <span className="flex items-center gap-2">
              <Hand size={15} /> تسک‌های آزاد
              <span className="tabular rounded-full px-2 text-[11px] font-bold surface-2">{formatNumber(data.pool.length)}</span>
            </span>
          }
          description="کارهایی که هنوز مسئول ندارند. اگر وقت دارید، یکی را بردارید."
          bodyClassName="p-3"
        >
          <ul className="space-y-2">
            {data.pool.map((t) => (
              <li key={t.id} className="card flex flex-wrap items-center gap-3 p-3">
                <Link href={href(t.number)} className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <TaskNumber number={t.number} className="text-xs" />
                    <PriorityBadge priority={t.priority} short />
                    <NecessityBadge necessity={t.necessity} short />
                    <DueLabel dueAt={t.dueAt} />
                  </div>
                  <div className="mt-1 text-sm font-semibold hover:text-[var(--color-brand-600)]">{t.title}</div>
                </Link>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Hand size={14} />}
                  loading={busy === `take-${t.id}`}
                  onClick={() => run(`take-${t.id}`, () => apiPatch(`/api/tasks/${t.id}`, { assigneeId: meta?.me.id }), 'تسک به شما سپرده شد.')}
                >
                  برداشتن
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
