'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { AlertTriangle, Clock, Star, Timer, UserPlus } from 'lucide-react';
import { Card, EmptyState, LoadingBlock } from '@/components/ui';
import { fetcher } from '@/lib/client';
import { formatNumber } from '@/lib/money';
import { cn, faRelative } from '@/lib/utils';
import { formatMinutes } from '@/lib/dev-tasks-shared';
import { Avatar } from './ui';

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  lastLoginAt: string | null;
  lastActivityAt: string | null;
  open: number;
  todo: number;
  inProgress: number;
  blocked: number;
  review: number;
  overdue: number;
  estimateHours: number;
  minutesWeek: number;
  minutesMonth: number;
  done30: number;
  avgRating: number | null;
  workingOn: { number: number; title: string; since: string } | null;
};

/** کارت هر برنامه‌نویس: بار کاری فعلی، کارکرد، کیفیت و اینکه همین الان روی چه کاری است */
export function TeamCards({ items, compact }: { items: TeamMember[]; compact?: boolean }) {
  const maxOpen = Math.max(1, ...items.map((m) => m.open));
  return (
    <div className={cn('grid gap-3', compact ? 'sm:grid-cols-2 lg:grid-cols-1' : 'md:grid-cols-2 xl:grid-cols-3')}>
      {items.map((m) => (
        <div key={m.id} className="card p-4">
          <div className="flex items-center gap-3">
            <Avatar person={{ id: m.id, email: m.email, firstName: m.name, lastName: null }} size={36} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{m.name}</div>
              <div className="text-[11px] muted">
                {m.lastActivityAt ? `آخرین فعالیت ${faRelative(m.lastActivityAt)}` : 'هنوز فعالیتی ندارد'}
              </div>
            </div>
            {m.avgRating ? (
              <span className="inline-flex items-center gap-0.5 text-xs font-bold text-amber-500" title="میانگین امتیاز کیفیت ۳۰ روز اخیر">
                <Star size={13} fill="currentColor" /> {formatNumber(m.avgRating, 1)}
              </span>
            ) : null}
          </div>

          {m.workingOn ? (
            <Link
              href={`/tasks/${m.workingOn.number}`}
              className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-700 hover:opacity-80"
            >
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-500" />
              <span className="truncate">
                الان روی #{formatNumber(m.workingOn.number)} {m.workingOn.title}
              </span>
              <span className="shrink-0 muted">از {faRelative(m.workingOn.since)}</span>
            </Link>
          ) : null}

          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[11px]">
              <span className="muted">بار کاری</span>
              <span className="font-bold">{formatNumber(m.open)} کار باز</span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full surface-2">
              {(
                [
                  ['inProgress', '#0ea5e9'],
                  ['todo', '#64748b'],
                  ['blocked', '#ef4444'],
                  ['review', '#f59e0b'],
                ] as const
              ).map(([k, color]) => (
                <div key={k} style={{ width: `${(m[k] / maxOpen) * 100}%`, background: color }} />
              ))}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] muted">
              <span>در حال انجام {formatNumber(m.inProgress)}</span>
              <span>در صف {formatNumber(m.todo)}</span>
              {m.blocked ? <span className="text-red-600">متوقف {formatNumber(m.blocked)}</span> : null}
              {m.review ? <span className="text-amber-600">منتظر تأیید {formatNumber(m.review)}</span> : null}
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-[11px]">
            <div>
              <dt className="muted">کارکرد ۷ روز</dt>
              <dd className="font-bold">{formatMinutes(m.minutesWeek)}</dd>
            </div>
            <div>
              <dt className="muted">کارکرد ۳۰ روز</dt>
              <dd className="font-bold">{formatMinutes(m.minutesMonth)}</dd>
            </div>
            <div>
              <dt className="muted">تأییدشده ۳۰ روز</dt>
              <dd className="font-bold text-emerald-600">{formatNumber(m.done30)}</dd>
            </div>
            <div>
              <dt className="muted">تخمین کارهای باز</dt>
              <dd className="font-bold">{m.estimateHours ? `${formatNumber(m.estimateHours, 1)} ساعت` : '—'}</dd>
            </div>
          </dl>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-[11px]">
            {m.overdue ? (
              <span className="inline-flex items-center gap-1 font-bold text-red-600">
                <AlertTriangle size={12} /> {formatNumber(m.overdue)} کار عقب‌افتاده
              </span>
            ) : null}
            <span className="flex-1" />
            <Link href={`/tasks/list?view=all&assignee=${m.id}`} className="text-[var(--color-brand-600)] hover:underline">
              کارها
            </Link>
            {!compact ? (
              <Link href={`/tasks/worklog`} className="inline-flex items-center gap-1 text-[var(--color-brand-600)] hover:underline">
                <Timer size={11} /> کارکرد
              </Link>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TeamView() {
  const { data } = useSWR<{ items: TeamMember[] }>('/api/tasks/team', fetcher, { refreshInterval: 60_000 });
  if (!data) return <LoadingBlock />;
  if (!data.items.length) {
    return (
      <Card>
        <EmptyState
          icon={<UserPlus size={34} />}
          title="هنوز برنامه‌نویسی در تیم نیست"
          description="برنامه‌نویس در سایت ثبت‌نام کند؛ سپس مدیر از «اعضای تیم و نقش‌ها» نقش حسابش را «برنامه‌نویس» کند."
        />
      </Card>
    );
  }

  const totalOpen = data.items.reduce((a, m) => a + m.open, 0);
  const working = data.items.filter((m) => m.workingOn).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-xs muted">
        <span>
          <b className="text-[var(--text)]">{formatNumber(data.items.length)}</b> برنامه‌نویس
        </span>
        <span>
          <b className="text-[var(--text)]">{formatNumber(totalOpen)}</b> کار باز در دست تیم
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock size={12} /> <b className="text-emerald-600">{formatNumber(working)}</b> نفر همین الان زمان‌سنج روشن دارند
        </span>
      </div>
      <TeamCards items={data.items} />
    </div>
  );
}
