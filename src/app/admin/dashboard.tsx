'use client';

import Link from 'next/link';
import useSWR from 'swr';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Users,
  Server,
  LifeBuoy,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import { Alert, Badge, Card, LoadingBlock, Stat } from '@/components/ui';
import { fetcher } from '@/lib/client';
import { formatToman, formatNumber } from '@/lib/money';
import { faDate, faDateTime, faRelative, locationFa } from '@/lib/utils';

type Stats = {
  users: { total: number; new24h: number };
  servers: {
    active: number;
    provisioning: number;
    suspended: number;
    byLocation: { location: string; count: number }[];
    byType: { type: string; count: number }[];
  };
  tickets: { open: number };
  finance: {
    pendingDeposits: number;
    totalUserBalance: number;
    today: { deposits: number; charges: number };
    month: { deposits: number; charges: number; refunds: number };
    dailyRevenue: { day: string; total: number }[];
  };
  system: {
    hetznerConfigured: boolean;
    catalogSyncedAt: string | null;
    eurRate: number;
    markupPercent: number;
    maintenanceMode: boolean;
    jobs: {
      id: string;
      job: string;
      status: string;
      startedAt: string;
      finishedAt: string | null;
      processed: number;
      error: string | null;
    }[];
  };
};

const JOB_FA: Record<string, string> = {
  'hourly-billing': 'صورتحساب ساعتی',
  'monthly-billing': 'صورتحساب ماهانه',
  'finalize-provisioning': 'تکمیل ساخت سرور',
  'sync-servers': 'همگام‌سازی سرورها',
  'retry-unsuspend': 'رفع تعلیق خودکار',
  'cleanup-suspended': 'حذف سرورهای تعلیق‌شده',
  'collect-traffic': 'ثبت ترافیک',
  'snapshot-billing': 'صورتحساب اسنپ‌شات',
  'sync-catalog': 'همگام‌سازی کاتالوگ',
  housekeeping: 'پاکسازی',
};

