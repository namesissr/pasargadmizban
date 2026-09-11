'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { Search, CheckCircle2, XCircle, RotateCw } from 'lucide-react';
import { Badge, Button, Card, Input, LoadingBlock, Modal, Pagination, Select, Field, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiPost, errorMessage, fetcher } from '@/lib/client';
import { formatToman, formatNumber } from '@/lib/money';
import { faDateTime, TX_STATUS_FA, TX_TYPE_FA, cn } from '@/lib/utils';

type Row = {
  id: string;
  ref: string;
  type: string;
  direction: string;
  amount: number;
  status: string;
  gateway: string | null;
  gatewayRefId: string | null;
  trackId: string | null;
  cardNumber: string | null;
  description: string | null;
  createdAt: string;
  paidAt: string | null;
  user: { id: string; email: string; firstName: string | null; lastName: string | null };
  server: { id: string; name: string } | null;
};

type Response = {
  items: Row[];
  meta: { total: number; page: number; totalPages: number };
  summary: { type: string; total: number; count: number }[];
};

function TransactionsInner() {
  const toast = useToast();
  const params = useSearchParams();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(params.get('status') ?? 'ALL');
  const [type, setType] = useState('ALL');
  const [gateway, setGateway] = useState(params.get('gateway') ?? 'ALL');

  const [target, setTarget] = useState<Row | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const key = `/api/admin/transactions?page=${page}&q=${encodeURIComponent(q)}&status=${status}&type=${type}&gateway=${gateway}`;
  const { data, isLoading, mutate } = useSWR<Response>(key, fetcher, { refreshInterval: 45_000 });

  async function act(trx: Row, action: 'approve' | 'reject' | 'reverify') {
    setBusy(action);
    try {
      const res = await apiPost<{ message: string }>(`/api/admin/transactions/${trx.id}`, { action, reason });
      toast.success(res.message);
      setTarget(null);
      setReason('');
      mutate();
    } catch (err) {
      toast.error('عملیات انجام نشد', errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {data?.summary.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {data.summary.map((s) => (
            <div key={s.type} className="card p-4">
              <div className="text-xs muted">{TX_TYPE_FA[s.type] ?? s.type}</div>
              <div className="tabular mt-1.5 text-base font-bold">{formatToman(s.total)}</div>
              <div className="mt-1 text-[11px] muted">{formatNumber(s.count)} تراکنش موفق</div>
            </div>
          ))}
        </div>
      ) : null}

      <Card
        title={data ? `${formatNumber(data.meta.total)} تراکنش` : 'تراکنش‌ها'}
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
                placeholder="کد پیگیری یا ایمیل"
                className="w-44 pr-8 text-xs"
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
              {Object.entries(TX_STATUS_FA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
            <Select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPage(1);
              }}
              className="w-32 text-xs"
            >
              <option value="ALL">همه انواع</option>
              {Object.entries(TX_TYPE_FA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <Select
              value={gateway}
              onChange={(e) => {
                setGateway(e.target.value);
                setPage(1);
              }}
              className="w-28 text-xs"
            >
              <option value="ALL">همه درگاه‌ها</option>
              <option value="zibal">زیبال</option>
              <option value="manual">واریز دستی</option>
            </Select>
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
                    <th>کاربر</th>
                    <th>شرح</th>
                    <th>مبلغ</th>
                    <th>درگاه</th>
                    <th>وضعیت</th>
                    <th>تاریخ</th>
                    <th className="text-left">اقدام</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((t) => {
                    const st = TX_STATUS_FA[t.status] ?? { label: t.status, tone: 'muted' as const };
                    const name = [t.user.firstName, t.user.lastName].filter(Boolean).join(' ') || t.user.email;
                    const pending = t.status === 'PENDING' && t.direction === 'CREDIT';
                    return (
                      <tr key={t.id}>
                        <td data-label="کاربر" className="max-w-40">
                          <Link
                            href={`/admin/users/${t.user.id}`}
                            className="block truncate text-xs font-semibold hover:text-[var(--color-brand-600)]"
                          >
                            {name}
                          </Link>
                          <div className="ltr truncate text-[10px] muted">{t.user.email}</div>
                        </td>
                        <td data-label="شرح" className="max-w-56">
                          <div className="truncate text-xs">{t.description ?? '—'}</div>
                          <div className="mono ltr mt-0.5 text-[10px] muted">
                            {t.trackId ? `کد: ${t.trackId}` : t.ref}
                          </div>
                        </td>
                        <td data-label="مبلغ"
                          className={cn(
                            'tabular whitespace-nowrap text-xs font-bold',
                            t.direction === 'CREDIT' ? 'text-emerald-600' : 'text-red-500',
                          )}
                        >
                          {t.direction === 'CREDIT' ? '+' : '−'}
                          {formatToman(t.amount, { suffix: false })}
                        </td>
                        <td data-label="درگاه" className="whitespace-nowrap text-xs muted">
                          {t.gateway === 'manual' ? 'واریز دستی' : t.gateway === 'zibal' ? 'زیبال' : t.gateway ?? '—'}
                        </td>
                        <td data-label="وضعیت">
                          <Badge tone={st.tone}>{st.label}</Badge>
                        </td>
                        <td data-label="تاریخ" className="whitespace-nowrap text-xs muted">{faDateTime(t.createdAt)}</td>
                        <td data-label="اقدام" className="text-left">
                          {pending ? (
                            <Button variant="secondary" size="sm" onClick={() => setTarget(t)}>
                              بررسی
                            </Button>
                          ) : (
                            <span className="text-[10px] muted">—</span>
                          )}
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

      <Modal
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title="بررسی تراکنش در انتظار"
        description={target ? `${target.user.email} — ${formatToman(target.amount)}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(null)} disabled={Boolean(busy)}>
              بستن
            </Button>
            <Button
              variant="danger"
              onClick={() => target && act(target, 'reject')}
              loading={busy === 'reject'}
              icon={<XCircle size={14} />}
            >
              رد کردن
            </Button>
            <Button
              onClick={() => target && act(target, 'approve')}
              loading={busy === 'approve'}
              icon={<CheckCircle2 size={14} />}
            >
              تایید و شارژ
            </Button>
          </>
        }
      >
        {target ? (
          <div className="space-y-4">
            <dl className="space-y-2 text-xs">
              <Row label="مبلغ" value={formatToman(target.amount)} />
              <Row label="درگاه" value={target.gateway === 'manual' ? 'واریز دستی' : target.gateway ?? '—'} />
              <Row label="شماره پیگیری" value={target.trackId ?? '—'} ltr />
              <Row label="کارت مبدأ" value={target.cardNumber ?? '—'} ltr />
              <Row label="تاریخ ثبت" value={faDateTime(target.createdAt)} />
            </dl>

            {target.gateway && target.gateway !== 'manual' ? (
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => act(target, 'reverify')}
                loading={busy === 'reverify'}
                icon={<RotateCw size={14} />}
              >
                استعلام مجدد از درگاه
              </Button>
            ) : null}

            <Field label="توضیح (در صورت رد کردن الزامی است)">
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="min-h-20 text-xs"
                placeholder="مثلاً: رسید با مبلغ اعلامی هم‌خوانی ندارد."
              />
            </Field>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function Row({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex justify-between gap-2 border-b pb-2">
      <dt className="muted">{label}</dt>
      <dd className={ltr ? 'ltr' : ''}>{value}</dd>
    </div>
  );
}

export function AdminTransactions() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <TransactionsInner />
    </Suspense>
  );
}
