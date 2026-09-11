'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Search, RefreshCw, Power, PowerOff, RotateCw, ExternalLink } from 'lucide-react';
import { Badge, Button, Card, Input, LoadingBlock, Pagination, Select, CopyButton } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiPost, errorMessage, fetcher } from '@/lib/client';
import { formatToman, formatNumber } from '@/lib/money';
import { faRelative, SERVER_STATUS_FA, cn } from '@/lib/utils';

type Row = {
  id: string;
  name: string;
  label: string | null;
  status: string;
  hetznerStatus: string | null;
  serverTypeName: string;
  locationName: string;
  imageLabel: string | null;
  ipv4: string | null;
  ipv6: string | null;
  cores: number;
  memory: number;
  disk: number;
  billingCycle: 'HOURLY' | 'MONTHLY';
  priceHourly: number;
  priceMonthly: number;
  backupsEnabled: boolean;
  expiresAt: string | null;
  createdAt: string;
  suspendedAt: string | null;
};

type Response = { items: Row[]; meta: { total: number; page: number; totalPages: number } };

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'همه وضعیت‌ها' },
  { value: 'RUNNING', label: 'روشن' },
  { value: 'OFF', label: 'خاموش' },
  { value: 'PROVISIONING', label: 'در حال ساخت' },
  { value: 'SUSPENDED', label: 'تعلیق‌شده' },
  { value: 'ERROR', label: 'خطا' },
];

