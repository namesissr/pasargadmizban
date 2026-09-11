'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import {
  Activity,
  Power,
  PowerOff,
  RotateCw,
  Zap,
  HardDrive,
  Terminal,
  Shield,
  Settings2,
  LifeBuoy,
  RefreshCw,
  Camera,
  KeyRound,
  Gauge,
  Radio,
  CalendarClock,
  Repeat,
  Trash2,
  Send,
} from 'lucide-react';
import { Alert, Badge, Button, Card, LoadingBlock, Tabs, CopyButton, SecretValue, ConfirmModal } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/app/shell';
import { apiPost, apiDelete, errorMessage, fetcher } from '@/lib/client';
import { formatToman, formatNumber, formatTraffic } from '@/lib/money';
import { faDateTime, faRelative, SERVER_STATUS_FA, SERVER_ACTION_FA, IP_REACH_FA, cn } from '@/lib/utils';
import { OverviewTab } from './tabs/overview';
import { MetricsTab } from './tabs/metrics';
import { MonitorTab } from './tabs/monitor';
import { AccessTab } from './tabs/access';
import { RebuildTab } from './tabs/rebuild';
import { SnapshotsTab } from './tabs/snapshots';
import { FirewallTab } from './tabs/firewall';
import { IpChangeTab } from './tabs/ip-change';
import { BillingTab } from './tabs/billing';
import { SettingsTab } from './tabs/settings';

export type ServerData = {
  id: string;
  name: string;
  label: string | null;
  status: string;
  hetznerStatus: string | null;
  hetznerId: number | null;
  serverTypeName: string;
  locationName: string;
  datacenterName: string | null;
  imageName: string;
  imageLabel: string | null;
  ipv4: string | null;
  ipv6: string | null;
  ipv6Network: string | null;
  cores: number;
  memory: number;
  disk: number;
  includedTraffic: number;
  billingCycle: 'HOURLY' | 'MONTHLY';
  priceHourly: number;
  priceMonthly: number;
  backupsEnabled: boolean;
  backupPriceMonthly: number;
  protection: boolean;
  autoRenew: boolean;
  rescueMode: string | null;
  isoName: string | null;
  createdAt: string;
  provisionedAt: string | null;
  expiresAt: string | null;
  suspendedAt: string | null;
  deleteAfter: string | null;
  provisionError: string | null;
  ipReachState: 'UNKNOWN' | 'OK' | 'BLOCKED' | 'INCONCLUSIVE' | 'SKIPPED';
  ipCheckedAt: string | null;
  hasRootPassword: boolean;
  sshKeys: { id: string; name: string; fingerprint: string }[];
  actions: {
    id: string;
    action: string;
    status: string;
    error: string | null;
    createdAt: string;
    finishedAt: string | null;
  }[];
  traffic: { date: string; outgoing: number; incoming: number }[];
};

const TABS = [
  { id: 'overview', label: 'نمای کلی', icon: <Activity size={14} /> },
  { id: 'metrics', label: 'نمودار مصرف', icon: <Gauge size={14} /> },
  { id: 'monitor', label: 'پایش و آپ‌تایم', icon: <Radio size={14} /> },
  { id: 'access', label: 'دسترسی', icon: <KeyRound size={14} /> },
  { id: 'rebuild', label: 'نصب مجدد', icon: <HardDrive size={14} /> },
  { id: 'snapshots', label: 'اسنپ‌شات و بکاپ', icon: <Camera size={14} /> },
  { id: 'firewall', label: 'فایروال', icon: <Shield size={14} /> },
  { id: 'ip-change', label: 'تعویض آی‌پی', icon: <Repeat size={14} /> },
  { id: 'billing', label: 'صورتحساب', icon: <CalendarClock size={14} /> },
  { id: 'settings', label: 'تنظیمات', icon: <Settings2 size={14} /> },
];