export function AdminDashboard() {
  const { data, isLoading } = useSWR<Stats>('/api/admin/stats', fetcher, { refreshInterval: 60_000 });

  if (isLoading && !data) return <LoadingBlock label="در حال محاسبه آمار…" />;
  if (!data) return <Alert tone="error">دریافت آمار ممکن نشد.</Alert>;

  const profit = data.finance.month.charges;

  return (
    <div className="space-y-5">
      {!data.system.hetznerConfigured ? (
        <Alert
          tone="error"
          title="توکن API هتزنر تنظیم نشده است"
          action={
            <Link href="/admin/settings" className="btn btn-secondary btn-sm">
              راهنمای تنظیم
            </Link>
          }
        >
          تا زمانی که توکن هتزنر در فایل .env قرار نگیرد، امکان ساخت سرور و همگام‌سازی کاتالوگ وجود ندارد.
        </Alert>
      ) : null}

      {data.system.maintenanceMode ? (
        <Alert tone="warning" title="حالت تعمیر و نگهداری فعال است">
          کاربران در حال حاضر پیام نگهداری می‌بینند.
        </Alert>
      ) : null}

      {data.finance.pendingDeposits > 0 ? (
        <Alert
          tone="warning"
          title={`${formatNumber(data.finance.pendingDeposits)} تراکنش در انتظار بررسی`}
          action={
            <Link href="/admin/transactions?status=PENDING" className="btn btn-secondary btn-sm">
              بررسی تراکنش‌ها
            </Link>
          }
        >
          رسیدهای واریز دستی یا پرداخت‌های تاییدنشده نیاز به رسیدگی دارند.
        </Alert>
      ) : null}

      {/* آمار اصلی */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat
          label="کاربران"
          value={formatNumber(data.users.total)}
          hint={`${formatNumber(data.users.new24h)} ثبت‌نام در ۲۴ ساعت گذشته`}
          icon={<Users size={16} />}
        />
        <Stat
          label="سرورهای فعال"
          value={formatNumber(data.servers.active)}
          hint={
            data.servers.provisioning + data.servers.suspended > 0
              ? `${formatNumber(data.servers.provisioning)} در حال ساخت · ${formatNumber(data.servers.suspended)} تعلیق`
              : 'همه سرورها سالم هستند'
          }
          icon={<Server size={16} />}
          tone={data.servers.suspended > 0 ? 'warn' : 'ok'}
        />
        <Stat
          label="درآمد ۳۰ روز"
          value={formatToman(data.finance.month.deposits)}
          hint={`فروش سرویس: ${formatToman(profit)}`}
          icon={<TrendingUp size={16} />}
          tone="ok"
        />
        <Stat
          label="تیکت‌های باز"
          value={formatNumber(data.tickets.open)}
          hint="نیازمند پاسخ کارشناس"
          icon={<LifeBuoy size={16} />}
          tone={data.tickets.open > 0 ? 'warn' : undefined}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* نمودار درآمد */}
        <Card className="lg:col-span-2" title="درآمد روزانه (۳۰ روز اخیر)">
          {data.finance.dailyRevenue.length === 0 ? (
            <p className="py-16 text-center text-xs muted">هنوز واریزی ثبت نشده است.</p>
          ) : (
            <div className="h-64 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.finance.dailyRevenue} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#17b19a" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#17b19a" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(d: string) => faDate(d)}
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                    stroke="var(--border)"
                    minTickGap={30}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                    stroke="var(--border)"
                    width={70}
                    tickFormatter={(v: number) => formatNumber(v / 1_000_000, 1) + 'M'}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      fontSize: 12,
                      direction: 'rtl',
                    }}
                    labelFormatter={(d) => faDate(String(d))}
                    formatter={(v: number) => [formatToman(v), 'درآمد']}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#17b19a"
                    strokeWidth={2}
                    fill="url(#rev)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* خلاصه مالی */}
        <Card title="وضعیت مالی">
          <dl className="space-y-3 text-xs">
            <Row label="واریز امروز" value={formatToman(data.finance.today.deposits)} tone="ok" />
            <Row label="فروش امروز" value={formatToman(data.finance.today.charges)} />
            <Row label="واریز ۳۰ روز" value={formatToman(data.finance.month.deposits)} />
            <Row label="فروش ۳۰ روز" value={formatToman(data.finance.month.charges)} />
            <Row label="بازگشت وجه ۳۰ روز" value={formatToman(data.finance.month.refunds)} />
            <div className="border-t pt-3">
              <Row
                label="مجموع موجودی کاربران"
                value={formatToman(data.finance.totalUserBalance)}
                tone="warn"
              />
              <p className="mt-2 text-[10px] leading-5 muted">
                این مبلغ بدهی شما به کاربران است و باید همیشه پشتوانه نقدی داشته باشد.
              </p>
            </div>
          </dl>

          <div className="mt-4 rounded-xl p-3 text-[11px] leading-6 surface-2">
            <div className="flex items-center justify-between">
              <span className="muted">نرخ یورو</span>
              <span className="tabular font-bold">{formatToman(data.system.eurRate)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="muted">درصد سود پیش‌فرض</span>
              <span className="tabular font-bold">{formatNumber(data.system.markupPercent)}٪</span>
            </div>
            <Link href="/admin/pricing" className="mt-2 block text-[var(--color-brand-600)] hover:underline">
              تنظیم قیمت‌گذاری
            </Link>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* توزیع لوکیشن */}
        <Card title="توزیع سرورها بر اساس لوکیشن">
          {data.servers.byLocation.length === 0 ? (
            <p className="py-8 text-center text-xs muted">سروری ثبت نشده است.</p>
          ) : (
            <ul className="space-y-2.5">
              {data.servers.byLocation.map((l) => {
                const loc = locationFa(l.location);
                const max = Math.max(...data.servers.byLocation.map((x) => x.count));
                return (
                  <li key={l.location}>
                    <div className="flex items-center justify-between text-xs">
                      <span>
                        {loc.flag} {loc.title}
                      </span>
                      <span className="tabular font-bold">{formatNumber(l.count)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                      <div
                        className="h-full rounded-full bg-[var(--color-brand-500)]"
                        style={{ width: `${(l.count / max) * 100}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* پرفروش‌ترین پلن‌ها */}
        <Card title="پرفروش‌ترین پلن‌ها">
          {data.servers.byType.length === 0 ? (
            <p className="py-8 text-center text-xs muted">داده‌ای موجود نیست.</p>
          ) : (
            <ul className="space-y-2">
              {data.servers.byType.map((t, i) => (
                <li key={t.type} className="flex items-center justify-between border-b pb-2 text-xs last:border-b-0">
                  <span className="flex items-center gap-2">
                    <span className="grid h-5 w-5 place-items-center rounded text-[10px] font-bold surface-2">
                      {formatNumber(i + 1)}
                    </span>
                    <span className="font-semibold uppercase">{t.type}</span>
                  </span>
                  <span className="tabular muted">{formatNumber(t.count)} سرور</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* سلامت سیستم */}
        <Card title="سلامت سیستم">
          <dl className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between border-b pb-2">
              <dt className="muted">اتصال هتزنر</dt>
              <dd>
                {data.system.hetznerConfigured ? (
                  <Badge tone="ok">
                    <CheckCircle2 size={11} /> متصل
                  </Badge>
                ) : (
                  <Badge tone="bad">
                    <XCircle size={11} /> تنظیم نشده
                  </Badge>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between border-b pb-2">
              <dt className="muted">آخرین همگام‌سازی کاتالوگ</dt>
              <dd className="text-left">{data.system.catalogSyncedAt ? faRelative(data.system.catalogSyncedAt) : 'هرگز'}</dd>
            </div>
          </dl>

          <h4 className="mb-2 mt-4 text-[11px] font-bold">آخرین اجرای کارهای زمان‌بندی‌شده</h4>
          {data.system.jobs.length === 0 ? (
            <div className="rounded-xl p-3 text-[11px] leading-6 surface-2">
              <AlertTriangle size={12} className="ml-1 inline text-amber-500" />
              هنوز هیچ کاری اجرا نشده است. مطمئن شوید ورکر با دستور <code className="mono ltr">npm run worker</code>{' '}
              در حال اجراست.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {data.system.jobs.slice(0, 8).map((j) => (
                <li key={j.id} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {j.status === 'done' ? (
                      <CheckCircle2 size={11} className="shrink-0 text-emerald-500" />
                    ) : j.status === 'failed' ? (
                      <XCircle size={11} className="shrink-0 text-red-500" />
                    ) : (
                      <Clock size={11} className="shrink-0 text-amber-500" />
                    )}
                    <span className="truncate">{JOB_FA[j.job] ?? j.job}</span>
                  </span>
                  <span className="shrink-0 muted" title={faDateTime(j.startedAt)}>
                    {faRelative(j.startedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <Link
            href="/admin/logs"
            className="mt-4 flex items-center justify-center gap-1 text-[11px] text-[var(--color-brand-600)] hover:underline"
          >
            <RefreshCw size={11} /> مشاهده گزارش کامل رویدادها
          </Link>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="muted">{label}</dt>
      <dd
        className={
          tone === 'ok'
            ? 'tabular font-bold text-emerald-600'
            : tone === 'warn'
              ? 'tabular font-bold text-amber-600'
              : 'tabular font-bold'
        }
      >
        {value}
      </dd>
    </div>
  );
}
