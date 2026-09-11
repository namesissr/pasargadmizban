'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Search, RefreshCw, PauseCircle, PlayCircle, Trash2 } from 'lucide-react';
import { Badge, Button, Card, ConfirmModal, Input, LoadingBlock, Pagination, Select, CopyButton } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiPost, errorMessage, fetcher } from '@/lib/client';
import { formatToman, formatNumber } from '@/lib/money';
import { faDate, faRelative, SERVER_STATUS_FA, cn } from '@/lib/utils';

type Row = {
  id: string;
  name: string;
  status: string;
  serverTypeName: string;
  locationName: string;
  ipv4: string | null;
  billingCycle: string;
  priceHourly: number;
  priceMonthly: number;
  createdAt: string;
  expiresAt: string | null;
  suspendedAt: string | null;
  user: { id: string; email: string; firstName: string | null; lastName: string | null };
};

type Response = {
  items: Row[];
  meta: { total: number; page: number; totalPages: number };
  byStatus: { status: string; count: number }[];
};

export function AdminServersTable() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ALL');
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState(false);

  const key = `/api/admin/servers?page=${page}&q=${encodeURIComponent(q)}&status=${status}`;
  const { data, isLoading, mutate } = useSWR<Response>(key, fetcher, { refreshInterval: 30_000 });

  async function act(serverId: string, action: 'suspend' | 'unsuspend' | 'sync', reason?: string) {
    setBusy(serverId + action);
    try {
      const res = await apiPost<{ message: string }>(`/api/admin/servers/${serverId}`, { action, reason });
      toast.success(res.message);
      mutate();
    } catch (err) {
      toast.error('عملیات انجام نشد', errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function destroy() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiPost<{ message: string }>(`/api/admin/servers/${deleteTarget.id}`, {
        action: 'delete',
        reason: 'حذف توسط مدیر سیستم.',
        refund: false,
      });
      toast.success(res.message);
      setDeleteTarget(null);
      mutate();
    } catch (err) {
      toast.error('حذف انجام نشد', errorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      {data?.byStatus.length ? (
        <div className="flex flex-wrap gap-2">
          {data.byStatus.map((s) => {
            const st = SERVER_STATUS_FA[s.status] ?? { label: s.status, tone: 'muted' as const };
            return (
              <button
                key={s.status}
                onClick={() => {
                  setStatus(s.status);
                  setPage(1);
                }}
                className={cn(
                  'rounded-xl border px-3 py-2 text-xs transition',
                  status === s.status ? 'border-[var(--color-brand-500)]' : 'hover:bg-[var(--surface-2)]',
                )}
              >
                <span className="muted">{st.label}</span>
                <span className="tabular mr-2 font-bold">{formatNumber(s.count)}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <Card
        title={data ? `${formatNumber(data.meta.total)} سرور` : 'سرورها'}
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
                placeholder="نام، IP یا ایمیل"
                className="w-44 pr-8 text-xs"
              />
            </div>
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="w-36 text-xs"
            >
              <option value="ALL">همه وضعیت‌ها</option>
              {Object.entries(SERVER_STATUS_FA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
            <Button variant="secondary" size="sm" onClick={() => mutate()} icon={<RefreshCw size={13} />}>
              بروزرسانی
            </Button>
          </div>
        }
        bodyClassName="p-0"
      >
        {isLoading && !data ? (
          <LoadingBlock />
        ) : !data?.items.length ? (
          <p className="py-12 text-center text-xs muted">سروری با این فیلترها پیدا نشد.</p>
        ) : (
          <>
            <div className="scroll-x">
              <table className="table table-cards">
                <thead>
                  <tr>
                    <th>سرور</th>
                    <th>مالک</th>
                    <th>پلن</th>
                    <th>IP</th>
                    <th>وضعیت</th>
                    <th>هزینه</th>
                    <th>ساخت</th>
                    <th className="text-left">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((s) => {
                    const st = SERVER_STATUS_FA[s.status] ?? { label: s.status, tone: 'muted' as const };
                    const ownerName =
                      [s.user.firstName, s.user.lastName].filter(Boolean).join(' ') || s.user.email;
                    return (
                      <tr key={s.id}>
                        <td data-label="سرور">
                          <div className="text-xs font-semibold">{s.name}</div>
                          <div className="mt-0.5 text-[10px] uppercase muted">{s.locationName}</div>
                        </td>
                        <td data-label="مالک" className="max-w-40">
                          <Link
                            href={`/admin/users/${s.user.id}`}
                            className="block truncate text-xs hover:text-[var(--color-brand-600)]"
                          >
                            {ownerName}
                          </Link>
                          <div className="ltr truncate text-[10px] muted">{s.user.email}</div>
                        </td>
                        <td data-label="پلن" className="text-xs uppercase muted">{s.serverTypeName}</td>
                        <td data-label="IP" className="mono ltr text-[11px]">
                          {s.ipv4 ? (
                            <span className="flex items-center gap-1">
                              {s.ipv4}
                              <CopyButton value={s.ipv4} size={11} />
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td data-label="وضعیت">
                          <Badge tone={st.tone}>{st.label}</Badge>
                        </td>
                        <td data-label="هزینه" className="tabular whitespace-nowrap text-xs">
                          {s.billingCycle === 'HOURLY'
                            ? `${formatToman(s.priceHourly, { suffix: false })}/س`
                            : `${formatToman(s.priceMonthly, { suffix: false })}/م`}
                          {s.expiresAt ? (
                            <div className="mt-0.5 text-[10px] muted">{faRelative(s.expiresAt)}</div>
                          ) : null}
                        </td>
                        <td data-label="ساخت" className="whitespace-nowrap text-xs muted">{faDate(s.createdAt)}</td>
                        <td data-label="عملیات">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => act(s.id, 'sync')}
                              disabled={busy === s.id + 'sync'}
                              title="همگام‌سازی با هتزنر"
                              className="rounded-lg p-1.5 muted transition hover:text-[var(--color-brand-600)] disabled:opacity-40"
                            >
                              <RefreshCw size={13} className={busy === s.id + 'sync' ? 'spin' : ''} />
                            </button>
                            {s.status === 'SUSPENDED' ? (
                              <button
                                onClick={() => act(s.id, 'unsuspend')}
                                disabled={busy === s.id + 'unsuspend'}
                                title="رفع تعلیق"
                                className="rounded-lg p-1.5 muted transition hover:text-emerald-600 disabled:opacity-40"
                              >
                                <PlayCircle size={14} />
                              </button>
                            ) : (
                              <button
                                onClick={() => act(s.id, 'suspend', 'تعلیق توسط مدیر سیستم.')}
                                disabled={busy === s.id + 'suspend' || s.status === 'DELETED'}
                                title="تعلیق"
                                className="rounded-lg p-1.5 muted transition hover:text-amber-600 disabled:opacity-40"
                              >
                                <PauseCircle size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => setDeleteTarget(s)}
                              disabled={s.status === 'DELETED'}
                              title="حذف سرور"
                              className="rounded-lg p-1.5 muted transition hover:text-red-500 disabled:opacity-40"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
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

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={destroy}
        loading={deleting}
        title="حذف سرور توسط مدیر"
        confirmLabel="حذف کن"
        requireText={deleteTarget?.name}
        message={
          <>
            سرور «<b>{deleteTarget?.name}</b>» متعلق به <b>{deleteTarget?.user.email}</b> برای همیشه حذف می‌شود و
            تمام داده‌های آن از بین می‌رود.
          </>
        }
      />
    </div>
  );
}
