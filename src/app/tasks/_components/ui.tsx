'use client';

import { Fragment } from 'react';
import { CalendarClock } from 'lucide-react';
import { Badge } from '@/components/ui';
import { cn, faDate, faRelative } from '@/lib/utils';
import {
  TASK_NECESSITY_FA,
  TASK_PRIORITY_FA,
  TASK_STATUS_COLOR,
  TASK_STATUS_FA,
  TASK_TYPE_FA,
  type TaskNecessity,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from '@/lib/dev-tasks-shared';
import { personName, type Person } from './types';

export function StatusBadge({ status }: { status: string }) {
  const st = TASK_STATUS_FA[status as TaskStatus] ?? { label: status, tone: 'muted' as const };
  return (
    <Badge tone={st.tone}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: TASK_STATUS_COLOR[status as TaskStatus] }} />
      {st.label}
    </Badge>
  );
}

export function PriorityBadge({ priority, short }: { priority: string; short?: boolean }) {
  const p = TASK_PRIORITY_FA[priority as TaskPriority] ?? { label: priority, tone: 'muted' as const };
  return <Badge tone={p.tone}>{short ? p.label : `اولویت ${p.label}`}</Badge>;
}

export function NecessityBadge({ necessity, short }: { necessity: string; short?: boolean }) {
  const n = TASK_NECESSITY_FA[necessity as TaskNecessity] ?? { label: necessity, tone: 'muted' as const };
  return <Badge tone={n.tone}>{short ? n.label : `ضرورت ${n.label}`}</Badge>;
}

export function TypeTag({ type, className }: { type: string; className?: string }) {
  const t = TASK_TYPE_FA[type as TaskType] ?? { label: type, emoji: '•' };
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] muted', className)}>
      <span aria-hidden>{t.emoji}</span>
      {t.label}
    </span>
  );
}

export function TaskNumber({ number, className }: { number: number; className?: string }) {
  return (
    <span className={cn('tabular font-bold muted', className)}>
      #{new Intl.NumberFormat('fa-IR', { useGrouping: false }).format(number)}
    </span>
  );
}

const AVATAR_COLORS = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#6366f1'];

export function Avatar({ person, size = 24 }: { person: Person | null | undefined; size?: number }) {
  if (!person) {
    return (
      <span
        className="grid shrink-0 place-items-center rounded-full border border-dashed text-[10px] muted"
        style={{ width: size, height: size }}
        title="بدون مسئول"
      >
        ?
      </span>
    );
  }
  const name = personName(person);
  const hash = [...person.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const letters = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: AVATAR_COLORS[hash % AVATAR_COLORS.length], fontSize: size * 0.42 }}
      title={name}
    >
      {letters.toUpperCase()}
    </span>
  );
}

/** نمایش مهلت با رنگ هشدار: گذشته قرمز، کمتر از دو روز نارنجی */
export function DueLabel({ dueAt, done, className }: { dueAt: string | null; done?: boolean; className?: string }) {
  if (!dueAt) return null;
  const left = new Date(dueAt).getTime() - Date.now();
  const tone = done ? 'muted' : left < 0 ? 'text-red-600 font-bold' : left < 48 * 3_600_000 ? 'text-amber-600 font-semibold' : 'muted';
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px]', tone, className)} title={`مهلت: ${faDate(dueAt)}`}>
      <CalendarClock size={12} />
      {done ? faDate(dueAt) : left < 0 ? `مهلت گذشته (${faRelative(dueAt)})` : `مهلت ${faRelative(dueAt)}`}
    </span>
  );
}

export function ProgressBar({ done, total, className }: { done: number; total: number; className?: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]', className)}>
      <div
        className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-emerald-500' : 'bg-[var(--color-brand-600)]')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

/** پیوندها قابل کلیک و `کد` در متن با قلم ثابت نمایش داده می‌شود */
function inline(text: string, keyBase: string) {
  return text.split(/(`[^`\n]+`)/g).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={`${keyBase}-c${i}`} className="mono ltr rounded px-1 py-0.5 text-[0.85em] surface-2">
          {part.slice(1, -1)}
        </code>
      );
    }
    // با گروه گیرنده در split، خانه‌های فرد همان پیوندها هستند
    return part.split(URL_RE).map((chunk, j) =>
      j % 2 === 1 ? (
        <a
          key={`${keyBase}-u${i}-${j}`}
          href={chunk}
          target="_blank"
          rel="noopener noreferrer"
          className="ltr break-all text-[var(--color-brand-600)] underline-offset-2 hover:underline"
        >
          {chunk}
        </a>
      ) : (
        <Fragment key={`${keyBase}-t${i}-${j}`}>{chunk}</Fragment>
      ),
    );
  });
}

/**
 * متن چندخطی ساده: خطوط و فاصله‌ها حفظ می‌شود، بلوک ``` به‌صورت کد نمایش داده
 * می‌شود و پیوندها قابل کلیک‌اند. HTML کاربر هرگز تفسیر نمی‌شود.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = text.split(/```/);
  return (
    <div className={cn('whitespace-pre-wrap break-words text-sm leading-7', className)}>
      {blocks.map((block, i) =>
        i % 2 === 1 ? (
          <pre key={i} className="mono ltr my-2 overflow-x-auto whitespace-pre rounded-lg p-3 text-left text-xs leading-6 surface-2">
            {block.replace(/^\w*\n/, '')}
          </pre>
        ) : (
          <Fragment key={i}>{inline(block, String(i))}</Fragment>
        ),
      )}
    </div>
  );
}
