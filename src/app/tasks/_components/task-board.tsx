'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { CheckSquare, MessageSquare, Paperclip } from 'lucide-react';
import { Alert, Button, Card, LoadingBlock, Modal, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiPost, errorMessage, fetcher } from '@/lib/client';
import { formatNumber } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  TASK_NECESSITY_FA,
  TASK_PRIORITY_FA,
  TASK_STATUS_COLOR,
  TASK_STATUS_FA,
  allowedTransitions,
  isTaskManager,
  transitionLabel,
  transitionNeedsComment,
  type TaskNecessity,
  type TaskPriority,
  type TaskStatus,
} from '@/lib/dev-tasks-shared';
import { FilterBar, toQuery, useTaskMeta, useUrlFilters } from './filters';
import { usePanel } from './panel';
import { Avatar, DueLabel, TaskNumber } from './ui';
import type { TaskListResponse, TaskRow } from './types';

const COLUMNS: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'DONE'];

type Pending = { task: TaskRow; to: TaskStatus };

export function TaskBoard() {
  const [filters, setFilters, reset] = useUrlFilters();
  const { data: meta } = useTaskMeta();
  const toast = useToast();
  const key = `/api/tasks?${toQuery(filters, { view: 'board', sort: 'manual' })}`;
  const { data, mutate, isLoading } = useSWR<TaskListResponse>(key, fetcher, { refreshInterval: 30_000 });

  const [dragId, setDragId] = useState<string | null>(null);
  // شناسه کارت در حال کشیدن بدون انتظار برای رندر — رویداد dragover ممکن است زودتر از رندر برسد
  const dragRef = useRef<string | null>(null);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);
  const [overCard, setOverCard] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const role = meta?.me.role;
  const meId = meta?.me.id;
  const isAdmin = isTaskManager(role);
  const panel = usePanel();
  const items = data?.items ?? [];
  const byStatus = (s: TaskStatus) => items.filter((t) => t.status === s);

  function canMove(task: TaskRow, to: TaskStatus) {
    if (role === 'DEVELOPER' && task.assignee && task.assignee.id !== meId) return false;
    return allowedTransitions(role, task.status as TaskStatus).includes(to);
  }

  async function move(task: TaskRow, to: TaskStatus, note?: string) {
    setSaving(true);
    // به‌روزرسانی خوش‌بینانه تا کارت بلافاصله جابه‌جا شود
    await mutate(
      async (current) => {
        await apiPost(`/api/tasks/${task.id}/status`, { status: to, comment: note });
        return current;
      },
      {
        optimisticData: (current) =>
          current ? { ...current, items: current.items.map((t) => (t.id === task.id ? { ...t, status: to } : t)) } : current!,
        rollbackOnError: true,
        revalidate: true,
      },
    ).then(
      () => toast.success(`#${formatNumber(task.number)} → ${TASK_STATUS_FA[to].label}`),
      (err) => toast.error(errorMessage(err)),
    );
    setSaving(false);
    setPending(null);
    setComment('');
  }

  async function reorder(column: TaskStatus, draggedId: string, beforeId: string | null) {
    const ids = byStatus(column)
      .map((t) => t.id)
      .filter((id) => id !== draggedId);
    const at = beforeId ? ids.indexOf(beforeId) : ids.length;
    ids.splice(at < 0 ? ids.length : at, 0, draggedId);
    const order = new Map(ids.map((id, i) => [id, i * 10]));
    await mutate(
      async (current) => {
        await apiPost('/api/tasks/reorder', { ids });
        return current;
      },
      {
        optimisticData: (current) =>
          current
            ? {
                ...current,
                items: [...current.items]
                  .map((t) => (order.has(t.id) ? { ...t, sortOrder: order.get(t.id)! } : t))
                  .sort((a, b) => a.sortOrder - b.sortOrder),
              }
            : current!,
        rollbackOnError: true,
        revalidate: true,
      },
    ).catch((err) => toast.error(errorMessage(err)));
  }

  function canDrop(column: TaskStatus) {
    const t = items.find((x) => x.id === dragRef.current);
    return t ? t.status === column || canMove(t, column) : false;
  }

  function onDrop(column: TaskStatus) {
    const task = items.find((t) => t.id === dragRef.current);
    const before = overCard;
    dragRef.current = null;
    setDragId(null);
    setOverCol(null);
    setOverCard(null);
    if (!task) return;

    if (task.status === column) {
      if (isAdmin) void reorder(column, task.id, before && before !== task.id ? before : null);
      return;
    }
    if (!canMove(task, column)) {
      toast.error(`انتقال از «${TASK_STATUS_FA[task.status as TaskStatus].label}» به «${TASK_STATUS_FA[column].label}» برای شما مجاز نیست.`);
      return;
    }
    if (transitionNeedsComment(task.status as TaskStatus, column) || column === 'REVIEW') {
      setPending({ task, to: column });
      return;
    }
    void move(task, column);
  }

  return (
    <div className="space-y-4">
      <Card bodyClassName="p-3 sm:p-4">
        <FilterBar filters={filters} onChange={setFilters} onReset={reset} />
      </Card>

      <p className="px-1 text-[11px] leading-6 muted">
        کارت‌ها را بین ستون‌ها بکشید تا وضعیت عوض شود{isAdmin ? '؛ جابه‌جایی داخل یک ستون، ترتیب اولویت اجرا را مشخص می‌کند' : ''}. ستون «تأیید شده» فقط دو
        هفته اخیر را نشان می‌دهد. روی گوشی، با لمس کارت وارد صفحه آن شوید.
      </p>

      {isLoading && !data ? (
        <LoadingBlock />
      ) : (
        <div className="scroll-x -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="grid min-w-max auto-cols-[17rem] grid-flow-col gap-3 pb-2 xl:min-w-0 xl:auto-cols-fr">
            {COLUMNS.map((col) => {
              const list = byStatus(col);
              const droppable = dragId ? canDrop(col) : false;
              return (
                <section
                  key={col}
                  onDragOver={(e) => {
                    if (!canDrop(col)) return;
                    e.preventDefault();
                    setOverCol(col);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    onDrop(col);
                  }}
                  className={cn(
                    'flex max-h-[calc(100vh-15rem)] min-h-64 flex-col rounded-2xl border surface-2 transition',
                    dragId && !droppable && 'opacity-50',
                    overCol === col && 'border-[var(--color-brand-500)] ring-2 ring-[color-mix(in_srgb,var(--color-brand-500)_25%,transparent)]',
                  )}
                >
                  <header className="flex items-center gap-2 border-b px-3 py-2.5" style={{ borderTop: `3px solid ${TASK_STATUS_COLOR[col]}`, borderRadius: '1rem 1rem 0 0' }}>
                    <span className="text-xs font-bold">{TASK_STATUS_FA[col].label}</span>
                    <span className="tabular rounded-full bg-[var(--surface)] px-1.5 text-[11px] font-bold muted">{formatNumber(list.length)}</span>
                  </header>
                  <div className="flex-1 space-y-2 overflow-y-auto p-2">
                    {list.map((t) => (
                      <BoardCard
                        key={t.id}
                        task={t}
                        href={panel.detail(t.number)}
                        dragging={dragId === t.id}
                        dropBefore={overCard === t.id && dragId !== t.id}
                        onDragStart={() => {
                          dragRef.current = t.id;
                          setDragId(t.id);
                        }}
                        onDragEnd={() => {
                          dragRef.current = null;
                          setDragId(null);
                          setOverCol(null);
                          setOverCard(null);
                        }}
                        onDragOverCard={() => setOverCard(t.id)}
                      />
                    ))}
                    {!list.length ? <p className="py-8 text-center text-[11px] muted">خالی</p> : null}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      <Modal
        open={Boolean(pending)}
        onClose={() => {
          setPending(null);
          setComment('');
        }}
        title={pending ? `${transitionLabel(pending.task.status as TaskStatus, pending.to)} — #${formatNumber(pending.task.number)}` : ''}
        description={pending?.task.title}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)} disabled={saving}>
              انصراف
            </Button>
            <Button
              loading={saving}
              disabled={Boolean(pending && transitionNeedsComment(pending.task.status as TaskStatus, pending.to) && !comment.trim())}
              onClick={() => pending && move(pending.task, pending.to, comment.trim() || undefined)}
            >
              ثبت
            </Button>
          </>
        }
      >
        {pending && pending.to === 'REVIEW' && pending.task.checklistTotal > pending.task.checklistDone ? (
          <div className="mb-3">
            <Alert tone="warning">
              {formatNumber(pending.task.checklistTotal - pending.task.checklistDone)} مورد از چک‌لیست هنوز تیک نخورده است.
            </Alert>
          </div>
        ) : null}
        <label className="label">
          توضیح{' '}
          {pending && transitionNeedsComment(pending.task.status as TaskStatus, pending.to) ? (
            <span className="text-red-500">*</span>
          ) : (
            <span className="font-normal muted">(اختیاری)</span>
          )}
        </label>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          autoFocus
          placeholder={
            pending?.to === 'BLOCKED'
              ? 'برای ادامه کار چه اطلاعات یا تصمیمی لازم است؟'
              : pending?.to === 'REVIEW'
                ? 'چه کاری انجام شد و چطور می‌شود تست کرد؟'
                : 'چه چیزی باید اصلاح شود؟'
          }
        />
      </Modal>
    </div>
  );
}

function BoardCard({
  task: t,
  href,
  dragging,
  dropBefore,
  onDragStart,
  onDragEnd,
  onDragOverCard,
}: {
  task: TaskRow;
  href: string;
  dragging: boolean;
  dropBefore: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverCard: () => void;
}) {
  const hot = t.priority === 'URGENT' || t.necessity === 'CRITICAL';
  return (
    <Link
      href={href}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', t.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOverCard}
      className={cn(
        'card relative block cursor-grab overflow-hidden p-3 pr-4 text-right shadow-sm transition hover:border-[var(--color-brand-500)] active:cursor-grabbing',
        dragging && 'opacity-40',
        dropBefore && 'border-t-4 border-t-[var(--color-brand-500)]',
        hot && 'ring-1 ring-red-500/40',
      )}
    >
      <span className="absolute inset-y-0 right-0 w-1" style={{ background: TASK_PRIORITY_FA[t.priority as TaskPriority]?.color }} aria-hidden />
      <div className="flex items-center gap-1.5 text-[11px]">
        <TaskNumber number={t.number} />
        {t.unread ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-600)]" title="به‌روزرسانی جدید" /> : null}
        <span className="flex-1" />
        <span className="font-semibold" style={{ color: TASK_PRIORITY_FA[t.priority as TaskPriority]?.color }}>
          {TASK_PRIORITY_FA[t.priority as TaskPriority]?.label}
        </span>
        {t.necessity === 'ESSENTIAL' || t.necessity === 'CRITICAL' ? (
          <span className={cn('rounded px-1 text-[10px] font-bold', t.necessity === 'CRITICAL' ? 'bg-red-500 text-white' : 'bg-amber-500/15 text-amber-700')}>
            {TASK_NECESSITY_FA[t.necessity as TaskNecessity].label}
          </span>
        ) : null}
      </div>
      <p className={cn('mt-1.5 text-[13px] leading-6', t.unread ? 'font-bold' : 'font-medium')}>{t.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] muted">
        <Avatar person={t.assignee} size={18} />
        <DueLabel dueAt={t.dueAt} done={t.status === 'DONE'} className="text-[10px]" />
        {t.checklistTotal ? (
          <span className="inline-flex items-center gap-0.5">
            <CheckSquare size={11} />
            {formatNumber(t.checklistDone)}/{formatNumber(t.checklistTotal)}
          </span>
        ) : null}
        {t.comments ? (
          <span className="inline-flex items-center gap-0.5">
            <MessageSquare size={11} /> {formatNumber(t.comments)}
          </span>
        ) : null}
        {t.attachments ? (
          <span className="inline-flex items-center gap-0.5">
            <Paperclip size={11} /> {formatNumber(t.attachments)}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
