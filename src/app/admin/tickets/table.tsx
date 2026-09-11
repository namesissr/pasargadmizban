'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Search } from 'lucide-react';
import { Badge, Card, Input, LoadingBlock, Pagination, Select } from '@/components/ui';
import { fetcher } from '@/lib/client';
import { formatNumber } from '@/lib/money';
import { faRelative, TICKET_PRIORITY_FA, TICKET_STATUS_FA, cn } from '@/lib/utils';

type Row = {
  id: string;
  number: number;
  subject: string;
  status: string;
  priority: string;
  lastReplyAt: string;
  unreadByStaff: boolean;
  user: { id: string; email: string; firstName: string | null; lastName: string | null };
  department: { name: string } | null;
  server: { id: string; name: string } | null;
  _count: { messages: number };
};

type Response = {
  items: Row[];
  meta: { total: number; page: number; totalPages: number };
  counts: { status: string; count: number }[];
  unread: number;
};

export function AdminTicketsTable() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ALL');
  const [priority, setPriority] = useState('ALL');

  const key = `/api/admin/tickets?page=${page}&q=${encodeURIComponent(q)}&status=${status}&priority=${priority}`;
  const { data, isLoading } = useSWR<Response>(key, fetcher, { refreshInterval: 30_000 });

  return (
    <div className="space-y-5">
      {data?.counts.length ? (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setStatus('ALL');
              setPage(1);
            }}
            className={cn(
              'rounded-xl border px-3 py-2 text-xs transition',
              status === 'ALL' ? 'border-[var(--color-brand-500)]' : 'hover:bg-[var(--surface-2)]',
            )}
          >
            <span className="muted">همه</span>
            <span className="tabular mr-2 font-bold">{formatNumber(data.meta.total)}</span>
          </button>
          {data.counts.map((c) => {
            const st = TICKET_STATUS_FA[c.status] ?? { label: c.status, tone: 'muted' as const };
            return (
              <button
                key={c.status}
                onClick={() => {
                  setStatus(c.status);
                  setPage(1);
                }}
                className={cn(
                  'rounded-xl border px-3 py-2 text-xs transition',
                  status === c.status ? 'border-[var(--color-brand-500)]' : 'hover:bg-[var(--surface-2)]',
                )}
              >
                <span className="muted">{st.label}</span>
                <span className="tabular mr-2 font-bold">{formatNumber(c.count)}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <Card
        title={data?.unread ? `${formatNumber(data.unread)} تیکت خوانده‌نشده` : 'تیکت‌ها'}
        action={
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 muted" />
              <Input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="موضوع یا ایمیل"
                className="w-44 pr-8 text-xs"
              />
            </div>
            <Select
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value);
                setPage(1);
              }}
              className="w-32 text-xs"
            >
              <option value="ALL">همه اولویت‌ها</option>
              {Object.entries(TICKET_PRIORITY_FA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          </div>
        }
        bodyClassName="p-0"
      >
        {isLoading && !data ? (
          <LoadingBlock />
        ) : !data?.items.length ? (
          <p className="py-12 text-center text-xs muted">تیکتی با این فیلترها پیدا نشد.</p>
        ) : (
          <>
            <div className="scroll-x">
              <table className="table table-cards">
                <thead>
                  <tr>
                    <th>شماره</th>
                    <th>موضوع</th>
                    <th>کاربر</th>
                    <th>بخش</th>
                    <th>اولویت</th>
                    <th>وضعیت</th>
                    <th>آخرین فعالیت</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((t) => {
                    const st = TICKET_STATUS_FA[t.status] ?? { label: t.status, tone: 'muted' as const };
                    const pr = TICKET_PRIORITY_FA[t.priority] ?? { label: t.priority, tone: 'muted' as const };
                    const name = [t.user.firstName, t.user.lastName].filter(Boolean).join(' ') || t.user.email;
                    return (
                      <tr key={t.id} className={t.unreadByStaff ? 'font-semibold' : ''}>
                        <td data-label="شماره" className="tabular text-xs">
                          {t.unreadByStaff ? (
                            <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-red-500 align-middle" />
                          ) : null}
                          {formatNumber(t.number)}
                        </td>
                        <td data-label="موضوع" className="max-w-xs">
                          <Link
                            href={`/admin/tickets/${t.id}`}
                            className="block truncate text-xs hover:text-[var(--color-brand-600)]"
                          >
                            {t.subject}
                          </Link>
                          <div className="mt-0.5 text-[10px] font-normal muted">
                            {formatNumber(t._count.messages)} پیام
                            {t.server ? ` · سرور ${t.server.name}` : ''}
                          </div>
                        </td>
                        <td data-label="کاربر" className="max-w-36">
                          <Link
                            href={`/admin/users/${t.user.id}`}
                            className="block truncate text-xs font-normal hover:text-[var(--color-brand-600)]"
                          >
                            {name}
                          </Link>
                        </td>
                        <td data-label="بخش" className="whitespace-nowrap text-xs font-normal muted">{t.department?.name ?? '—'}</td>
                        <td data-label="اولویت">
                          <Badge tone={pr.tone}>{pr.label}</Badge>
                        </td>
                        <td data-label="وضعیت">
                          <Badge tone={st.tone}>{st.label}</Badge>
                        </td>
                        <td data-label="آخرین فعالیت" className="whitespace-nowrap text-xs font-normal muted">{faRelative(t.lastReplyAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={data.meta.page} totalPages={data.meta.totalPages} onChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
