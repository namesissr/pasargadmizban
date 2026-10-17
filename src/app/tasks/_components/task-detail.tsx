'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import {
  Bell,
  BellOff,
  Star,
  Archive,
  ArchiveRestore,
  ArrowRightLeft,
  CheckCircle2,
  CheckSquare,
  Clock,
  ExternalLink,
  Hand,
  History,
  ListPlus,
  MessageSquare,
  Paperclip,
  Pencil,
  PlayCircle,
  Send,
  Square,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  ConfirmModal,
  CopyButton,
  Input,
  LoadingBlock,
  Modal,
  NumberInput,
  Select,
  Textarea,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiDelete, apiPatch, apiPost, errorMessage, fetcher } from '@/lib/client';
import { formatNumber } from '@/lib/money';
import { cn, faDateLong, faDateTime, faRelative } from '@/lib/utils';
import {
  TASK_NECESSITY_FA,
  TASK_PRIORITY_FA,
  TASK_STATUS_FA,
  TASK_TYPE_FA,
  TASK_ROLE_FA,
  isOverdue,
  transitionLabel,
  transitionNeedsComment,
  type TaskNecessity,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from '@/lib/dev-tasks-shared';
import { TaskForm } from './task-form';
import { useTaskMeta } from './filters';
import { usePanel } from './panel';
import { TimeTracker } from './time-tracker';
import { AttachmentGrid, checkFiles, FileDrop, filesFromClipboard, PendingFiles, uploadFiles } from './files';
import {
  Avatar,
  DueLabel,
  NecessityBadge,
  PriorityBadge,
  ProgressBar,
  RichText,
  StatusBadge,
  TaskNumber,
  TypeTag,
} from './ui';
import { personName, type Activity, type Attachment, type Person, type TaskDetailResponse } from './types';

/** گذارهای اصلی هر وضعیت که به‌صورت دکمه برجسته نشان داده می‌شوند؛ بقیه در فهرست کشویی */
const PRIMARY: Record<TaskStatus, TaskStatus[]> = {
  TODO: ['IN_PROGRESS'],
  IN_PROGRESS: ['REVIEW', 'BLOCKED'],
  BLOCKED: ['IN_PROGRESS'],
  REVIEW: ['DONE', 'IN_PROGRESS'],
  DONE: ['TODO'],
  CANCELED: ['TODO'],
};

/** گذارهایی که بدون پنجره توضیح، فوراً انجام می‌شوند */
const INSTANT = (from: TaskStatus, to: TaskStatus) => to === 'IN_PROGRESS' && (from === 'TODO' || from === 'BLOCKED');

export function TaskDetailView({ number }: { number: number }) {
  const key = `/api/tasks/${number}`;
  const { data, error, mutate } = useSWR<TaskDetailResponse>(key, fetcher, { refreshInterval: 20_000 });
  const { data: meta } = useTaskMeta();
  const toast = useToast();
  const router = useRouter();
  const panel = usePanel();

  const [editing, setEditing] = useState(false);
  const [transition, setTransition] = useState<TaskStatus | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  if (error) {
    return (
      <Alert tone="error" title="بارگذاری تسک ناموفق بود">
        {errorMessage(error)}
      </Alert>
    );
  }
  if (!data) return <LoadingBlock />;

  const { task, permissions, lastSeenAt } = data;
  const status = task.status as TaskStatus;
  const meId = meta?.me.id;
  const overdue = isOverdue(task);

  async function changeStatus(to: TaskStatus, comment?: string, rating?: number) {
    setBusy(`status-${to}`);
    try {
      await apiPost(`/api/tasks/${task.id}/status`, { status: to, comment, rating });
      toast.success(`وضعیت به «${TASK_STATUS_FA[to].label}» تغییر کرد.`);
      setTransition(null);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  function startTransition(to: TaskStatus) {
    if (INSTANT(status, to)) void changeStatus(to);
    else setTransition(to);
  }

  async function patch(body: Record<string, unknown>, success = 'ذخیره شد.') {
    setBusy('patch');
    try {
      await apiPatch(`/api/tasks/${task.id}`, body);
      toast.success(success);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function toggleWatch() {
    setBusy('watch');
    try {
      await apiPost(`/api/tasks/${task.id}/watch`, { watch: !data!.watching });
      toast.success(data!.watching ? 'دیگر این تسک را دنبال نمی‌کنید.' : 'از همه تغییرات این تسک باخبر می‌شوید.');
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy('delete');
    try {
      await apiDelete(`/api/tasks/${task.id}`);
      toast.success('تسک حذف شد.');
      router.push(panel.list);
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(null);
    }
  }

  if (editing) {
    return (
      <div className="space-y-4">
        <Header task={task} />
        <TaskForm
          task={task}
          permissions={permissions}
          onCancel={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await mutate();
          }}
        />
      </div>
    );
  }

  const allowed = permissions.transitions as TaskStatus[];
  const primary = PRIMARY[status].filter((s) => allowed.includes(s));
  const secondary = allowed.filter((s) => !primary.includes(s));
  const lastStatus = [...task.activities].reverse().find((a) => a.kind === 'STATUS' && (a.meta as { to?: string }).to === status);
  const uncheckedItems = task.checklist.filter((c) => !c.done).length;

  return (
    <div className="space-y-4">
      <Header task={task} />

      {/* ── نوار عملیات ── */}
      <div className="flex flex-wrap items-center gap-2">
        {primary.map((to) => (
          <Button
            key={to}
            variant={to === 'BLOCKED' || (status === 'REVIEW' && to === 'IN_PROGRESS') ? 'secondary' : 'primary'}
            size="sm"
            loading={busy === `status-${to}`}
            onClick={() => startTransition(to)}
            icon={<TransitionIcon to={to} from={status} />}
          >
            {transitionLabel(status, to)}
          </Button>
        ))}
        {secondary.length ? (
          <Select
            value=""
            onChange={(e) => e.target.value && startTransition(e.target.value as TaskStatus)}
            // کلاس input عرض کامل می‌دهد؛ این فهرست باید هم‌اندازه متنش بماند
            style={{ width: 'auto' }}
            className="py-1.5 text-xs"
            aria-label="سایر تغییرات وضعیت"
          >
            <option value="">سایر تغییرات وضعیت…</option>
            {secondary.map((s) => (
              <option key={s} value={s}>
                {transitionLabel(status, s)}
              </option>
            ))}
          </Select>
        ) : null}
        <div className="flex-1" />
        {permissions.editContent || permissions.manage ? (
          <Button variant="secondary" size="sm" icon={<Pencil size={14} />} onClick={() => setEditing(true)}>
            ویرایش
          </Button>
        ) : null}
        {permissions.manage ? (
          <Button
            variant="ghost"
            size="sm"
            loading={busy === 'patch'}
            icon={task.archivedAt ? <ArchiveRestore size={14} /> : <Archive size={14} />}
            onClick={() => patch({ archived: !task.archivedAt }, task.archivedAt ? 'از بایگانی خارج شد.' : 'بایگانی شد.')}
          >
            {task.archivedAt ? 'خروج از بایگانی' : 'بایگانی'}
          </Button>
        ) : null}
        {permissions.manage ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 size={14} />}
            onClick={() => setConfirmDelete(true)}
            className="hover:text-red-500"
          >
            حذف
          </Button>
        ) : null}
        <Button
          variant={data.watching ? 'secondary' : 'ghost'}
          size="sm"
          loading={busy === 'watch'}
          icon={data.watching ? <BellOff size={14} /> : <Bell size={14} />}
          onClick={toggleWatch}
          title="دنبال‌کننده‌ها از همه تغییرات این تسک باخبر می‌شوند"
        >
          {data.watching ? 'دنبال می‌کنید' : 'دنبال کردن'}
        </Button>
        <CopyButton
          // پیوند کوتاه: هر نفر را به صفحه تسک در پنل خودش می‌برد
          value={typeof window !== 'undefined' ? `${window.location.origin}/t/${task.number}` : `/t/${task.number}`}
          label="کپی لینک"
          className="px-2 py-1.5"
        />
      </div>

      {/* ── پیام‌های راهنما بر اساس وضعیت ── */}
      {task.archivedAt ? (
        <Alert tone="info" title="این تسک بایگانی شده است">
          در فهرست‌ها و یادآوری‌ها دیده نمی‌شود.
        </Alert>
      ) : null}

      {permissions.take ? (
        <Alert
          tone="info"
          title="این تسک هنوز مسئولی ندارد"
          action={
            <Button
              size="sm"
              icon={<Hand size={14} />}
              loading={busy === 'patch'}
              onClick={() => patch({ assigneeId: meId }, 'تسک به شما سپرده شد.')}
            >
              برداشتن این تسک
            </Button>
          }
        >
          اگر انجامش با شماست، آن را بردارید تا کارفرما بداند چه کسی پیگیر است.
        </Alert>
      ) : null}

      {status === 'REVIEW' ? (
        <Alert
          tone={permissions.manage ? 'warning' : 'info'}
          title={
            permissions.manage
              ? 'برنامه‌نویس اعلام کرده این کار انجام شده — لطفاً بررسی کنید'
              : 'انجام شد؛ منتظر بررسی و تأیید کارفرما'
          }
        >
          {lastStatus?.body ? <RichText text={lastStatus.body} className="text-xs" /> : null}
          {permissions.manage ? (
            <p className="mt-1">
              اگر درست است «تأیید و بستن» را بزنید؛ اگر ایرادی دارد «برگرداندن برای اصلاح» را بزنید و مشکل را بنویسید.
            </p>
          ) : null}
        </Alert>
      ) : null}

      {status === 'BLOCKED' ? (
        <Alert
          tone="error"
          title="کار متوقف است — نیاز به اطلاعات یا تصمیم"
          action={
            permissions.manage ? (
              <Button size="sm" variant="secondary" onClick={() => commentRef.current?.focus()}>
                نوشتن پاسخ
              </Button>
            ) : null
          }
        >
          {lastStatus?.body ? <RichText text={lastStatus.body} className="text-xs" /> : null}
        </Alert>
      ) : null}

      {overdue ? (
        <Alert tone="error" title="مهلت این تسک گذشته است">
          مهلت {faDateLong(task.dueAt)} بوده است.{' '}
          {permissions.manage ? 'در صورت نیاز مهلت را تمدید کنید.' : 'لطفاً وضعیت را به‌روز کنید یا با کارفرما هماهنگ کنید.'}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Card title="شرح کار">
            <RichText text={task.description} />
            {task.pageUrl ? (
              <a
                href={task.pageUrl.startsWith('http') ? task.pageUrl : `https://${task.pageUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex max-w-full items-center gap-1.5 rounded-lg border px-3 py-2 text-xs hover:bg-[var(--surface-2)]"
              >
                <ExternalLink size={13} className="shrink-0" />
                <span className="ltr truncate">{task.pageUrl}</span>
              </a>
            ) : null}
          </Card>

          <Checklist data={data} onChange={() => mutate()} />

          <Attachments data={data} meId={meId} onChange={() => mutate()} />

          <Timeline data={data} meId={meId} lastSeenAt={lastSeenAt} onChange={() => mutate()} commentRef={commentRef} />
        </div>

        <div className="space-y-4">
          <TimeTracker data={data} meId={meId} onChange={() => mutate()} />
          <Sidebar data={data} busy={busy === 'patch'} onPatch={patch} />
        </div>
      </div>

      <TransitionModal
        open={Boolean(transition)}
        from={status}
        to={transition}
        unchecked={uncheckedItems}
        loading={Boolean(busy?.startsWith('status-'))}
        onClose={() => setTransition(null)}
        canRate={permissions.manage}
        onConfirm={(comment, rating) => transition && changeStatus(transition, comment, rating)}
      />

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        loading={busy === 'delete'}
        title={`حذف تسک #${formatNumber(task.number)}`}
        message="تسک با همه نظرها، پیوست‌ها و تاریخچه‌اش برای همیشه حذف می‌شود. اگر فقط می‌خواهید از جلوی چشم برود، «بایگانی» بهتر است."
        confirmLabel="حذف برای همیشه"
      />
    </div>
  );
}

function Header({ task }: { task: TaskDetailResponse['task'] }) {
  const panel = usePanel();
  return (
    <div>
      <nav className="mb-1.5 flex items-center gap-1 text-[11px] muted">
        <Link href={panel.list} className="hover:underline">
          {panel.kind === 'developer' ? 'تسک‌ها' : 'همه تسک‌ها'}
        </Link>
        <span className="opacity-50">/</span>
        <TaskNumber number={task.number} />
      </nav>
      <div className="flex flex-wrap items-center gap-2">
        <TaskNumber number={task.number} className="text-sm" />
        <TypeTag type={task.type} />
        <StatusBadge status={task.status} />
        <PriorityBadge priority={task.priority} />
        <NecessityBadge necessity={task.necessity} />
        {task.reopenCount ? (
          <span className="text-[11px] font-semibold text-red-500">{formatNumber(task.reopenCount)} بار برگشت خورده</span>
        ) : null}
      </div>
      <h1 className="mt-2 text-lg font-extrabold leading-8 sm:text-xl">{task.title}</h1>
    </div>
  );
}

function TransitionIcon({ from, to }: { from: TaskStatus; to: TaskStatus }) {
  if (to === 'IN_PROGRESS' && from === 'REVIEW') return <Undo2 size={14} />;
  if (to === 'IN_PROGRESS') return <PlayCircle size={14} />;
  if (to === 'REVIEW' || to === 'DONE') return <CheckCircle2 size={14} />;
  if (to === 'BLOCKED') return <Hand size={14} />;
  return <ArrowRightLeft size={14} />;
}

// ───────────────  پنجره تغییر وضعیت  ───────────────

function TransitionModal({
  open,
  from,
  to,
  unchecked,
  loading,
  canRate,
  onClose,
  onConfirm,
}: {
  open: boolean;
  from: TaskStatus;
  to: TaskStatus | null;
  unchecked: number;
  loading: boolean;
  canRate: boolean;
  onClose: () => void;
  onConfirm: (comment: string, rating?: number) => void;
}) {
  const [comment, setComment] = useState('');
  const [rating, setRating] = useState(0);
  const required = to ? transitionNeedsComment(from, to) : false;

  const guide: Partial<Record<TaskStatus, { text: string; placeholder: string }>> = {
    REVIEW: {
      text: 'تسک به «انجام شد — منتظر تأیید» می‌رود و کارفرماها برای بررسی باخبر می‌شوند. اگر زمان‌سنج روشن است، فراموش نکنید آن را متوقف کنید.',
      placeholder: 'چه کاری انجام شد؟ چطور می‌شود تست کرد؟ (اختیاری ولی بسیار کمک می‌کند)',
    },
    BLOCKED: {
      text: 'کار متوقف می‌شود و کارفرماها فوراً باخبر می‌شوند. دقیق بنویسید چه چیزی لازم دارید.',
      placeholder: 'مثلاً: کد مرچنت درگاه را ندارم / باید مشخص شود این دکمه برای کاربران تعلیق‌شده هم نمایش داده شود یا نه',
    },
    DONE: { text: 'تسک بسته می‌شود و به برنامه‌نویس اطلاع داده می‌شود.', placeholder: 'یادداشت تأیید (اختیاری)' },
    CANCELED: { text: 'تسک لغو می‌شود و دیگر در فهرست کارهای باز و یادآوری‌ها نمی‌آید.', placeholder: 'علت لغو (اختیاری)' },
    IN_PROGRESS: {
      text: 'کار برای اصلاح به برنامه‌نویس برمی‌گردد و او فوراً باخبر می‌شود.',
      placeholder: 'دقیقاً چه چیزی درست کار نمی‌کند یا باید تغییر کند؟',
    },
    TODO: {
      text: 'تسک دوباره در صف انجام قرار می‌گیرد.',
      placeholder: from === 'DONE' || from === 'REVIEW' ? 'چرا دوباره باز می‌شود؟' : 'توضیح (اختیاری)',
    },
  };
  const g = to ? guide[to] : undefined;

  return (
    <Modal
      open={open}
      onClose={() => {
        setComment('');
        setRating(0);
        onClose();
      }}
      title={to ? transitionLabel(from, to) : ''}
      description={g?.text}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            انصراف
          </Button>
          <Button
            variant={to === 'CANCELED' ? 'danger' : 'primary'}
            loading={loading}
            disabled={required && !comment.trim()}
            onClick={() => {
              onConfirm(comment.trim(), rating || undefined);
              setComment('');
              setRating(0);
            }}
          >
            {to ? transitionLabel(from, to) : 'تأیید'}
          </Button>
        </>
      }
    >
      {to === 'REVIEW' && unchecked > 0 ? (
        <div className="mb-3">
          <Alert tone="warning">{formatNumber(unchecked)} مورد از چک‌لیست هنوز تیک نخورده است. مطمئنید همه انجام شده؟</Alert>
        </div>
      ) : null}
      {to === 'DONE' && canRate ? (
        <div className="mb-4">
          <label className="label">
            کیفیت کار <span className="font-normal muted">(اختیاری — در گزارش عملکرد برنامه‌نویس دیده می‌شود)</span>
          </label>
          <StarPicker value={rating} onChange={setRating} />
        </div>
      ) : null}
      <label className="label">
        توضیح {required ? <span className="text-red-500">*</span> : <span className="font-normal muted">(اختیاری)</span>}
      </label>
      <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={g?.placeholder} rows={5} autoFocus />
    </Modal>
  );
}

const RATING_FA = ['', 'ضعیف', 'نیاز به بهبود', 'قابل قبول', 'خوب', 'عالی'];

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1" dir="ltr">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? 0 : n)}
          className={cn('rounded p-0.5 transition', n <= value ? 'text-amber-500' : 'text-[var(--border)] hover:text-amber-300')}
          aria-label={`${n} ستاره`}
        >
          <Star size={24} fill="currentColor" />
        </button>
      ))}
      {value ? <span className="mr-2 text-xs font-semibold text-amber-600">{RATING_FA[value]}</span> : null}
    </div>
  );
}

export function Stars({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500" dir="ltr" title={`${value} از ۵ — ${RATING_FA[value]}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} fill={n <= value ? 'currentColor' : 'none'} className={n <= value ? '' : 'opacity-40'} />
      ))}
    </span>
  );
}