export function ServerList() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('ALL');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const key = `/api/servers?page=${page}&status=${status}&q=${encodeURIComponent(q)}`;
  const { data, isLoading, mutate } = useSWR<Response>(key, fetcher, { refreshInterval: 20_000 });

  async function act(serverId: string, action: 'poweron' | 'poweroff' | 'reboot') {
    setBusy(serverId + action);
    try {
      const res = await apiPost<{ message: string }>(`/api/servers/${serverId}/actions`, { action });
      toast.success(res.message);
      setTimeout(() => mutate(), 1500);
    } catch (err) {
      toast.error('عملیات انجام نشد', errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      title={data ? `${formatNumber(data.meta.total)} سرور` : 'سرورها'}
      action={
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 muted" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="جستجو نام یا IP"
              className="w-full pr-8 text-xs sm:w-40"
            />
          </div>
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="w-full text-xs sm:w-36"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => mutate()}
            icon={<RefreshCw size={13} />}
            className="shrink-0"
          >
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
          {/* نسخه گوشی: هر سرور یک کارت مستقل */}
          <div className="space-y-2.5 p-3 md:hidden">
            {data.items.map((s) => (
              <ServerCard key={s.id} server={s} busy={busy} onAction={act} />
            ))}
          </div>

          <div className="scroll-x hidden md:block">
            <table className="table">
              <thead>
                <tr>
                  <th>سرور</th>
                  <th>مشخصات</th>
                  <th>شبکه</th>
                  <th>وضعیت</th>
                  <th>صورتحساب</th>
                  <th className="text-left">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => {
                  const st = SERVER_STATUS_FA[s.status] ?? { label: s.status, tone: 'muted' as const };
                  const running = s.status === 'RUNNING';
                  const busyKey = (a: string) => busy === s.id + a;
                  const locked = ['PROVISIONING', 'DELETING', 'REBUILDING', 'MIGRATING'].includes(s.status);

                  return (
                    <tr key={s.id}>
                      <td>
                        <Link
                          href={`/dashboard/servers/${s.id}`}
                          className="font-semibold hover:text-[var(--color-brand-600)]"
                        >
                          {s.name}
                        </Link>
                        {s.label ? <div className="mt-0.5 text-[11px] muted">{s.label}</div> : null}
                        <div className="mt-0.5 text-[11px] muted">
                          {s.locationName.toUpperCase()} · {s.imageLabel ?? '—'}
                        </div>
                      </td>
                      <td className="text-xs muted">
                        <div className="uppercase">{s.serverTypeName}</div>
                        <div className="tabular mt-0.5">
                          {formatNumber(s.cores)} هسته · {formatNumber(s.memory)} گیگ · {formatNumber(s.disk)} گیگ
                        </div>
                      </td>
                      <td className="text-xs">
                        {s.ipv4 ? (
                          <span className="mono ltr flex items-center gap-1">
                            {s.ipv4}
                            <CopyButton value={s.ipv4} size={12} />
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                        {s.ipv6 ? <div className="mono ltr mt-0.5 truncate text-[10px] muted">{s.ipv6}</div> : null}
                      </td>
                      <td>
                        <Badge tone={st.tone}>
                          <span
                            className={cn(
                              'h-1.5 w-1.5 rounded-full',
                              running ? 'bg-emerald-500' : st.tone === 'bad' ? 'bg-red-500' : 'bg-current opacity-60',
                              s.status === 'PROVISIONING' && 'pulse-soft',
                            )}
                          />
                          {st.label}
                        </Badge>
                        {s.backupsEnabled ? <div className="mt-1 text-[10px] muted">بکاپ فعال</div> : null}
                      </td>
                      <td className="tabular whitespace-nowrap text-xs">
                        {s.billingCycle === 'HOURLY' ? (
                          <>
                            <div>{formatToman(s.priceHourly, { suffix: false })} / ساعت</div>
                            <div className="mt-0.5 text-[10px] muted">
                              سقف {formatToman(s.priceMonthly, { suffix: false })} در ماه
                            </div>
                          </>
                        ) : (
                          <>
                            <div>{formatToman(s.priceMonthly, { suffix: false })} / ماه</div>
                            {s.expiresAt ? (
                              <div className="mt-0.5 text-[10px] muted">سررسید {faRelative(s.expiresAt)}</div>
                            ) : null}
                          </>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          {running ? (
                            <>
                              <IconBtn
                                title="راه‌اندازی مجدد"
                                onClick={() => act(s.id, 'reboot')}
                                loading={busyKey('reboot')}
                                disabled={locked}
                              >
                                <RotateCw size={14} />
                              </IconBtn>
                              <IconBtn
                                title="خاموش کردن"
                                onClick={() => act(s.id, 'poweroff')}
                                loading={busyKey('poweroff')}
                                disabled={locked}
                                danger
                              >
                                <PowerOff size={14} />
                              </IconBtn>
                            </>
                          ) : (
                            <IconBtn
                              title="روشن کردن"
                              onClick={() => act(s.id, 'poweron')}
                              loading={busyKey('poweron')}
                              disabled={locked || s.status === 'SUSPENDED'}
                            >
                              <Power size={14} />
                            </IconBtn>
                          )}
                          <Link
                            href={`/dashboard/servers/${s.id}`}
                            title="مدیریت"
                            className="rounded-lg p-1.5 muted transition hover:text-[var(--color-brand-600)]"
                          >
                            <ExternalLink size={14} />
                          </Link>
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
  );
}

/** کارت سرور برای صفحه‌های باریک — همه اطلاعات مهم بدون اسکرول افقی */
function ServerCard({
  server: s,
  busy,
  onAction,
}: {
  server: Row;
  busy: string | null;
  onAction: (id: string, action: 'poweron' | 'poweroff' | 'reboot') => void;
}) {
  const st = SERVER_STATUS_FA[s.status] ?? { label: s.status, tone: 'muted' as const };
  const running = s.status === 'RUNNING';
  const locked = ['PROVISIONING', 'DELETING', 'REBUILDING', 'MIGRATING'].includes(s.status);
  const busyKey = (a: string) => busy === s.id + a;

  return (
    <div className="rounded-xl border p-3.5">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/dashboard/servers/${s.id}`} className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{s.name}</div>
          <div className="mt-0.5 truncate text-[11px] muted">
            {s.locationName.toUpperCase()} · {s.imageLabel ?? '—'} · {s.serverTypeName.toUpperCase()}
          </div>
        </Link>
        <Badge tone={st.tone}>
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              running ? 'bg-emerald-500' : st.tone === 'bad' ? 'bg-red-500' : 'bg-current opacity-60',
              s.status === 'PROVISIONING' && 'pulse-soft',
            )}
          />
          {st.label}
        </Badge>
      </div>

      {s.ipv4 ? (
        <div className="mono ltr mt-2.5 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs surface-2">
          {s.ipv4}
          <CopyButton value={s.ipv4} size={12} />
        </div>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] muted">
        <span className="tabular">
          {formatNumber(s.cores)} هسته · {formatNumber(s.memory)} گیگ رم · {formatNumber(s.disk)} گیگ دیسک
        </span>
      </div>

      <div className="mt-1 text-[11px]">
        {s.billingCycle === 'HOURLY' ? (
          <span className="tabular">{formatToman(s.priceHourly, { suffix: false })} تومان در ساعت</span>
        ) : (
          <span className="tabular">
            {formatToman(s.priceMonthly, { suffix: false })} تومان در ماه
            {s.expiresAt ? <span className="mr-1.5 muted">· سررسید {faRelative(s.expiresAt)}</span> : null}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t pt-3">
        {running ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              icon={<RotateCw size={14} />}
              loading={busyKey('reboot')}
              disabled={locked}
              onClick={() => onAction(s.id, 'reboot')}
            >
              ری‌استارت
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              icon={<PowerOff size={14} />}
              loading={busyKey('poweroff')}
              disabled={locked}
              onClick={() => onAction(s.id, 'poweroff')}
            >
              خاموش
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            icon={<Power size={14} />}
            loading={busyKey('poweron')}
            disabled={locked || s.status === 'SUSPENDED'}
            onClick={() => onAction(s.id, 'poweron')}
          >
            روشن کردن
          </Button>
        )}
        <Link href={`/dashboard/servers/${s.id}`} className="btn btn-primary btn-sm flex-1">
          مدیریت <ExternalLink size={13} />
        </Link>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  loading,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={loading || disabled}
      className={cn(
        'rounded-lg p-1.5 transition disabled:opacity-40',
        danger ? 'muted hover:text-red-500' : 'muted hover:text-[var(--color-brand-600)]',
        loading && 'spin',
      )}
    >
      {children}
    </button>
  );
}
