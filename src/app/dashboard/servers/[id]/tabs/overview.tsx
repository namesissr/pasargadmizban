'use client';

import { CopyButton } from '@/components/ui';
import { formatNumber, formatToman, formatTraffic } from '@/lib/money';
import { faDateTime, faRelative, locationFa, osFa } from '@/lib/utils';
import type { ServerData } from '../detail';

export function OverviewTab({ server }: { server: ServerData }) {
  const loc = locationFa(server.locationName);
  const os = osFa(server.imageLabel?.split(' ')[0]?.toLowerCase() ?? '');

  const totalOut = server.traffic.reduce((sum, t) => sum + t.outgoing, 0);
  const totalIn = server.traffic.reduce((sum, t) => sum + t.incoming, 0);
  const usedPct =
    server.includedTraffic > 0 ? Math.min(100, (totalOut / server.includedTraffic) * 100) : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <h3 className="mb-3 text-xs font-bold">مشخصات سرور</h3>
        <dl className="space-y-2.5 text-xs">
          <Row label="نام" value={server.name} copy={server.name} />
          <Row label="شناسه" value={server.id} copy={server.id} mono />
          <Row label="پلن" value={server.serverTypeName.toUpperCase()} />
          <Row
            label="منابع"
            value={`${formatNumber(server.cores)} هسته پردازنده · ${formatNumber(server.memory)} گیگابایت رم · ${formatNumber(server.disk)} گیگابایت دیسک`}
          />
          <Row label="سیستم‌عامل" value={server.imageLabel ?? server.imageName} hint={os.label} />
          <Row label="لوکیشن" value={`${loc.flag} ${loc.title}`} hint={server.datacenterName ?? undefined} />
          <Row label="زمان ساخت" value={faDateTime(server.createdAt)} hint={faRelative(server.createdAt)} />
          {server.provisionedAt ? (
            <Row label="زمان تحویل" value={faDateTime(server.provisionedAt)} />
          ) : null}
        </dl>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-bold">شبکه</h3>
        <dl className="space-y-2.5 text-xs">
          <Row label="آدرس IPv4" value={server.ipv4 ?? '—'} copy={server.ipv4 ?? undefined} mono />
          <Row label="آدرس IPv6" value={server.ipv6 ?? '—'} copy={server.ipv6 ?? undefined} mono />
          {server.ipv6Network ? <Row label="بلوک IPv6" value={server.ipv6Network} mono /> : null}
          <Row label="اتصال SSH" value={server.ipv4 ? `ssh root@${server.ipv4}` : '—'} copy={server.ipv4 ? `ssh root@${server.ipv4}` : undefined} mono />
        </dl>

        <h3 className="mb-3 mt-6 text-xs font-bold">ترافیک</h3>
        <div className="rounded-xl p-3 surface-2">
          <div className="flex items-center justify-between text-xs">
            <span className="muted">مصرف خروجی این ماه</span>
            <span className="tabular font-bold">{formatTraffic(totalOut)}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--border)]">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${usedPct}%`,
                background: usedPct > 85 ? '#ef4444' : usedPct > 60 ? '#f59e0b' : 'var(--color-brand-500)',
              }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] muted">
            <span>ورودی: {formatTraffic(totalIn)} (رایگان)</span>
            <span>سهمیه: {formatTraffic(server.includedTraffic)}</span>
          </div>
        </div>

        <h3 className="mb-3 mt-6 text-xs font-bold">صورتحساب</h3>
        <dl className="space-y-2.5 text-xs">
          <Row
            label="نوع پرداخت"
            value={server.billingCycle === 'HOURLY' ? 'ساعتی' : 'ماهانه'}
          />
          <Row
            label="هزینه"
            value={
              server.billingCycle === 'HOURLY'
                ? `${formatToman(server.priceHourly)} در ساعت`
                : `${formatToman(server.priceMonthly)} در ماه`
            }
            hint={
              server.billingCycle === 'HOURLY' ? `سقف ماهانه: ${formatToman(server.priceMonthly)}` : undefined
            }
          />
          {server.backupsEnabled ? (
            <Row label="پشتیبان‌گیری" value={`فعال — ${formatToman(server.backupPriceMonthly)} در ماه`} />
          ) : null}
          {server.expiresAt ? (
            <Row label="سررسید" value={faDateTime(server.expiresAt)} hint={faRelative(server.expiresAt)} />
          ) : null}
        </dl>
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  hint,
  copy,
  mono,
}: {
  label: string;
  value: string;
  hint?: string;
  copy?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b pb-2.5 last:border-b-0">
      <dt className="shrink-0 muted">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1 text-left">
        <span className={mono ? 'mono ltr truncate' : 'truncate'}>{value}</span>
        {copy ? <CopyButton value={copy} size={12} /> : null}
        {hint ? <span className="mr-1 shrink-0 text-[11px] muted">({hint})</span> : null}
      </dd>
    </div>
  );
}
