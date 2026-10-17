'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Download, Timer } from 'lucide-react';
import { Card, EmptyState, LoadingBlock, Select, Stat } from '@/components/ui';
import { fetcher } from '@/lib/client';
import { formatNumber } from '@/lib/money';
import { faDateTime } from '@/lib/utils';
import { formatMinutes } from '@/lib/dev-tasks-shared';
import { useTaskMeta } from './filters';
import { usePanel } from './panel';
import { personName, type Person } from './types';

type Log = {
  id: string;
  minutes: number;
  startedAt: string;
  endedAt: string | null;
  note: string | null;
  manual: boolean;
  user: Person;
  task: { id: string; number: number; title: string; status: string };
};

type Response = {
  items: Log[];
  total: number;
  days: { day: string; label: string; minutes: number }[];
  users: { id: string; name: string; minutes: number }[];
  tasks: { number: number; title: string; minutes: number }[];
};

const RANGES = [
  { days: 1, label: 'امروز' },
  { days: 7, label: '۷ روز اخیر' },
  { days: 30, label: '۳۰ روز اخیر' },
  { days: 90, label: '۹۰ روز اخیر' },
];

/** گزارش کارکرد — برنامه‌نویس کارکرد خودش و کارفرما کارکرد همه یا یک نفر را می‌بیند */
export function Worklog() {
  const panel = usePanel();
  const employer = panel.kind === 'employer';
  const { data: meta } = useTaskMeta();
  const [days, setDays] = useState(7);
  const [user, setUser] = useState(employer ? 'all' : 'me');
  const query = `days=${days}&user=${user}`;
  const { data } = useSWR<Response>(`/api/tasks/worklog?${query}`, fetcher, { refreshInterval: 60_000 });

  const people = meta?.people.filter((p) => p.role === 'DEVELOPER' || p.role === 'ADMIN' || p.role === 'EMPLOYER') ?? [];
  const maxDay = Math.max(1, ...(data?.days.map((d) => d.minutes) ?? [0]));
  const workingDays = data?.days.filter((d) => d.minutes > 0).length ?? 0;

  return (
    <div className="space-y-4">
      <Card bodyClassName="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`rounded-xl border px-3 py-2 text-xs transition ${days === r.days ? 'border-[var(--color-brand-500)] font-semibold' : 'hover:bg-[var(--surface-2)]'}`}
            >
              {r.label}
            </button>
          ))}
          {employer ? (
            <div className="w-48">
              <Select value={user} onChange={(e) => setUser(e.target.value)} className="text-xs">
                <option value="all">همه افراد</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {personName(p)}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div className="flex-1" />
          <a href={`/api/tasks/worklog?${query}&format=csv`} className="btn btn-secondary btn-sm">
            <Download size={14} /> خروجی اکسل
          </a>
        </div>
      </Card>

      {!data ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="جمع کارکرد" value={formatMinutes(data.total)} icon={<Timer size={16} />} />
            <Stat label="روزهای کاری" value={formatNumber(workingDays)} hint={`از ${formatNumber(Math.min(days, 31))} روز`} />
            <Stat label="میانگین روزهای کاری" value={formatMinutes(workingDays ? Math.round(data.total / workingDays) : 0)} />
            <Stat label="تسک‌های کارشده" value={formatNumber(data.tasks.length)} />
          </div>

          {days > 1 ? (
            <Card title="کارکرد روزانه">
              <div className="flex h-40 items-end gap-1">
                {data.days.map((d) => (
                  <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end" title={`${d.label}: ${formatMinutes(d.minutes)}`}>
                    <div
                      className="w-full rounded-t bg-[var(--color-brand-600)] opacity-80 transition group-hover:opacity-100"
                      style={{ height: `${(d.minutes / maxDay) * 100}%`, minHeight: d.minutes ? 3 : 0 }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between text-[10px] muted">
                <span>{data.days[0]?.label}</span>
                <span>{data.days[data.days.length - 1]?.label}</span>
              </div>
            </Card>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            {employer && user === 'all' ? (
              <Card title="به تفکیک افراد" bodyClassName="p-0">
                {data.users.length ? (
                  <ul className="divide-y">
                    {data.users.map((u) => (
                      <li key={u.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                        <button onClick={() => setUser(u.id)} className="font-semibold hover:text-[var(--color-brand-600)]">
                          {u.name}
                        </button>
                        <span className="tabular font-bold">{formatMinutes(u.minutes)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-8 text-center text-xs muted">کارکردی ثبت نشده است.</p>
                )}
              </Card>
            ) : null}
            <Card title="به تفکیک تسک" bodyClassName="p-0">
              {data.tasks.length ? (
                <ul className="divide-y">
                  {data.tasks.map((t) => (
                    <li key={t.number} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                      <Link href={panel.detail(t.number)} className="min-w-0 truncate hover:text-[var(--color-brand-600)]">
                        #{formatNumber(t.number)} {t.title}
                      </Link>
                      <span className="tabular shrink-0 font-bold">{formatMinutes(t.minutes)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-8 text-center text-xs muted">کارکردی ثبت نشده است.</p>
              )}
            </Card>
          </div>

          <Card title="ریز کارکردها" bodyClassName="p-0">
            {data.items.length ? (
              <div className="scroll-x">
                <table className="table table-cards">
                  <thead>
                    <tr>
                      <th>زمان</th>
                      {employer ? <th>نفر</th> : null}
                      <th>تسک</th>
                      <th>مدت</th>
                      <th>توضیح</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((l) => (
                      <tr key={l.id}>
                        <td data-label="زمان" className="whitespace-nowrap text-xs muted">
                          {faDateTime(l.endedAt ?? l.startedAt)}
                        </td>
                        {employer ? (
                          <td data-label="نفر" className="whitespace-nowrap text-xs">
                            {personName(l.user)}
                          </td>
                        ) : null}
                        <td data-label="تسک" className="max-w-xs text-xs">
                          <Link href={panel.detail(l.task.number)} className="block truncate hover:text-[var(--color-brand-600)]">
                            #{formatNumber(l.task.number)} {l.task.title}
                          </Link>
                        </td>
                        <td data-label="مدت" className="whitespace-nowrap text-xs font-bold">
                          {l.endedAt ? (
                            formatMinutes(l.minutes)
                          ) : (
                            <span className="text-emerald-600">● در حال کار</span>
                          )}
                          {l.manual ? <span className="mr-1 font-normal muted">(دستی)</span> : null}
                        </td>
                        <td data-label="توضیح" className="max-w-xs text-xs muted">
                          {l.note ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={<Timer size={32} />}
                title="در این بازه کارکردی ثبت نشده است"
                description="کارکرد با «شروع زمان‌سنج» یا «ثبت دستی کارکرد» در صفحه هر تسک ثبت می‌شود."
              />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
