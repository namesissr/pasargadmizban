'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { CheckSquare, Download, MessageSquare, Paperclip, RotateCcw, ClipboardList, Star, Timer } from 'lucide-react';
import { Card, EmptyState, LoadingBlock, Pagination, Select } from '@/components/ui';
import { fetcher } from '@/lib/client';
import { formatNumber } from '@/lib/money';
import { cn, faRelative } from '@/lib/utils';
import { TASK_PRIORITY_FA, formatMinutes, type TaskPriority } from '@/lib/dev-tasks-shared';
import { FilterBar, toQuery, useUrlFilters, type Filters } from './filters';
import { usePanel } from './panel';
import { Avatar, DueLabel, NecessityBadge, PriorityBadge, StatusBadge, TaskNumber, TypeTag } from './ui';
import { personName, type TaskListResponse, type TaskRow } from './types';

type ViewChip = { id: string; label: string; set: Filters; count?: (d: TaskListResponse) => number | undefined };

const SORTS = [
  { id: 'smart', label: 'ترتیب هوشمند (اهمیت + مهلت)' },
  { id: 'updated', label: 'آخرین فعالیت' },
  { id: 'newest', label: 'جدیدترین' },
  { id: 'oldest', label: 'قدیمی‌ترین' },
  { id: 'due', label: 'نزدیک‌ترین مهلت' },
  { id: 'number', label: 'شماره' },
];

