'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Search, ExternalLink } from 'lucide-react';
import { Badge, Card, Input, LoadingBlock, Pagination, Select } from '@/components/ui';
import { fetcher } from '@/lib/client';
import { formatToman, formatNumber } from '@/lib/money';
import { faDate, faRelative, ROLE_FA, USER_STATUS_FA } from '@/lib/utils';

type Row = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: string;
  status: string;
  balance: number;
  discountPct: number;
  createdAt: string;
  lastLoginAt: string | null;
  emailVerifiedAt: string | null;
  _count: { servers: number; tickets: number };
};

type Response = { items: Row[]; meta: { total: number; page: number; totalPages: number } };

export function UsersTable() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ALL');
  const [role, setRole] = useState('ALL');

  const { data, isLoading } = useSWR<Response>(
    `/api/admin/users?page=${page}&q=${encodeURIComponent(q)}&status=${status}&role=${role}`,
    fetcher,
  );

  return (
    <Card
      title={data ? `${formatNumber(data.meta.total)} کاربر` : 'کاربران'}
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
              placeholder="ایمیل، نام یا موبایل"
              className="w-48 pr-8 text-xs"
            />
          </div>
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="w-32 text-xs"
          >
            <option value="ALL">همه وضعیت‌ها</option>
            {Object.entries(USER_STATUS_FA).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
          <Select
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
            className="w-28 text-xs"
          >
            <option value="ALL">همه نقش‌ها</option>
            {Object.entries(ROLE_FA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
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
        <p className="py-12 text-center text-xs muted">کاربری با این فیلترها پیدا نشد.</p>
      ) : (
        <>
          <div className="scroll-x">
            <table className="table table-cards">
              <thead>
                <tr>
                  <th>کاربر</th>
                  <th>نقش</th>
                  <th>وضعیت</th>
                  <th>موجودی</th>
                  <th>سرورها</th>
                  <th>عضویت</th>
                  <th>آخرین ورود</th>
                  <th className="text-left">مدیریت</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((u) => {
                  const st = USER_STATUS_FA[u.status] ?? { label: u.status, tone: 'muted' as const };
                  const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || '—';
                  return (
                    <tr key={u.id}>
                      <td data-label="کاربر">
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="text-xs font-semibold hover:text-[var(--color-brand-600)]"
                        >
                          {name}
                        </Link>
                        <div className="ltr mt-0.5 text-[11px] muted">{u.email}</div>
                        {u.phone ? <div className="ltr text-[10px] muted">{u.phone}</div> : null}
                      </td>
                      <td data-label="نقش" className="whitespace-nowrap text-xs muted">{ROLE_FA[u.role] ?? u.role}</td>
                      <td data-label="وضعیت">
                        <Badge tone={st.tone}>{st.label}</Badge>
                        {!u.emailVerifiedAt ? (
                          <div className="mt-1 text-[10px] text-amber-600">ایمیل تایید نشده</div>
                        ) : null}
                      </td>
                      <td data-label="موجودی" className="tabular whitespace-nowrap text-xs font-bold">
                        {formatToman(u.balance, { suffix: false })}
                        {u.discountPct > 0 ? (
                          <div className="mt-0.5 text-[10px] text-emerald-600">
                            تخفیف {formatNumber(u.discountPct)}٪
                          </div>
                        ) : null}
                      </td>
                      <td data-label="سرورها" className="tabular text-xs">
                        {formatNumber(u._count.servers)}
                        <span className="mr-1 text-[10px] muted">سرور</span>
                      </td>
                      <td data-label="عضویت" className="whitespace-nowrap text-xs muted">{faDate(u.createdAt)}</td>
                      <td data-label="آخرین ورود" className="whitespace-nowrap text-xs muted">
                        {u.lastLoginAt ? faRelative(u.lastLoginAt) : '—'}
                      </td>
                      <td data-label="مدیریت" className="text-left">
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="inline-block rounded-lg p-1.5 muted transition hover:text-[var(--color-brand-600)]"
                          aria-label="مدیریت کاربر"
                        >
                          <ExternalLink size={14} />
                        </Link>
                      </td>
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
  );
}
