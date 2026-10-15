'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ChevronLeft, ChevronRight, CalendarDays, FileText, Plus, Eye, Clock } from 'lucide-react';
import { Alert, Badge, Button, Card, EmptyState, LoadingBlock, Stat } from '@/components/ui';
import { fetcher } from '@/lib/client';
import { formatNumber } from '@/lib/money';
import { cn, faDate, faRelative } from '@/lib/utils';
import { STATUS_FA, scoreTone, type PostStatus } from '../types';

type DayPost = {
  id: string;
  slug: string;
  title: string;
  status: PostStatus;
  publishedAt: string | null;
  views: number;
  seoScore: number;
  wordCount: number;
  category: { name: string } | null;
};

type CalendarData = {
  month: string;
  firstWeekday: number;
  daysInMonth: number;
  days: { day: string; items: DayPost[] }[];
  drafts: { id: string; slug: string; title: string; seoScore: number; wordCount: number; updatedAt: string }[];
  totals: {
    posts: number;
    published: number;
    scheduled: number;
    words: number;
    views: number;
    activeDays: number;
  };
};

/** نام ماه و روز را به فارسی و بر پایه تقویم شمسی نشان می‌دهیم */
const faMonth = new Intl.DateTimeFormat('fa-IR', { month: 'long', year: 'numeric' });
const WEEKDAYS = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];

function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number);
  const d = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * تقویم انتشار.
 *
 * نظم انتشار، یکی از سیگنال‌هایی است که فاصله سر زدن گوگل به سایت را کوتاه
 * می‌کند: سایتی که هر روز مطلب تازه دارد، چند بار در روز خزیده می‌شود.
 * این نما نشان می‌دهد کدام روزها خالی مانده و چه پیش‌نویسی آماده نشستن
 * روی آن روز است.
 */
