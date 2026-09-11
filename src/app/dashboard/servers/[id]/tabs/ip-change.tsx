'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  Repeat,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Wallet,
  Globe,
  ArrowLeft,
  Gift,
  Loader2,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Field,
  LoadingBlock,
  Modal,
  Textarea,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiPost, errorMessage, fetcher } from '@/lib/client';
import { formatToman } from '@/lib/money';
import { faDateTime, faRelative, IP_REACH_FA, cn } from '@/lib/utils';
import type { ServerData } from '../detail';

type HistoryRow = {
  id: string;
  oldIp: string | null;
  newIp: string | null;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  fee: number;
  refunded: boolean;
  automatic: boolean;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

type Status = {
  enabled: boolean;
  fee: number;
  normalFee: number;
  free: boolean;
  freeUntil: string | null;
  freeHours: number;
  maxPerMonth: number;
  usedThisMonth: number;
  remaining: number | null;
  currentIp: string | null;
  reachState: 'UNKNOWN' | 'OK' | 'BLOCKED' | 'INCONCLUSIVE' | 'SKIPPED';
  reachCheckedAt: string | null;
  autoSwaps: number;
  canChange: boolean;
  blockers: string[];
  estimatedDowntimeSeconds: number;
  history: HistoryRow[];
};

const HISTORY_STATUS: Record<HistoryRow['status'], { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }> = {
  SUCCESS: { label: 'موفق', tone: 'ok' },
  FAILED: { label: 'ناموفق', tone: 'bad' },
  RUNNING: { label: 'در حال انجام', tone: 'warn' },
  PENDING: { label: 'در صف', tone: 'muted' },
};

const fa = (n: number) => new Intl.NumberFormat('fa-IR').format(n);

export function IpChangeTab({ server, onDone }: { server: ServerData; onDone: () => void }) {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<Status>(`/api/servers/${server.id}/change-ip`, fetcher, {
    refreshInterval: (latest) =>
      latest?.history.some((h) => h.status === 'RUNNING' || h.status === 'PENDING') ? 5000 : 0,
  });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ newIp: string; oldIp: string } | null>(null);

  if (isLoading || !data) return <LoadingBlock label="در حال بررسی امکان تعویض آدرس…" />;

  async function run() {
    setBusy(true);
    try {
      const res = await apiPost<{ newIp: string; oldIp: string; message: string }>(
        `/api/servers/${server.id}/change-ip`,
        { confirm: true, reason: reason.trim() || undefined },
      );
      setResult({ newIp: res.newIp, oldIp: res.oldIp });
      setConfirmOpen(false);
      setReason('');
      toast.success('آدرس سرور تغییر کرد', res.message);
      mutate();
      onDone();
    } catch (err) {
      toast.error('تعویض آدرس انجام نشد', errorMessage(err));
      mutate();
    } finally {
      setBusy(false);
    }
  }

  const inProgress = data.history.some((h) => h.status === 'RUNNING' || h.status === 'PENDING');

  return (
    <div className="space-y-4">
      {result ? (
        <Alert tone="success" title="آدرس تازه فعال شد">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mono ltr line-through opacity-60">{result.oldIp}</span>
              <ArrowLeft size={13} />
              <span className="mono ltr font-bold">{result.newIp}</span>
              <CopyButton value={result.newIp} />
            </div>
            <p>
              اتصال SSH، رکوردهای DNS و هر جایی که آدرس قبلی را وارد کرده‌اید به‌روزرسانی کنید. آدرس قبلی دیگر به این
              سرور نمی‌رسد.
            </p>
          </div>
        </Alert>
      ) : null}

      {/* وضعیت فعلی */}
      <div className="rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] muted">آدرس IPv4 فعلی</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="mono ltr text-base font-bold">{data.currentIp ?? '—'}</span>
              {data.currentIp ? <CopyButton value={data.currentIp} /> : null}
            </div>
          </div>
          <Globe size={26} className="muted opacity-40" />
        </div>

        {/* نتیجه بررسی خودکار دسترسی از ایران */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          <Badge tone={IP_REACH_FA[data.reachState]?.tone ?? 'muted'}>
            {data.reachState === 'OK' ? (
              <ShieldCheck size={12} />
            ) : data.reachState === 'BLOCKED' ? (
              <ShieldAlert size={12} />
            ) : data.reachState === 'UNKNOWN' ? (
              <Loader2 size={12} className="spin" />
            ) : null}
            {IP_REACH_FA[data.reachState]?.label ?? 'نامشخص'}
          </Badge>
          {data.reachCheckedAt ? (
            <span className="text-[11px] muted">آخرین بررسی {faRelative(data.reachCheckedAt)}</span>
          ) : null}
          {data.autoSwaps > 0 ? (
            <span className="text-[11px] muted">
              {fa(data.autoSwaps)} بار پیش از تحویل رایگان عوض شده است
            </span>
          ) : null}
        </div>
      </div>

      {data.reachState === 'OK' ? (
        <Alert tone="success" title="این آدرس از داخل ایران بررسی و تایید شده است">
          پیش از تحویل، از یک سرور داخل ایران به این آدرس وصل شدیم و جواب داد. اگر بعداً مسدود شد، از همین صفحه
          می‌توانید عوضش کنید.
        </Alert>
      ) : data.reachState === 'UNKNOWN' ? (
        <Alert tone="info" title="بررسی دسترسی در حال انجام است">
          آدرس این سرور را از داخل ایران آزمایش می‌کنیم. اگر باز نشود، خودمان و بدون هیچ هزینه‌ای آدرس تازه
          می‌گیریم. چند دقیقه طول می‌کشد.
        </Alert>
      ) : data.reachState === 'BLOCKED' ? (
        <Alert tone="error" title="این آدرس از داخل ایران باز نمی‌شود">
          اگر تعویض خودکار برای شما انجام نشده، از دکمه پایین همین صفحه آدرس تازه بگیرید.
        </Alert>
      ) : null}

      <p className="text-xs leading-7 muted">
        اگر آدرس سرور شما از داخل ایران در دسترس نیست، با این ابزار می‌توانید یک آدرس IPv4 کاملاً تازه از هتزنر
        بگیرید. آدرس قبلی آزاد می‌شود و دیگر به شما برنمی‌گردد.
      </p>

      {data.free ? (
        <Alert tone="success" title="تعویض آدرس برای این سرور فعلاً رایگان است">
          <span className="flex items-start gap-1.5">
            <Gift size={14} className="mt-0.5 shrink-0" />
            تا {data.freeUntil ? faRelative(data.freeUntil) : `${fa(data.freeHours)} ساعت پس از ساخت`} می‌توانید
            بدون پرداخت هزینه و بدون مصرف سهمیه ماهانه، آدرس را عوض کنید. پس از آن هر تعویض{' '}
            {formatToman(data.normalFee)} هزینه دارد.
          </span>
        </Alert>
      ) : null}

      {/* سه کارت هزینه و سقف و زمان */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <InfoTile
          icon={data.free ? <Gift size={15} /> : <Wallet size={15} />}
          label="هزینه هر تعویض"
          value={data.fee > 0 ? formatToman(data.fee) : 'رایگان'}
          hint={data.free ? 'در پنجره رایگان پس از ساخت' : 'از کیف پول کسر می‌شود'}
        />
        <InfoTile
          icon={<Repeat size={15} />}
          label="سهمیه این ماه"
          value={
            data.maxPerMonth > 0
              ? `${fa(data.remaining ?? 0)} بار باقی مانده`
              : 'بدون محدودیت'
          }
          hint={
            data.free
              ? 'تعویض رایگان سهمیه مصرف نمی‌کند'
              : data.maxPerMonth > 0
                ? `${fa(data.usedThisMonth)} از ${fa(data.maxPerMonth)} استفاده شده`
                : undefined
          }
          danger={!data.free && data.maxPerMonth > 0 && (data.remaining ?? 0) === 0}
        />
        <InfoTile
          icon={<Clock size={15} />}
          label="مدت قطعی تقریبی"
          value={`حدود ${fa(Math.round(data.estimatedDowntimeSeconds / 60))} تا ۳ دقیقه`}
          hint="سرور در این مدت خاموش است"
        />
      </div>

      {/* هشدارها */}
      <Alert tone="warning" title="پیش از شروع بخوانید">
        <ul className="list-inside list-disc space-y-1">
          <li>سرور برای جابه‌جایی آدرس خاموش و دوباره روشن می‌شود. سرویس‌های روی آن چند دقیقه قطع می‌شوند.</li>
          <li>آدرس قبلی برای همیشه از دست می‌رود و امکان برگرداندن آن وجود ندارد.</li>
          <li>هر رکورد DNS، فایروال بیرونی یا لایسنسی که به آدرس قبلی بسته شده باید به‌روزرسانی شود.</li>
          <li>هزینه پیش از شروع کسر می‌شود؛ اگر عملیات ناموفق بماند، مبلغ کامل به کیف پول برمی‌گردد.</li>
        </ul>
      </Alert>

      {/* دلایل مسدود بودن */}
      {!data.canChange && data.blockers.length ? (
        <Alert tone="error" title="در حال حاضر امکان تعویض آدرس نیست">
          <ul className="list-inside list-disc space-y-1">
            {data.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {inProgress ? (
        <Alert tone="info" title="عملیات در حال انجام است">
          تعویض آدرس شروع شده و ممکن است تا سه دقیقه طول بکشد. این صفحه خودکار به‌روز می‌شود.
        </Alert>
      ) : null}

      <Button
        icon={<Repeat size={15} />}
        onClick={() => setConfirmOpen(true)}
        disabled={!data.canChange || busy}
        loading={busy}
        className="w-full sm:w-auto"
      >
        تعویض آدرس IPv4
      </Button>

      {/* تاریخچه */}
      {data.history.length ? (
        <div className="border-t pt-4">
          <h3 className="mb-3 text-xs font-bold">تاریخچه تعویض آدرس</h3>
          <div className="scroll-x">
            <table className="table table-cards">
              <thead>
                <tr>
                  <th>آدرس قبلی</th>
                  <th>آدرس جدید</th>
                  <th>وضعیت</th>
                  <th>هزینه</th>
                  <th>زمان</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((row) => {
                  const status = HISTORY_STATUS[row.status];
                  return (
                    <tr key={row.id}>
                      <td data-label="آدرس قبلی" className="mono ltr text-xs">
                        {row.oldIp ?? '—'}
                      </td>
                      <td data-label="آدرس جدید" className="mono ltr text-xs font-semibold">
                        {row.newIp ?? '—'}
                      </td>
                      <td data-label="وضعیت">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={status.tone}>{status.label}</Badge>
                          {row.automatic ? <Badge tone="muted">خودکار</Badge> : null}
                        </div>
                        {row.error ? <div className="mt-1 text-[11px] text-red-500">{row.error}</div> : null}
                      </td>
                      <td data-label="هزینه" className="tabular text-xs">
                        {row.fee > 0 ? formatToman(row.fee) : 'رایگان'}
                        {row.refunded ? <span className="mr-1.5 text-[11px] text-emerald-600">(برگشت خورد)</span> : null}
                      </td>
                      <td data-label="زمان" className="text-xs muted">
                        {faDateTime(row.startedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <Modal
        open={confirmOpen}
        onClose={() => (busy ? null : setConfirmOpen(false))}
        title="تایید تعویض آدرس سرور"
        description={`سرور «${server.name}» خاموش می‌شود، آدرس تازه می‌گیرد و دوباره روشن می‌شود.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={busy}>
              انصراف
            </Button>
            <Button variant="danger" onClick={run} loading={busy} icon={<Repeat size={15} />}>
              {data.fee > 0 ? `پرداخت ${formatToman(data.fee)} و تعویض` : 'شروع تعویض رایگان'}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <div className="rounded-xl border p-3.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="muted">آدرس فعلی</span>
              <span className="mono ltr font-semibold">{data.currentIp}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs">
              <span className="muted">آدرس جدید</span>
              <span className="muted">پس از اتمام عملیات مشخص می‌شود</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 border-t pt-2 text-xs">
              <span className="muted">مبلغ کسرشده از کیف پول</span>
              {data.fee > 0 ? (
                <span className="tabular font-bold">{formatToman(data.fee)}</span>
              ) : (
                <span className="font-bold text-emerald-600">رایگان</span>
              )}
            </div>
          </div>

          <Alert tone="warning">
            <span className="flex items-start gap-1.5">
              <ShieldAlert size={14} className="mt-0.5 shrink-0" />
              تا پایان عملیات صفحه را نبندید. قطعی سرویس حدود یک تا سه دقیقه طول می‌کشد.
            </span>
          </Alert>

          <Field label="علت تعویض (اختیاری)" hint="به تیم پشتیبانی کمک می‌کند الگوی مسدود شدن آدرس‌ها را بهتر بشناسد.">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={200}
              placeholder="مثلاً: آدرس از داخل ایران باز نمی‌شود"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function InfoTile({
  icon,
  label,
  value,
  hint,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] muted">{label}</span>
        <span className="muted opacity-60">{icon}</span>
      </div>
      <div className={cn('tabular mt-1.5 text-sm font-bold', danger && 'text-red-500')}>{value}</div>
      {hint ? <div className="mt-1 text-[11px] muted">{hint}</div> : null}
    </div>
  );
}