export function ServerDetail({ serverId, initialName }: { serverId: string; initialName: string }) {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const isNew = params.get('new') === '1';

  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState<string | null>(null);
  const [showCredentials, setShowCredentials] = useState(isNew);
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: server, isLoading, mutate } = useSWR<ServerData>(
    `/api/servers/${serverId}`,
    fetcher,
    {
      refreshInterval: (latest) =>
        latest && ['PROVISIONING', 'REBUILDING', 'MIGRATING', 'DELETING'].includes(latest.status) ? 5000 : 30_000,
    },
  );

  // نمایش خودکار رمز روت پس از ساخت
  useEffect(() => {
    if (!isNew || !server || credentials) return;
    if (server.status === 'PROVISIONING' || !server.hasRootPassword) return;
    apiPost<{ username: string; password: string }>(`/api/servers/${serverId}/password`)
      .then(setCredentials)
      .catch(() => null);
  }, [isNew, server, serverId, credentials]);

  async function act(action: string, confirmMessage?: string) {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setBusy(action);
    try {
      const res = await apiPost<{ message: string; rootPassword: string | null }>(
        `/api/servers/${serverId}/actions`,
        { action },
      );
      toast.success(res.message);
      if (res.rootPassword) {
        setCredentials({ username: 'root', password: res.rootPassword });
        setShowCredentials(true);
      }
      setTimeout(() => mutate(), 1200);
    } catch (err) {
      toast.error('عملیات انجام نشد', errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function destroy() {
    if (!server) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/servers/${server.id}`, { confirmName: server.name });
      toast.success('سرور حذف شد', 'صورتحساب این سرور متوقف شد.');
      router.push('/dashboard/servers');
    } catch (err) {
      toast.error('حذف انجام نشد', errorMessage(err));
      setDeleting(false);
    }
  }

  async function revealPassword() {
    try {
      const res = await apiPost<{ username: string; password: string }>(`/api/servers/${serverId}/password`);
      setCredentials(res);
      setShowCredentials(true);
    } catch (err) {
      toast.error('نمایش رمز ممکن نشد', errorMessage(err));
    }
  }

  if (isLoading && !server) {
    return (
      <>
        <PageHeader
          title={initialName}
          breadcrumb={[
            { href: '/dashboard', label: 'داشبورد' },
            { href: '/dashboard/servers', label: 'سرورهای من' },
          ]}
        />
        <LoadingBlock label="در حال دریافت اطلاعات سرور…" />
      </>
    );
  }
  if (!server) {
    return (
      <Alert tone="error" title="سرور یافت نشد">
        این سرور وجود ندارد یا حذف شده است.{' '}
        <Link href="/dashboard/servers" className="font-semibold underline">
          بازگشت به لیست سرورها
        </Link>
      </Alert>
    );
  }

  const st = SERVER_STATUS_FA[server.status] ?? { label: server.status, tone: 'muted' as const };
  const running = server.status === 'RUNNING';
  const locked = ['PROVISIONING', 'DELETING', 'REBUILDING', 'MIGRATING'].includes(server.status);
  const suspended = server.status === 'SUSPENDED';

  return (
    <>
      <PageHeader
        title={server.name}
        description={server.label ?? `${server.serverTypeName.toUpperCase()} در ${server.locationName.toUpperCase()}`}
        breadcrumb={[
          { href: '/dashboard', label: 'داشبورد' },
          { href: '/dashboard/servers', label: 'سرورهای من' },
        ]}
        action={
          <>
            <Badge tone={st.tone}>
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  running ? 'bg-emerald-500' : st.tone === 'bad' ? 'bg-red-500' : 'bg-current opacity-60',
                  locked && 'pulse-soft',
                )}
              />
              {st.label}
            </Badge>
            <Button variant="secondary" size="sm" onClick={() => mutate()} icon={<RefreshCw size={13} />}>
              بروزرسانی
            </Button>
          </>
        }
      />

      <div className="space-y-5">
        {/* پیام‌های وضعیت */}
        {server.status === 'PROVISIONING' ? (
          <Alert tone="info" title="سرور در حال آماده‌سازی است">
            معمولاً بین ۳۰ ثانیه تا ۲ دقیقه طول می‌کشد. این صفحه به صورت خودکار به‌روزرسانی می‌شود.
          </Alert>
        ) : null}

        {server.status === 'ERROR' ? (
          <Alert tone="error" title="ساخت سرور با خطا مواجه شد">
            {server.provisionError ?? 'خطای نامشخص.'} مبلغ پرداختی به کیف پول شما بازگردانده شده است.
          </Alert>
        ) : null}

        {suspended ? (
          <Alert
            tone="error"
            title="این سرور تعلیق شده است"
            action={
              <Link href="/dashboard/wallet" className="btn btn-primary btn-sm">
                شارژ کیف پول
              </Link>
            }
          >
            علت تعلیق معمولاً اتمام موجودی کیف پول است. پس از شارژ، سرور به صورت خودکار روشن می‌شود.
            {server.deleteAfter ? (
              <>
                {' '}
                داده‌های سرور تا <b>{faDateTime(server.deleteAfter)}</b> نگهداری می‌شود.
              </>
            ) : null}
          </Alert>
        ) : null}

        {server.rescueMode ? (
          <Alert tone="warning" title="حالت نجات فعال است">
            سرور در بوت بعدی وارد محیط Rescue می‌شود. پس از رفع مشکل، حالت نجات را غیرفعال و سرور را ریست کنید.
          </Alert>
        ) : null}

        {/* اطلاعات ورود */}
        {showCredentials && credentials ? (
          <Card
            title="اطلاعات ورود به سرور"
            description="این اطلاعات را در جای امنی ذخیره کنید. توصیه می‌شود پس از اولین ورود رمز را تغییر دهید."
            action={
              <Button variant="ghost" size="sm" onClick={() => setShowCredentials(false)}>
                بستن
              </Button>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="label">دستور اتصال</div>
                <div className="flex items-center gap-1.5">
                  <code className="mono ltr flex-1 truncate rounded-lg px-2 py-1.5 text-xs surface-2">
                    ssh {credentials.username}@{server.ipv4 ?? '—'}
                  </code>
                  <CopyButton value={`ssh ${credentials.username}@${server.ipv4 ?? ''}`} />
                </div>
              </div>
              <div>
                <div className="label">رمز عبور روت</div>
                <SecretValue value={credentials.password} />
              </div>
            </div>
          </Card>
        ) : null}

        {/* نوار عملیات سریع */}
        <Card bodyClassName="p-3 sm:p-3">
          <div className="flex flex-wrap items-center gap-2">
            {running ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => act('reboot', 'سرور راه‌اندازی مجدد شود؟')}
                  loading={busy === 'reboot'}
                  disabled={locked}
                  icon={<RotateCw size={14} />}
                >
                  راه‌اندازی مجدد
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => act('shutdown', 'سرور خاموش شود؟ (خاموش کردن نرم)')}
                  loading={busy === 'shutdown'}
                  disabled={locked}
                  icon={<PowerOff size={14} />}
                >
                  خاموش کردن
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => act('reset', 'ریست سخت انجام شود؟ ممکن است باعث از دست رفتن داده‌های ذخیره‌نشده شود.')}
                  loading={busy === 'reset'}
                  disabled={locked}
                  icon={<Zap size={14} />}
                >
                  ریست سخت
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={() => act('poweron')}
                loading={busy === 'poweron'}
                disabled={locked || suspended}
                icon={<Power size={14} />}
              >
                روشن کردن
              </Button>
            )}

            <div className="mx-1 hidden h-5 w-px bg-[var(--border)] sm:block" />

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setTab('access')}
              icon={<Terminal size={14} />}
            >
              کنسول و دسترسی
            </Button>

            {server.hasRootPassword ? (
              <Button variant="ghost" size="sm" onClick={revealPassword} icon={<KeyRound size={14} />}>
                نمایش رمز روت
              </Button>
            ) : null}

            <div className="flex-1" />

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTab('settings')}
              icon={<Send size={14} />}
            >
              انتقال سرور
            </Button>

            <Link href={`/dashboard/tickets/new?serverId=${server.id}`}>
              <Button variant="ghost" size="sm" icon={<LifeBuoy size={14} />}>
                درخواست پشتیبانی
              </Button>
            </Link>

            <Button
              variant="danger"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              disabled={locked}
              icon={<Trash2 size={14} />}
            >
              حذف سرور
            </Button>
          </div>
        </Card>

        {/* خلاصه */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MiniStat
            label="آدرس IPv4"
            value={server.ipv4 ?? '—'}
            copy={server.ipv4 ?? undefined}
            mono
            hint={
              server.ipv4 && server.ipReachState !== 'SKIPPED' ? (
                <span className="flex items-center gap-1">
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      server.ipReachState === 'OK'
                        ? 'bg-emerald-500'
                        : server.ipReachState === 'BLOCKED'
                          ? 'bg-red-500'
                          : server.ipReachState === 'INCONCLUSIVE'
                            ? 'bg-amber-500'
                            : 'bg-current opacity-40',
                    )}
                  />
                  {IP_REACH_FA[server.ipReachState]?.label}
                </span>
              ) : undefined
            }
          />
          <MiniStat
            label="مشخصات"
            value={`${formatNumber(server.cores)} هسته · ${formatNumber(server.memory)} گیگ رم`}
            hint={`${formatNumber(server.disk)} گیگابایت دیسک NVMe`}
          />
          <MiniStat
            label="ترافیک ماهانه"
            value={formatTraffic(server.includedTraffic)}
            hint={
              server.traffic.length
                ? `مصرف امروز: ${formatTraffic(server.traffic[0].outgoing + server.traffic[0].incoming)}`
                : 'هنوز مصرفی ثبت نشده'
            }
          />
          <MiniStat
            label={server.billingCycle === 'HOURLY' ? 'هزینه ساعتی' : 'هزینه ماهانه'}
            value={
              server.billingCycle === 'HOURLY'
                ? formatToman(server.priceHourly)
                : formatToman(server.priceMonthly)
            }
            hint={
              server.billingCycle === 'HOURLY'
                ? `سقف ماهانه ${formatToman(server.priceMonthly)}`
                : server.expiresAt
                  ? `سررسید ${faRelative(server.expiresAt)}`
                  : undefined
            }
          />
        </div>

        {/* تب‌ها */}
        <Card bodyClassName="p-0">
          <Tabs tabs={TABS} active={tab} onChange={setTab} className="px-2" />
          <div className="p-4 sm:p-5">
            {tab === 'overview' ? <OverviewTab server={server} /> : null}
            {tab === 'metrics' ? <MetricsTab serverId={server.id} disabled={!running} /> : null}
            {tab === 'monitor' ? <MonitorTab server={server} /> : null}
            {tab === 'access' ? <AccessTab server={server} onAction={act} busy={busy} /> : null}
            {tab === 'rebuild' ? <RebuildTab server={server} onDone={() => mutate()} /> : null}
            {tab === 'snapshots' ? <SnapshotsTab server={server} onDone={() => mutate()} /> : null}
            {tab === 'firewall' ? <FirewallTab server={server} /> : null}
            {tab === 'ip-change' ? <IpChangeTab server={server} onDone={() => mutate()} /> : null}
            {tab === 'billing' ? <BillingTab server={server} onDone={() => mutate()} /> : null}
            {tab === 'settings' ? (
              <SettingsTab
                server={server}
                onDone={() => mutate()}
                onDeleted={() => router.push('/dashboard/servers')}
              />
            ) : null}
          </div>
        </Card>

        {/* تاریخچه عملیات */}
        {server.actions.length ? (
          <Card title="تاریخچه عملیات" bodyClassName="p-0">
            <div className="scroll-x">
              <table className="table table-cards">
                <thead>
                  <tr>
                    <th>عملیات</th>
                    <th>وضعیت</th>
                    <th>زمان</th>
                  </tr>
                </thead>
                <tbody>
                  {server.actions.map((a) => (
                    <tr key={a.id}>
                      <td data-label="عملیات" className="text-xs font-medium">{SERVER_ACTION_FA[a.action] ?? a.action}</td>
                      <td data-label="وضعیت">
                        <Badge tone={a.status === 'SUCCESS' ? 'ok' : a.status === 'ERROR' ? 'bad' : 'warn'}>
                          {a.status === 'SUCCESS' ? 'موفق' : a.status === 'ERROR' ? 'ناموفق' : 'در حال اجرا'}
                        </Badge>
                        {a.error ? <div className="mt-1 text-[11px] text-red-500">{a.error}</div> : null}
                      </td>
                      <td data-label="زمان" className="text-xs muted">{faDateTime(a.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}
      </div>

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={destroy}
        loading={deleting}
        title="حذف سرور"
        confirmLabel="حذف قطعی سرور"
        requireText={server.name}
        message={
          <div className="space-y-2 text-xs leading-6">
            <p>
              سرور <span className="mono">{server.name}</span> برای همیشه حذف می‌شود و همه داده‌های آن از بین می‌رود.
              این کار قابل بازگشت نیست.
            </p>
            {server.billingCycle === 'MONTHLY' && server.expiresAt ? (
              <p className="text-emerald-600">بخش استفاده‌نشدهٔ دورهٔ ماهانه به کیف پول شما بازگردانده می‌شود.</p>
            ) : null}
            <p className="muted">برای تایید، نام سرور را دقیقاً وارد کنید:</p>
          </div>
        }
      />
    </>
  );
}

function MiniStat({
  label,
  value,
  hint,
  copy,
  mono,
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  copy?: string;
  mono?: boolean;
}) {
  return (
    <div className="card p-4">
      <div className="text-[11px] muted">{label}</div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className={cn('truncate text-sm font-bold', mono && 'mono ltr')}>{value}</span>
        {copy ? <CopyButton value={copy} size={13} /> : null}
      </div>
      {hint ? <div className="mt-1 text-[11px] muted">{hint}</div> : null}
    </div>
  );
}
