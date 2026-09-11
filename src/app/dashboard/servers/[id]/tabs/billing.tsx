'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { CalendarClock, TrendingUp, RefreshCw } from 'lucide-react';
import { Alert, Button, Field, LoadingBlock, Select, Toggle } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, apiPost, errorMessage, fetcher } from '@/lib/client';
import { formatToman, formatNumber, formatTraffic } from '@/lib/money';
import { faDateTime, faRelative, cn } from '@/lib/utils';
import type { ServerData } from '../detail';

type ResizeResponse = {
  current: { name: string; cores: number; memory: number; disk: number; hourly: number; monthly: number };
  options: {
    name: string;
    description: string;
    cores: number;
    memory: number;
    disk: number;
    hourly: number;
    monthly: number;
    deltaMonthly: number;
    isUpgrade: boolean;
  }[];
  note: string;
};

export function BillingTab({ server, onDone }: { server: ServerData; onDone: () => void }) {
  const toast = useToast();
  const [months, setMonths] = useState(1);
  const [renewing, setRenewing] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  const [resizeTarget, setResizeTarget] = useState('');
  const [resizing, setResizing] = useState(false);

  const { data: resize } = useSWR<ResizeResponse>(`/api/servers/${server.id}/resize`, fetcher, {
    revalidateOnFocus: false,
  });

  const totalOut = server.traffic.reduce((sum, t) => sum + t.outgoing, 0);

  async function renew() {
    setRenewing(true);
    try {
      const res = await apiPost<{ message: string }>(`/api/servers/${server.id}/renew`, { months });
      toast.success(res.message);
      onDone();
    } catch (err) {
      toast.error('تمدید انجام نشد', errorMessage(err));
    } finally {
      setRenewing(false);
    }
  }

  async function toggleAutoRenew(value: boolean) {
    setAutoBusy(true);
    try {
      const res = await api<{ message: string }>(`/api/servers/${server.id}/renew`, {
        method: 'PATCH',
        body: { autoRenew: value },
      });
      toast.success(res.message);
      onDone();
    } catch (err) {
      toast.error('تغییر تمدید خودکار انجام نشد', errorMessage(err));
    } finally {
      setAutoBusy(false);
    }
  }

  async function doResize() {
    if (!resizeTarget) return;
    if (!window.confirm('تغییر پلن انجام شود؟ افزایش اندازه دیسک قابل بازگشت نیست.')) return;
    setResizing(true);
    try {
      const res = await apiPost<{ message: string }>(`/api/servers/${server.id}/resize`, {
        serverType: resizeTarget,
        upgradeDisk: true,
      });
      toast.success(res.message);
      onDone();
    } catch (err) {
      toast.error('تغییر پلن انجام نشد', errorMessage(err));
    } finally {
      setResizing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* وضعیت صورتحساب */}
      <section>
        <h3 className="mb-3 text-xs font-bold">وضعیت صورتحساب</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Box
            label="نوع پرداخت"
            value={server.billingCycle === 'HOURLY' ? 'ساعتی' : 'ماهانه'}
            hint={
              server.billingCycle === 'HOURLY'
                ? 'هر ساعت از کیف پول کسر می‌شود'
                : 'در سررسید یکجا کسر می‌شود'
            }
          />
          <Box
            label={server.billingCycle === 'HOURLY' ? 'نرخ ساعتی' : 'نرخ ماهانه'}
            value={formatToman(server.billingCycle === 'HOURLY' ? server.priceHourly : server.priceMonthly)}
            hint={
              server.billingCycle === 'HOURLY'
                ? `سقف ماهانه ${formatToman(server.priceMonthly)}`
                : server.backupsEnabled
                  ? `+ ${formatToman(server.backupPriceMonthly)} بکاپ`
                  : undefined
            }
          />
          <Box
            label="مصرف ترافیک"
            value={formatTraffic(totalOut)}
            hint={`از ${formatTraffic(server.includedTraffic)} سهمیه ماهانه`}
          />
        </div>
      </section>

      {/* تمدید */}
      {server.billingCycle === 'MONTHLY' ? (
        <section className="border-t pt-5">
          <h3 className="mb-1 text-xs font-bold">تمدید سرویس</h3>
          <p className="mb-3 text-[11px] leading-6 muted">
            {server.expiresAt ? (
              <>
                سررسید فعلی: <b>{faDateTime(server.expiresAt)}</b> ({faRelative(server.expiresAt)})
              </>
            ) : (
              'سررسیدی برای این سرور ثبت نشده است.'
            )}
          </p>

          <div className="rounded-xl border p-4">
            <Toggle
              checked={server.autoRenew}
              onChange={toggleAutoRenew}
              disabled={autoBusy}
              label="تمدید خودکار"
              description="در سررسید، هزینه یک ماه دیگر از کیف پول کسر و سرویس تمدید می‌شود. اگر خاموش باشد، سرور در سررسید تعلیق می‌گردد."
            />
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="w-40">
              <Field label="تمدید دستی">
                <Select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                  {[1, 2, 3, 6, 12].map((m) => (
                    <option key={m} value={m}>
                      {formatNumber(m)} ماه
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button onClick={renew} loading={renewing} icon={<CalendarClock size={15} />} disabled={server.status === 'DELETED'}>
              تمدید و پرداخت {formatToman(server.priceMonthly * months)}
            </Button>
          </div>
        </section>
      ) : (
        <section className="border-t pt-5">
          <h3 className="mb-1 text-xs font-bold">پرداخت ساعتی</h3>
          <p className="text-[11px] leading-7 muted">
            این سرور ساعتی محاسبه می‌شود. هر ساعت مبلغ {formatToman(server.priceHourly)} از کیف پول شما کسر می‌گردد و
            مجموع پرداخت شما در هر ماه هرگز از {formatToman(server.priceMonthly)} بیشتر نمی‌شود. برای توقف کامل هزینه،
            باید سرور را حذف کنید؛ خاموش کردن سرور هزینه را متوقف نمی‌کند چون منابع همچنان رزرو می‌مانند.
          </p>
          <Link
            href="/dashboard/transactions"
            className="mt-3 inline-block text-xs text-[var(--color-brand-600)] hover:underline"
          >
            مشاهده تاریخچه کسر هزینه
          </Link>
        </section>
      )}

      {/* ارتقای پلن */}
      <section className="border-t pt-5">
        <h3 className="mb-1 text-xs font-bold">تغییر پلن</h3>
        <p className="mb-3 text-[11px] leading-6 muted">{resize?.note ?? 'در حال بارگذاری پلن‌های موجود…'}</p>

        {server.status !== 'OFF' ? (
          <Alert tone="warning" title="سرور باید خاموش باشد">
            برای تغییر پلن، ابتدا سرور را خاموش کنید. پس از اتمام عملیات دوباره آن را روشن کنید.
          </Alert>
        ) : null}

        {!resize ? (
          <LoadingBlock />
        ) : resize.options.length === 0 ? (
          <p className="text-xs muted">پلن دیگری برای ارتقا در این لوکیشن موجود نیست.</p>
        ) : (
          <>
            <div className="scroll-x">
              <table className="table table-cards">
                <thead>
                  <tr>
                    <th>پلن</th>
                    <th>مشخصات</th>
                    <th>ماهانه</th>
                    <th>تفاوت</th>
                  </tr>
                </thead>
                <tbody>
                  {resize.options.map((o) => (
                    <tr
                      key={o.name}
                      onClick={() => setResizeTarget(o.name)}
                      className={cn(
                        'cursor-pointer',
                        resizeTarget === o.name && 'bg-[color-mix(in_srgb,var(--color-brand-500)_10%,transparent)]',
                      )}
                    >
                      <td data-label="پلن" className="text-xs font-bold uppercase">{o.name}</td>
                      <td data-label="مشخصات" className="tabular text-xs muted">
                        {formatNumber(o.cores)} هسته · {formatNumber(o.memory)} گیگ · {formatNumber(o.disk)} گیگ
                      </td>
                      <td data-label="ماهانه" className="tabular text-xs">{formatToman(o.monthly, { suffix: false })}</td>
                      <td data-label="تفاوت"
                        className={cn(
                          'tabular text-xs font-semibold',
                          o.deltaMonthly > 0 ? 'text-amber-600' : 'text-emerald-600',
                        )}
                      >
                        {o.deltaMonthly > 0 ? '+' : ''}
                        {formatToman(o.deltaMonthly, { suffix: false })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4">
              <Button
                onClick={doResize}
                loading={resizing}
                disabled={!resizeTarget || server.status !== 'OFF'}
                icon={<TrendingUp size={15} />}
              >
                تغییر به پلن {resizeTarget ? resizeTarget.toUpperCase() : '—'}
              </Button>
            </div>
          </>
        )}
      </section>

      {/* مصرف ترافیک روزانه */}
      {server.traffic.length ? (
        <section className="border-t pt-5">
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold">
            <RefreshCw size={13} /> مصرف ترافیک روزانه
          </h3>
          <div className="scroll-x">
            <table className="table table-cards">
              <thead>
                <tr>
                  <th>تاریخ</th>
                  <th>خروجی</th>
                  <th>ورودی</th>
                </tr>
              </thead>
              <tbody>
                {server.traffic.slice(0, 14).map((t) => (
                  <tr key={t.date}>
                    <td data-label="تاریخ" className="text-xs">{faDateTime(t.date).split(',')[0]}</td>
                    <td data-label="خروجی" className="tabular text-xs">{formatTraffic(t.outgoing)}</td>
                    <td data-label="ورودی" className="tabular text-xs muted">{formatTraffic(t.incoming)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Box({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-[11px] muted">{label}</div>
      <div className="tabular mt-1 text-sm font-bold">{value}</div>
      {hint ? <div className="mt-1 text-[10px] muted">{hint}</div> : null}
    </div>
  );
}