export function CalendarPanel() {
  const [month, setMonth] = useState(currentMonth);
  const { data, isLoading } = useSWR<CalendarData>(`/api/admin/blog/calendar?month=${month}`, fetcher);

  const byDay = new Map((data?.days ?? []).map((d) => [d.day, d.items]));
  const [year, mon] = month.split('-').map(Number);
  const monthLabel = faMonth.format(new Date(Date.UTC(year, mon - 1, 15)));
  const today = new Date().toISOString().slice(0, 10);

  // جدول ماه: خانه‌های خالی اول ماه + روزهای ماه
  const cells: (string | null)[] = [
    ...Array.from({ length: data?.firstWeekday ?? 0 }, () => null),
    ...Array.from(
      { length: data?.daysInMonth ?? 0 },
      (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`,
    ),
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat
          label="مقاله‌های این ماه"
          value={formatNumber(data?.totals.posts ?? 0)}
          hint={`${formatNumber(data?.totals.published ?? 0)} منتشرشده · ${formatNumber(data?.totals.scheduled ?? 0)} در نوبت`}
          icon={<FileText size={16} />}
        />
        <Stat
          label="روزهای فعال"
          value={`${formatNumber(data?.totals.activeDays ?? 0)} از ${formatNumber(data?.daysInMonth ?? 30)}`}
          hint="روزهایی که دست‌کم یک مقاله رفته"
          icon={<CalendarDays size={16} />}
          tone={(data?.totals.activeDays ?? 0) >= (data?.daysInMonth ?? 30) / 2 ? 'ok' : 'warn'}
        />
        <Stat label="کلمه‌های نوشته‌شده" value={formatNumber(data?.totals.words ?? 0)} />
        <Stat label="بازدید مقاله‌های این ماه" value={formatNumber(data?.totals.views ?? 0)} icon={<Eye size={16} />} />
      </div>

      <Card
        title={`تقویم ${monthLabel}`}
        description="هر خانه، مقاله‌های منتشرشده یا زمان‌بندی‌شده همان روز است."
        action={
          <div className="flex items-center gap-1.5">
            <Button variant="secondary" size="sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="ماه قبل">
              <ChevronRight size={14} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setMonth(currentMonth())}>
              این ماه
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="ماه بعد">
              <ChevronLeft size={14} />
            </Button>
          </div>
        }
      >
        {isLoading && !data ? (
          <LoadingBlock />
        ) : (
          <>
            <div className="scroll-x">
              <div className="min-w-[44rem]">
                <div className="grid grid-cols-7 gap-1.5 pb-1.5 text-center text-[10px] font-bold muted">
                  {WEEKDAYS.map((d) => (
                    <div key={d}>{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {cells.map((day, i) => {
                    if (!day) return <div key={`pad-${i}`} />;
                    const items = byDay.get(day) ?? [];
                    const isToday = day === today;
                    const isFuture = day > today;
                    return (
                      <div
                        key={day}
                        className={cn(
                          'min-h-24 rounded-xl border p-1.5 transition',
                          isToday ? 'border-[var(--color-brand-500)]' : '',
                          items.length ? '' : isFuture ? 'opacity-70' : 'bg-[var(--surface-2)]',
                        )}
                      >
                        <div className="mb-1 flex items-center justify-between text-[10px]">
                          <span className={cn('tabular font-bold', isToday ? 'text-[var(--color-brand-600)]' : 'muted')}>
                            {faDate(day)}
                          </span>
                          {items.length > 1 ? (
                            <span className="tabular muted">{formatNumber(items.length)}</span>
                          ) : null}
                        </div>
                        <div className="space-y-1">
                          {items.slice(0, 3).map((post) => (
                            <Link
                              key={post.id}
                              href={`/admin/blog/${post.id}`}
                              title={post.title}
                              className={cn(
                                'block truncate rounded-lg px-1.5 py-1 text-[10px] font-semibold transition hover:opacity-80',
                                post.status === 'PUBLISHED'
                                  ? 'bg-[color-mix(in_srgb,var(--color-brand-500)_18%,transparent)]'
                                  : 'bg-amber-500/15 text-amber-700',
                              )}
                            >
                              {post.title}
                            </Link>
                          ))}
                          {items.length > 3 ? (
                            <span className="block px-1.5 text-[10px] muted">
                              + {formatNumber(items.length - 3)} مقاله دیگر
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4 border-t pt-3 text-[11px] muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded bg-[color-mix(in_srgb,var(--color-brand-500)_40%,transparent)]" />
                منتشرشده
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded bg-amber-500/40" />
                زمان‌بندی‌شده
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded border bg-[var(--surface-2)]" />
                روز خالی
              </span>
            </div>
          </>
        )}
      </Card>

      <Card
        title="پیش‌نویس‌های بی‌تاریخ"
        description="اینها آماده‌اند و فقط تاریخ انتشار ندارند؛ با ویرایش هر کدام می‌توانید روی یک روز خالی بنشانیدشان."
        action={
          <Link href="/admin/blog/new" className="btn btn-primary btn-sm">
            <Plus size={14} /> مقاله جدید
          </Link>
        }
        bodyClassName={data?.drafts.length ? 'space-y-2' : undefined}
      >
        {!data ? (
          <LoadingBlock />
        ) : data.drafts.length === 0 ? (
          <EmptyState icon={<Clock size={24} />} title="پیش‌نویس بی‌تاریخی ندارید" />
        ) : (
          data.drafts.map((draft) => (
            <div key={draft.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
              <Link href={`/admin/blog/${draft.id}`} className="min-w-0 flex-1 truncate text-sm font-semibold hover:underline">
                {draft.title}
              </Link>
              <div className="flex shrink-0 items-center gap-2 text-[11px] muted">
                <Badge tone={scoreTone(draft.seoScore)}>سئو {formatNumber(draft.seoScore)}</Badge>
                <span className="tabular">{formatNumber(draft.wordCount)} کلمه</span>
                <span>{faRelative(draft.updatedAt)}</span>
                <Badge tone={STATUS_FA.DRAFT.tone}>{STATUS_FA.DRAFT.label}</Badge>
              </div>
            </div>
          ))
        )}
      </Card>

      {data && data.totals.posts === 0 ? (
        <Alert tone="info" title="این ماه هنوز مقاله‌ای ندارد">
          اگر انتشار خودکار روشن باشد، هر روز در ساعت تعیین‌شده مقاله‌های تازه اینجا ظاهر می‌شوند.{' '}
          <Link href="/admin/blog/content" className="underline">
            وضعیت خط تولید
          </Link>
        </Alert>
      ) : null}
    </div>
  );
}
