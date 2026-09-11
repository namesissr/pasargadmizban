'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { ArrowDownLeft, ArrowUpRight, Download } from 'lucide-react';
import { Badge, Button, Card, LoadingBlock, Pagination, Select, Stat } from '@/components/ui';
import { fetcher } from '@/lib/client';
import { formatToman, formatNumber } from '@/lib/money';
import { faDateTime, TX_STATUS_FA, TX_TYPE_FA, cn } from '@/lib/utils';

type Tx = {
  id: string;
  ref: string;
  type: string;
  direction: string;
  amount: number;
  balanceAfter: number;
  status: string;
  gateway: string | null;
  gatewayRefId: string | null;
  description: string | null;
  createdAt: string;
  server: { id: string; name: string } | null;
};

type Response = {
  items: Tx[];
  meta: { total: number; page: number; totalPages: number };
  totals: { credit: number; debit: number };
};

export function TransactionList() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState('ALL');
  const [status, setStatus] = useState('ALL');

  const { data, isLoading } = useSWR<Response>(
    `/api/transactions?page=${page}&type=${type}&status=${status}`,
    fetcher,
  );

  function exportCsv() {
    if (!data?.items.length) return;
    const header = ['کد پیگیری', 'شرح', 'نوع', 'جهت', 'مبلغ', 'موجودی پس از تراکنش', 'وضعیت', 'تاریخ'];
    const rows = data.items.map((t) => [
      t.ref,
      (t.description ?? '').replace(/"/g, '""'),
      TX_TYPE_FA[t.type] ?? t.type,
      t.direction === 'CREDIT' ? 'واریز' : 'برداشت',
      t.amount,
      t.balanceAfter,
      TX_STATUS_FA[t.status]?.label ?? t.status,
      faDateTime(t.createdAt),
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      {data ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="مجموع واریز"
            value={formatToman(data.totals.credit)}
            icon={<ArrowDownLeft size={16} />}
            tone="ok"
          />
          <Stat
            label="مجموع برداشت"
            value={formatToman(data.totals.debit)}
            icon={<ArrowUpRight size={16} />}
          />
          <Stat label="تعداد تراکنش" value={formatNumber(data.meta.total)} />
        </div>
      ) : null}

      <Card
        title="تراکنش‌ها"
        action={
          <div className="flex flex-wrap gap-2">
            <Select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPage(1);
              }}
              className="w-36 text-xs"
            >
              <option value="ALL">همه انواع</option>
              {Object.entries(TX_TYPE_FA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="w-32 text-xs"
            >
              <option value="ALL">همه وضعیت‌ها</option>
              {Object.entries(TX_STATUS_FA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
            <Button variant="secondary" size="sm" onClick={exportCsv} icon={<Download size={13} />}>
              خروجی CSV
            </Button>
          </div>
        }
        bodyClassName="p-0"
      >
        {isLoading && !data ? (
          <LoadingBlock />
        ) : !data?.items.length ? (
          <p className="py-12 text-center text-xs muted">تراکنشی با این فیلترها پیدا نشد.</p>
        ) : (
          <>
            <div className="scroll-x">
              <table className="table table-cards">
                <thead>
                  <tr>
                    <th>شرح</th>
                    <th>نوع</th>
                    <th>مبلغ</th>
                    <th>موجودی پس از تراکنش</th>
                    <th>وضعیت</th>
                    <th>تاریخ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((t) => {
                    const st = TX_STATUS_FA[t.status] ?? { label: t.status, tone: 'muted' as const };
                    return (
                      <tr key={t.id}>
                        <td data-label="شرح" className="max-w-xs">
                          <div className="truncate text-xs">{t.description ?? '—'}</div>
                          <div className="mono ltr mt-0.5 text-[10px] muted">{t.ref}</div>
                        </td>
                        <td data-label="نوع" className="whitespace-nowrap text-xs muted">{TX_TYPE_FA[t.type] ?? t.type}</td>
                        <td data-label="مبلغ"
                          className={cn(
                            'tabular whitespace-nowrap text-xs font-bold',
                            t.direction === 'CREDIT' ? 'text-emerald-600' : 'text-red-500',
                          )}
                        >
                          {t.direction === 'CREDIT' ? '+' : '−'}
                          {formatToman(t.amount, { suffix: false })}
                        </td>
                        <td data-label="موجودی پس از تراکنش" className="tabular whitespace-nowrap text-xs muted">
                          {formatToman(t.balanceAfter, { suffix: false })}
                        </td>
                        <td data-label="وضعیت">
                          <Badge tone={st.tone}>{st.label}</Badge>
                        </td>
                        <td data-label="تاریخ" className="whitespace-nowrap text-xs muted">{faDateTime(t.createdAt)}</td>
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