// ───────────────  ستون کناری  ───────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3 border-b py-1.5 text-xs last:border-b-0">
      <span className="shrink-0 muted">{label}</span>
      <div className="min-w-0 text-left">{children}</div>
    </div>
  );
}

function Sidebar({
  data,
  busy,
  onPatch,
}: {
  data: TaskDetailResponse;
  busy: boolean;
  onPatch: (body: Record<string, unknown>, success?: string) => void;
}) {
  const { task, permissions } = data;
  const { data: meta } = useTaskMeta();
  const [estimate, setEstimate] = useState<number>(task.estimateHours ?? 0);
  const closed = task.status === 'DONE' || task.status === 'CANCELED';

  return (
    <div className="space-y-4">
      <Card title="مشخصات" bodyClassName="px-4 py-2">
        <Row label="وضعیت">
          <StatusBadge status={task.status} />
        </Row>
        <Row label="اولویت">
          {permissions.manage ? (
            <div className="w-28">
              <Select
                value={task.priority}
                disabled={busy}
                onChange={(e) => onPatch({ priority: e.target.value }, 'اولویت تغییر کرد.')}
                className="py-1 text-xs"
              >
                {(Object.keys(TASK_PRIORITY_FA) as TaskPriority[]).map((k) => (
                  <option key={k} value={k}>
                    {TASK_PRIORITY_FA[k].label}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <PriorityBadge priority={task.priority} short />
          )}
        </Row>
        <Row label="ضرورت">
          {permissions.manage ? (
            <div className="w-28">
              <Select
                value={task.necessity}
                disabled={busy}
                onChange={(e) => onPatch({ necessity: e.target.value }, 'ضرورت تغییر کرد.')}
                className="py-1 text-xs"
              >
                {(Object.keys(TASK_NECESSITY_FA) as TaskNecessity[]).map((k) => (
                  <option key={k} value={k}>
                    {TASK_NECESSITY_FA[k].label}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <NecessityBadge necessity={task.necessity} short />
          )}
        </Row>
        <Row label="مسئول">
          {permissions.manage ? (
            <div className="w-40">
              <Select
                value={task.assigneeId ?? ''}
                disabled={busy}
                onChange={(e) => onPatch({ assigneeId: e.target.value || null }, 'مسئول تغییر کرد.')}
                className="py-1 text-xs"
              >
                <option value="">بدون مسئول</option>
                {meta?.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {personName(m)}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Avatar person={task.assignee} size={20} />
              {task.assignee ? personName(task.assignee) : 'بدون مسئول'}
            </span>
          )}
        </Row>
        <Row label="مهلت">
          {task.dueAt ? (
            <div className="flex flex-col items-end gap-0.5">
              <span>{faDateTime(task.dueAt)}</span>
              <DueLabel dueAt={task.dueAt} done={closed} />
            </div>
          ) : (
            <span className="muted">بدون مهلت</span>
          )}
        </Row>
        <Row label="زمان تخمینی">
          {permissions.estimate ? (
            <div className="flex items-center gap-1">
              <div className="w-16">
                <NumberInput value={estimate} onValueChange={setEstimate} min={0} max={1000} className="py-1 text-xs" />
              </div>
              <span className="muted">ساعت</span>
              {estimate !== (task.estimateHours ?? 0) ? (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy}
                  onClick={() => onPatch({ estimateHours: estimate || null }, 'زمان تخمینی ثبت شد.')}
                >
                  ثبت
                </Button>
              ) : null}
            </div>
          ) : task.estimateHours ? (
            `${formatNumber(task.estimateHours, 1)} ساعت`
          ) : (
            <span className="muted">—</span>
          )}
        </Row>
        {task.area ? <Row label="بخش">{task.area}</Row> : null}
        {task.labels.length ? (
          <Row label="برچسب‌ها">
            <div className="flex flex-wrap justify-end gap-1">
              {task.labels.map((l) => (
                <span key={l} className="rounded-md border px-1.5 py-px text-[10px]">
                  {l}
                </span>
              ))}
            </div>
          </Row>
        ) : null}
      </Card>

      <Card title="زمان‌بندی" bodyClassName="px-4 py-2">
        <Row label="ثبت">
          <span title={faDateTime(task.createdAt)}>
            {faRelative(task.createdAt)} — {personName(task.reporter)}
          </span>
        </Row>
        {task.startedAt ? <Row label="شروع کار">{faDateTime(task.startedAt)}</Row> : null}
        {task.submittedAt ? <Row label="اعلام انجام">{faDateTime(task.submittedAt)}</Row> : null}
        {task.completedAt ? <Row label="تأیید نهایی">{faDateTime(task.completedAt)}</Row> : null}
        <Row label="آخرین فعالیت">{faRelative(task.activityAt)}</Row>
        <Row label="دفعات برگشت">{formatNumber(task.reopenCount)}</Row>
        {task.rating ? (
          <Row label="کیفیت کار">
            <div className="flex flex-col items-end gap-0.5">
              <Stars value={task.rating} />
              {task.ratedBy ? <span className="text-[10px] muted">از {personName(task.ratedBy)}</span> : null}
            </div>
          </Row>
        ) : null}
      </Card>

      <Card title="دنبال‌کننده‌ها" bodyClassName="px-4 py-3">
        {task.watchers.length ? (
          <ul className="space-y-2">
            {task.watchers.map((w) => (
              <li key={w.userId} className="flex items-center gap-2 text-xs">
                <Avatar person={w.user} size={22} />
                <span>{personName(w.user)}</span>
                <span className="text-[10px] muted">{TASK_ROLE_FA[w.user.role ?? ''] ?? ''}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs muted">هنوز کسی این تسک را دنبال نمی‌کند.</p>
        )}
        <p className="mt-2 text-[10px] leading-5 muted">
          ثبت‌کننده و هر کسی که در گفتگو صدا زده شود خودکار دنبال‌کننده می‌شود. مسئول و کارفرماها همیشه باخبر می‌شوند.
        </p>
      </Card>
    </div>
  );
}

// ───────────────  چک‌لیست  ───────────────

function Checklist({ data, onChange }: { data: TaskDetailResponse; onChange: () => void }) {
  const { task, permissions } = data;
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const done = task.checklist.filter((c) => c.done).length;

  if (!task.checklist.length && !permissions.checklist) return null;

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    try {
      await fn();
      onChange();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function add() {
    const value = text.trim();
    if (!value) return;
    await run('add', () => apiPost(`/api/tasks/${task.id}/checklist`, { text: value }));
    setText('');
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <CheckSquare size={15} /> چک‌لیست
          {task.checklist.length ? (
            <span className="tabular text-xs font-normal muted">
              {formatNumber(done)} از {formatNumber(task.checklist.length)}
            </span>
          ) : null}
        </span>
      }
    >
      {task.checklist.length ? <ProgressBar done={done} total={task.checklist.length} className="mb-3" /> : null}
      <ul className="space-y-1">
        {task.checklist.map((item) => (
          <li key={item.id} className="group flex items-start gap-2 rounded-lg px-1 py-1.5 hover:bg-[var(--surface-2)]">
            <button
              type="button"
              disabled={!permissions.checklist || busy === item.id}
              onClick={() => run(item.id, () => apiPatch(`/api/tasks/${task.id}/checklist/${item.id}`, { done: !item.done }))}
              className={cn(
                'mt-0.5 shrink-0',
                item.done ? 'text-emerald-600' : 'muted',
                permissions.checklist && 'hover:opacity-70',
              )}
              aria-label={item.done ? 'برداشتن تیک' : 'تیک زدن'}
            >
              {item.done ? <CheckSquare size={17} /> : <Square size={17} />}
            </button>
            <span className={cn('flex-1 text-sm leading-6', item.done && 'line-through muted')}>{item.text}</span>
            {permissions.checklist ? (
              <button
                type="button"
                onClick={() => run(item.id, () => apiDelete(`/api/tasks/${task.id}/checklist/${item.id}`))}
                className="shrink-0 rounded p-1 muted opacity-60 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
                aria-label="حذف مورد"
              >
                <X size={14} />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {permissions.checklist ? (
        <div className="mt-2 flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void add();
              }
            }}
            placeholder="افزودن مرحله…"
            maxLength={300}
            className="text-sm"
          />
          <Button variant="secondary" onClick={add} loading={busy === 'add'} icon={<ListPlus size={15} />}>
            افزودن
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

// ───────────────  پیوست‌ها  ───────────────

function Attachments({ data, meId, onChange }: { data: TaskDetailResponse; meId?: string; onChange: () => void }) {
  const { task, permissions } = data;
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [toDelete, setToDelete] = useState<Attachment | null>(null);

  async function upload(list: File[]) {
    const { ok, errors } = checkFiles(list);
    errors.forEach((m) => toast.error(m));
    if (!ok.length) return;
    setUploading(true);
    try {
      await uploadFiles(task.id, ok);
      toast.success('فایل‌ها پیوست شد.');
      onChange();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await apiDelete(`/api/tasks/attachments/${toDelete.id}`);
      toast.success('فایل حذف شد.');
      setToDelete(null);
      onChange();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Paperclip size={15} /> پیوست‌ها
          {task.attachments.length ? (
            <span className="text-xs font-normal muted">{formatNumber(task.attachments.length)}</span>
          ) : null}
        </span>
      }
      action={uploading ? <span className="text-xs muted">در حال ارسال…</span> : null}
    >
      <div className="space-y-3">
        <AttachmentGrid
          items={task.attachments}
          canDelete={(a) => permissions.manage || a.userId === meId}
          onDelete={setToDelete}
        />
        <FileDrop onFiles={upload} label="افزودن اسکرین‌شات یا فایل" />
      </div>
      <ConfirmModal
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title="حذف پیوست"
        message={`فایل «${toDelete?.name ?? ''}» حذف شود؟`}
        confirmLabel="حذف"
      />
    </Card>
  );
}

// ───────────────  گفتگو و تاریخچه  ───────────────

const FIELD_FA: Record<string, string> = {
  title: 'عنوان',
  description: 'شرح',
  type: 'نوع',
  priority: 'اولویت',
  necessity: 'ضرورت',
  area: 'بخش',
  pageUrl: 'آدرس صفحه',
  labels: 'برچسب‌ها',
  dueAt: 'مهلت',
  estimateHours: 'زمان تخمینی',
};

function fieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'priority') return TASK_PRIORITY_FA[value as TaskPriority]?.label ?? String(value);
  if (field === 'necessity') return TASK_NECESSITY_FA[value as TaskNecessity]?.label ?? String(value);
  if (field === 'type') return TASK_TYPE_FA[value as TaskType]?.label ?? String(value);
  if (field === 'dueAt') return faDateTime(String(value));
  if (field === 'labels') return Array.isArray(value) && value.length ? value.join('، ') : '—';
  if (field === 'estimateHours') return `${formatNumber(Number(value), 1)} ساعت`;
  return String(value);
}

function describe(a: Activity, actor: string): React.ReactNode {
  const m = a.meta as Record<string, unknown>;
  switch (a.kind) {
    case 'CREATED':
      return `${actor} این تسک را ثبت کرد.`;
    case 'STATUS': {
      const from = m.from as TaskStatus;
      const to = m.to as TaskStatus;
      if (to === 'REVIEW')
        return (
          <>
            <b>{actor}</b> اعلام کرد کار <b className="text-amber-600">انجام شد</b> و منتظر تأیید است.
          </>
        );
      if (to === 'DONE')
        return (
          <>
            <b>{actor}</b> کار را <b className="text-emerald-600">تأیید کرد و بست</b>.
            {typeof m.rating === 'number' ? (
              <>
                {' '}
                <Stars value={m.rating} size={11} />
              </>
            ) : null}
          </>
        );
      if (to === 'BLOCKED')
        return (
          <>
            <b>{actor}</b> کار را متوقف کرد: <b className="text-red-600">نیاز به اطلاعات</b>.
          </>
        );
      if (m.reopened)
        return (
          <>
            <b>{actor}</b> کار را <b className="text-red-600">برای اصلاح برگرداند</b>.
          </>
        );
      if (to === 'IN_PROGRESS' && from === 'TODO')
        return (
          <>
            <b>{actor}</b> کار را شروع کرد.
          </>
        );
      if (to === 'CANCELED')
        return (
          <>
            <b>{actor}</b> تسک را لغو کرد.
          </>
        );
      return (
        <>
          <b>{actor}</b> وضعیت را از «{TASK_STATUS_FA[from]?.label ?? from}» به «{TASK_STATUS_FA[to]?.label ?? to}» تغییر داد.
        </>
      );
    }
    case 'FIELDS': {
      const changes = (m.changes as { field: string; from: unknown; to: unknown }[]) ?? [];
      return (
        <>
          <b>{actor}</b> تغییر داد:{' '}
          {changes.map((c, i) => (
            <span key={i}>
              {i > 0 ? '، ' : ''}
              {c.field === 'description' ? (
                'شرح کار'
              ) : (
                <>
                  {FIELD_FA[c.field] ?? c.field}: {fieldValue(c.field, c.from)} ← <b>{fieldValue(c.field, c.to)}</b>
                </>
              )}
            </span>
          ))}
        </>
      );
    }
    case 'ASSIGNED':
      if (!m.from && m.to === actor)
        return (
          <>
            <b>{actor}</b> این تسک را برداشت.
          </>
        );
      if (!m.to)
        return (
          <>
            <b>{actor}</b> مسئول تسک ({String(m.from)}) را برداشت.
          </>
        );
      return (
        <>
          <b>{actor}</b> تسک را به <b>{String(m.to)}</b> سپرد{m.from ? ` (قبلاً ${String(m.from)})` : ''}.
        </>
      );
    case 'CHECKLIST': {
      const verb = {
        add: 'به چک‌لیست اضافه کرد',
        done: 'را انجام‌شده علامت زد',
        undone: 'را دوباره باز کرد',
        remove: 'را از چک‌لیست حذف کرد',
      }[String(m.action)];
      return (
        <>
          <b>{actor}</b> «{String(m.text)}» {verb}.
        </>
      );
    }
    case 'ATTACHMENT':
      return (
        <>
          <b>{actor}</b> فایل پیوست کرد: {((m.names as string[]) ?? []).join('، ')}
        </>
      );
    case 'ATTACHMENT_REMOVED':
      return (
        <>
          <b>{actor}</b> فایل «{String(m.name)}» را حذف کرد.
        </>
      );
    case 'TIME':
      return (
        <>
          <b>{actor}</b> {m.manual ? 'دستی ' : ''}
          <b className="text-emerald-600">{String(m.label)}</b> کارکرد ثبت کرد.
        </>
      );
    case 'TIME_REMOVED':
      return (
        <>
          <b>{actor}</b> کارکرد {String(m.label)} را حذف کرد.
        </>
      );
    case 'ARCHIVED':
      return `${actor} تسک را بایگانی کرد.`;
    case 'UNARCHIVED':
      return `${actor} تسک را از بایگانی خارج کرد.`;
    default:
      return `${actor}: ${a.kind}`;
  }
}

function Timeline({
  data,
  meId,
  lastSeenAt,
  onChange,
  commentRef,
}: {
  data: TaskDetailResponse;
  meId?: string;
  lastSeenAt: string | null;
  onChange: () => void;
  commentRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const { task, permissions } = data;
  const toast = useToast();
  const [onlyComments, setOnlyComments] = useState(false);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);
  const { data: meta } = useTaskMeta();
  const people: Person[] = meta?.people ?? [];

  const attachmentsByActivity = useMemo(() => {
    const map = new Map<string, Attachment[]>();
    for (const a of task.attachments) {
      if (!a.activityId) continue;
      map.set(a.activityId, [...(map.get(a.activityId) ?? []), a]);
    }
    return map;
  }, [task.attachments]);

  const items = onlyComments
    ? task.activities.filter((a) => a.kind === 'COMMENT' || (a.kind === 'STATUS' && a.body))
    : task.activities;
  const seen = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;

  function addFiles(list: File[]) {
    const { ok, errors } = checkFiles(list);
    errors.forEach((m) => toast.error(m));
    if (ok.length) setFiles((f) => [...f, ...ok].slice(0, 10));
  }

  async function send() {
    if (!body.trim() && !files.length) return;
    setSending(true);
    try {
      const uploaded = await uploadFiles(task.id, files, true);
      await apiPost(`/api/tasks/${task.id}/comments`, {
        body: body.trim(),
        attachmentIds: uploaded.map((u) => u.id),
        mentionIds: mentions,
      });
      setBody('');
      setFiles([]);
      setMentions([]);
      onChange();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function saveEdit(id: string) {
    try {
      await apiPatch(`/api/tasks/${task.id}/comments/${id}`, { body: editText });
      setEditingId(null);
      onChange();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function removeComment(id: string) {
    if (!window.confirm('این نظر حذف شود؟')) return;
    try {
      await apiDelete(`/api/tasks/${task.id}/comments/${id}`);
      onChange();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <History size={15} /> گفتگو و تاریخچه
        </span>
      }
      action={
        <button
          type="button"
          onClick={() => setOnlyComments((v) => !v)}
          className={cn(
            'inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px]',
            onlyComments && 'border-[var(--color-brand-500)]',
          )}
        >
          <MessageSquare size={12} /> {onlyComments ? 'نمایش همه رویدادها' : 'فقط گفتگوها'}
        </button>
      }
    >
      <ol className="relative space-y-3 border-r pr-4">
        {items.map((a) => {
          const actor = a.user ? personName(a.user) : 'سیستم';
          const fresh = seen && new Date(a.createdAt).getTime() > seen && a.user?.id !== meId;
          const isComment = a.kind === 'COMMENT';
          const own = a.user?.id === meId;
          const files = attachmentsByActivity.get(a.id) ?? [];

          return (
            <li key={a.id} className="relative">
              <span
                className={cn(
                  'absolute -right-[1.42rem] top-2 h-2.5 w-2.5 rounded-full border-2',
                  isComment
                    ? 'border-[var(--color-brand-600)] bg-[var(--surface)]'
                    : 'border-[var(--border)] bg-[var(--surface-2)]',
                )}
              />
              {isComment ? (
                <div className={cn('rounded-xl border p-3', own ? 'surface-2' : '', fresh && 'border-[var(--color-brand-500)]')}>
                  <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                    <Avatar person={a.user} size={22} />
                    <b className="text-xs">{actor}</b>
                    {a.user?.role ? <span className="muted">{TASK_ROLE_FA[a.user.role] ?? ''}</span> : null}
                    <span className="muted" title={faDateTime(a.createdAt)}>
                      {faRelative(a.createdAt)}
                    </span>
                    {a.editedAt ? <span className="muted">(ویرایش‌شده)</span> : null}
                    {fresh ? (
                      <span className="rounded-full bg-[var(--color-brand-600)] px-1.5 text-[10px] font-bold text-white">
                        جدید
                      </span>
                    ) : null}
                    <span className="flex-1" />
                    {own && editingId !== a.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(a.id);
                          setEditText(a.body ?? '');
                        }}
                        className="muted hover:opacity-70"
                        aria-label="ویرایش"
                      >
                        <Pencil size={12} />
                      </button>
                    ) : null}
                    {own || permissions.manage ? (
                      <button
                        type="button"
                        onClick={() => removeComment(a.id)}
                        className="muted hover:text-red-500"
                        aria-label="حذف"
                      >
                        <Trash2 size={12} />
                      </button>
                    ) : null}
                  </div>
                  {editingId === a.id ? (
                    <div className="space-y-2">
                      <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={4} />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveEdit(a.id)}>
                          ذخیره
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>
                          انصراف
                        </Button>
                      </div>
                    </div>
                  ) : a.body ? (
                    <RichText text={a.body} />
                  ) : null}
                  {Array.isArray((a.meta as { mentions?: string[] }).mentions) ? (
                    <div className="mt-1.5 text-[11px] text-[var(--color-brand-600)]">
                      📣 صدا زد:{' '}
                      {((a.meta as { mentions: string[] }).mentions)
                        .map((id) => personName(people.find((p) => p.id === id)))
                        .join('، ')}
                    </div>
                  ) : null}
                  {files.length ? (
                    <div className="mt-2">
                      <AttachmentGrid items={files} small />
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className={cn('text-xs leading-6', fresh ? '' : 'muted')}>
                  <div>
                    {describe(a, actor)}{' '}
                    <span className="whitespace-nowrap text-[10px] muted" title={faDateTime(a.createdAt)}>
                      <Clock size={10} className="inline" /> {faRelative(a.createdAt)}
                    </span>
                    {fresh ? (
                      <span className="mr-1 rounded-full bg-[var(--color-brand-600)] px-1.5 text-[10px] font-bold text-white">
                        جدید
                      </span>
                    ) : null}
                  </div>
                  {a.body ? (
                    <div className="mt-1 rounded-lg border-r-2 border-[var(--color-brand-500)] py-1 pr-3 text-[var(--text)] surface-2">
                      <RichText text={a.body} className="text-xs" />
                    </div>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {permissions.comment ? (
        <div
          className="mt-5 space-y-2 border-t pt-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(Array.from(e.dataTransfer.files ?? []));
          }}
        >
          <Textarea
            ref={commentRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onPaste={(e) => {
              const pasted = filesFromClipboard(e);
              if (pasted.length) {
                e.preventDefault();
                addFiles(pasted);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void send();
              }
            }}
            rows={4}
            placeholder="نظر، سؤال یا گزارش پیشرفت… (اسکرین‌شات را با Ctrl+V بچسبانید؛ Ctrl+Enter برای ارسال)"
          />
          <PendingFiles files={files} onRemove={(i) => setFiles((f) => f.filter((_, j) => j !== i))} />
          {people.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="muted">📣 صدا زدن (اعلان ویژه با ایمیل):</span>
              {people
                .filter((p) => p.id !== meId)
                .map((p) => {
                  const on = mentions.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setMentions((m) => (on ? m.filter((x) => x !== p.id) : [...m, p.id]))}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition',
                        on ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-600)] text-white' : 'hover:bg-[var(--surface-2)]',
                      )}
                    >
                      @{personName(p)}
                      <span className={on ? 'opacity-80' : 'muted'}>{TASK_ROLE_FA[p.role ?? ''] ?? ''}</span>
                    </button>
                  );
                })}
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <FileDrop compact onFiles={addFiles} />
            <Button onClick={send} loading={sending} disabled={!body.trim() && !files.length} icon={<Send size={15} />}>
              ارسال
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