export function TaskList() {
  const [filters, setFilters, reset] = useUrlFilters();
  const panel = usePanel();
  const dev = panel.kind === 'developer';
  // برنامه‌نویس به‌طور پیش‌فرض کارهای خودش را می‌بیند؛ کارفرما همه کارهای باز را
  const view = filters.view ?? (dev ? 'mine' : 'open');
  const query = toQuery(filters, { view, perPage: '30' });
  const { data, isLoading, mutate } = useSWR<TaskListResponse>(`/api/tasks?${query}`, fetcher, {
    refreshInterval: 30_000,
    keepPreviousData: true,
  });

  const sum = (d: TaskListResponse, keys: string[]) => keys.reduce((a, k) => a + (d.counts[k] ?? 0), 0);

  const devChips: ViewChip[] = [
    { id: 'mine', label: 'سپرده به من', set: { view: 'mine', status: '', assignee: '' }, count: (d) => d.mine },
    { id: 'free', label: 'تسک‌های آزاد (بی‌مسئول)', set: { view: 'open', status: '', assignee: 'none' } },
    { id: 'review', label: 'منتظر تأیید کارفرما', set: { view: 'all', status: 'REVIEW', assignee: 'me' } },
    { id: 'blocked', label: 'منتظر پاسخ کارفرما', set: { view: 'all', status: 'BLOCKED', assignee: 'me' } },
    { id: 'done', label: 'انجام‌شده‌های من', set: { view: 'closed', status: '', assignee: 'me' } },
    { id: 'open', label: 'همه کارهای باز تیم', set: { view: 'open', status: '', assignee: '' } },
  ];

  const employerChips: ViewChip[] = [
    {
      id: 'open',
      label: 'همه کارهای باز',
      set: { view: 'open', status: '' },
      count: (d) => sum(d, ['TODO', 'IN_PROGRESS', 'BLOCKED', 'REVIEW']),
    },
    { id: 'mine', label: 'سپرده به من', set: { view: 'mine', status: '' }, count: (d) => d.mine },
    {
      id: 'REVIEW',
      label: 'منتظر تأیید',
      set: { view: 'all', status: 'REVIEW' },
      count: (d) => d.counts.REVIEW ?? 0,
    },
    { id: 'BLOCKED', label: 'نیاز به اطلاعات', set: { view: 'all', status: 'BLOCKED' }, count: (d) => d.counts.BLOCKED ?? 0 },
    {
      id: 'IN_PROGRESS',
      label: 'در حال انجام',
      set: { view: 'all', status: 'IN_PROGRESS' },
      count: (d) => d.counts.IN_PROGRESS ?? 0,
    },
    { id: 'TODO', label: 'در صف', set: { view: 'all', status: 'TODO' }, count: (d) => d.counts.TODO ?? 0 },
    { id: 'overdue', label: 'مهلت گذشته', set: { view: 'overdue', status: '' }, count: (d) => d.overdue },
    { id: 'closed', label: 'بسته‌شده', set: { view: 'closed', status: '' }, count: (d) => sum(d, ['DONE', 'CANCELED']) },
    { id: 'reported', label: 'ثبت‌شده توسط من', set: { view: 'reported', status: '' } },
    { id: 'all', label: 'همه', set: { view: 'all', status: '' } },
    { id: 'archived', label: 'بایگانی', set: { view: 'archived', status: '' } },
  ];
  const chips = dev ? devChips : employerChips;
  const current: Filters = { ...filters, view };
  const isActiveChip = (c: ViewChip) => Object.entries(c.set).every(([k, v]) => (current[k as keyof Filters] ?? '') === v);

  return (
    <div className="space-y-4">
      <div className="scroll-x -mx-1 px-1">
        <div className="flex min-w-max gap-2 pb-1">
          {chips.map((c) => {
            const n = data && c.count ? c.count(data) : undefined;
            const alert = (!dev && c.id === 'REVIEW') || c.id === 'BLOCKED' || c.id === 'overdue';
            return (
              <button
                key={c.id}
                onClick={() => setFilters(c.set)}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition',
                  isActiveChip(c)
                    ? 'border-[var(--color-brand-500)] bg-[color-mix(in_srgb,var(--color-brand-500)_10%,transparent)] font-semibold'
                    : 'hover:bg-[var(--surface-2)]',
                )}
              >
                {c.label}
                {n !== undefined ? (
                  <span
                    className={cn(
                      'tabular rounded-full px-1.5 text-[11px] font-bold',
                      alert && n > 0 ? 'bg-red-500 text-white' : 'surface-2',
                    )}
                  >
                    {formatNumber(n)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <Card bodyClassName="p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <FilterBar filters={filters} onChange={setFilters} onReset={reset} />
          <div className="flex shrink-0 gap-2">
            <div className="sm:w-52">
              <Select
                value={filters.sort ?? 'smart'}
                onChange={(e) => setFilters({ sort: e.target.value === 'smart' ? '' : e.target.value })}
                className="text-xs"
              >
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
            <a
              href={`/api/tasks/export?${toQuery(filters, { view })}`}
              className="btn btn-secondary btn-sm shrink-0"
              title="خروجی اکسل (CSV) با همین فیلترها"
            >
              <Download size={14} /> خروجی
            </a>
          </div>
        </div>
      </Card>

      {isLoading && !data ? (
        <LoadingBlock />
      ) : !data?.items.length ? (
        <Card>
          <EmptyState
            icon={<ClipboardList size={34} />}
            title="تسکی با این شرایط پیدا نشد"
            description={
              dev && view === 'mine'
                ? 'فعلاً کار بازی به شما سپرده نشده است. «تسک‌های آزاد» را ببینید؛ شاید کاری منتظر برداشتن باشد.'
                : view === 'open' && !Object.values(filters).some(Boolean)
                  ? 'هنوز کار بازی ثبت نشده است. اولین تسک را ثبت کنید تا برنامه‌نویس باخبر شود.'
                  : 'فیلترها یا نمای دیگری را امتحان کنید.'
            }
            action={
              <Link href={panel.newTask} className="btn btn-primary">
                {dev ? 'گزارش باگ یا پیشنهاد' : 'ثبت تسک جدید'}
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between px-1 text-[11px] muted">
            <span>{formatNumber(data.meta.total)} تسک</span>
            <button onClick={() => mutate()} className="inline-flex items-center gap-1 hover:opacity-70">
              <RotateCcw size={12} /> تازه‌سازی
            </button>
          </div>
          <ul className="space-y-2">
            {data.items.map((t) => (
              <TaskCard key={t.id} task={t} href={panel.detail(t.number)} />
            ))}
          </ul>
          <Pagination
            page={data.meta.page}
            totalPages={data.meta.totalPages}
            onChange={(p) => setFilters({ page: p > 1 ? String(p) : '' })}
          />
        </>
      )}
    </div>
  );
}

export function TaskCard({ task: t, href }: { task: TaskRow; href: string }) {
  const closed = t.status === 'DONE' || t.status === 'CANCELED';
  return (
    <li>
      <Link
        href={href}
        className={cn(
          'card relative block overflow-hidden p-3.5 pr-5 transition hover:border-[var(--color-brand-500)] sm:p-4 sm:pr-6',
          closed && 'opacity-70',
        )}
      >
        <span
          className="absolute inset-y-0 right-0 w-1.5"
          style={{ background: TASK_PRIORITY_FA[t.priority as TaskPriority]?.color }}
          aria-hidden
        />
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <TaskNumber number={t.number} className="text-xs" />
              <TypeTag type={t.type} />
              {t.unread ? (
                <span className="rounded-full bg-[var(--color-brand-600)] px-1.5 py-px text-[10px] font-bold text-white">
                  به‌روزرسانی جدید
                </span>
              ) : null}
              {t.reopenCount > 0 ? (
                <span className="text-[10px] font-semibold text-red-500">{formatNumber(t.reopenCount)} بار برگشت خورده</span>
              ) : null}
            </div>
            <h3 className={cn('mt-1 text-sm leading-6', t.unread ? 'font-extrabold' : 'font-semibold')}>{t.title}</h3>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={t.status} />
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <PriorityBadge priority={t.priority} />
          <NecessityBadge necessity={t.necessity} />
          {t.area ? <span className="text-[11px] muted">📍 {t.area}</span> : null}
          {t.labels.map((l) => (
            <span key={l} className="rounded-md border px-1.5 py-px text-[10px] muted">
              {l}
            </span>
          ))}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-2.5 text-[11px] muted">
          <span className="inline-flex items-center gap-1.5">
            <Avatar person={t.assignee} size={20} />
            {t.assignee ? personName(t.assignee) : 'بدون مسئول'}
          </span>
          <DueLabel dueAt={t.dueAt} done={closed} />
          {t.checklistTotal ? (
            <span className={cn('inline-flex items-center gap-1', t.checklistDone === t.checklistTotal && 'text-emerald-600')}>
              <CheckSquare size={12} />
              {formatNumber(t.checklistDone)}/{formatNumber(t.checklistTotal)}
            </span>
          ) : null}
          {t.comments ? (
            <span className="inline-flex items-center gap-1">
              <MessageSquare size={12} /> {formatNumber(t.comments)}
            </span>
          ) : null}
          {t.attachments ? (
            <span className="inline-flex items-center gap-1">
              <Paperclip size={12} /> {formatNumber(t.attachments)}
            </span>
          ) : null}
          {t.spentMinutes ? (
            <span className="inline-flex items-center gap-1" title="کارکرد ثبت‌شده">
              <Timer size={12} /> {formatMinutes(t.spentMinutes)}
            </span>
          ) : null}
          {t.rating ? (
            <span className="inline-flex items-center gap-0.5 text-amber-500" title="امتیاز کیفیت">
              <Star size={12} fill="currentColor" /> {formatNumber(t.rating)}
            </span>
          ) : null}
          <span className="mr-auto">آخرین فعالیت {faRelative(t.activityAt)}</span>
        </div>
      </Link>
    </li>
  );
}
