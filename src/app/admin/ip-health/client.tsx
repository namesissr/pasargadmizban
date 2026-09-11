'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  ShieldCheck,
  ShieldAlert,
  Radar,
  MapPin,
  PlayCircle,
  Repeat,
  Unlock,
  Lock,
  HelpCircle,
  Banknote,
  Trash2,
  Search,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Stat,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiGet, apiPatch, apiPost, apiPut, errorMessage, fetcher } from '@/lib/client';
import { faRelative, locationFa, cn } from '@/lib/utils';

type PrefixRow = {
  id: string;
  prefix: string;
  locationName: string | null;
  okCount: number;
  badCount: number;
  lastOkAt: string | null;
  lastBadAt: string | null;
  blocked: boolean;
  pinned: boolean;
  note: string | null;
};

type Data = {
  agent: { ok: boolean; message: string };
  overview: { total: number; blocked: number; blockedThisWeek: number };
  byLocation: {
    locationName: string;
    prefixes: number;
    ok: number;
    bad: number;
    samples: number;
    successPercent: number | null;
  }[];
  blocked: PrefixRow[];
  servers: Record<string, number>;
  autoSwaps: { total: number; last30Days: number };
};

const fa = (n: number) => new Intl.NumberFormat('fa-IR').format(n);

export function IpHealthClient() {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<Data>('/api/admin/ip-health', fetcher, {
    refreshInterval: 60_000,
  });

  const [testIp, setTestIp] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ verdict: string; message: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [busyPrefix, setBusyPrefix] = useState<string | null>(null);
  const [newPrefix, setNewPrefix] = useState('');

  if (isLoading && !data) return <LoadingBlock label="در حال خواندن وضعیت آدرس‌ها…" />;
  if (!data) return <Alert tone="error">دریافت اطلاعات ممکن نشد.</Alert>;

  async function test() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiPost<{ verdict: string; message: string }>('/api/admin/ip-health', {
        ip: testIp.trim(),
      });
      setTestResult(res);
      mutate();
    } catch (err) {
      setTestResult({ verdict: 'ERROR', message: errorMessage(err) });
    } finally {
      setTesting(false);
    }
  }

  async function runNow() {
    setRunning(true);
    try {
      const res = await apiPut<{ message: string }>('/api/admin/ip-health');
      toast.success(res.message);
      mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRunning(false);
    }
  }

  async function setPrefix(prefix: string, patch: { blocked?: boolean; pinned?: boolean }) {
    setBusyPrefix(prefix);
    try {
      const res = await apiPatch<{ message: string }>('/api/admin/ip-health', { prefix, ...patch });
      toast.success(res.message);
      setNewPrefix('');
      mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyPrefix(null);
    }
  }

  const states = data.servers;
  const verified = states.OK ?? 0;
  const problem = states.BLOCKED ?? 0;

  return (
    <div className="space-y-4">
      {/* وضعیت سرویس آزمایش */}
      {data.agent.ok ? (
        <Alert tone="success" title="سرویس آزمایش در ایران فعال است">
          {data.agent.message}
        </Alert>
      ) : (
        <Alert tone="error" title="سرویس آزمایش در دسترس نیست">
          <div className="space-y-1.5">
            <p>{data.agent.message}</p>
            <p>
              تا وقتی این سرویس بالا نیاید، پنل نمی‌فهمد آدرس سرور تازه از ایران باز می‌شود یا نه و ممکن است
              مشتری سروری با آدرس مسدود تحویل بگیرد.
            </p>
            <p className="mono ltr text-[11px]">
              node scripts/iran-probe-agent.mjs
            </p>
          </div>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="آدرس‌های تاییدشده"
          value={fa(verified)}
          hint="سرورهایی که دسترسی‌شان از ایران آزمایش شده"
          icon={<ShieldCheck size={15} />}
          tone="ok"
        />
        <Stat
          label="آدرس‌های مسدود"
          value={fa(problem)}
          hint="هنوز عوض نشده‌اند"
          icon={<ShieldAlert size={15} />}
          tone={problem > 0 ? 'bad' : undefined}
        />
        <Stat
          label="تعویض خودکار"
          value={fa(data.autoSwaps.last30Days)}
          hint={`${fa(data.autoSwaps.total)} بار از ابتدا`}
          icon={<Repeat size={15} />}
        />
        <Stat
          label="بلوک‌های سوخته"
          value={fa(data.overview.blocked)}
          hint={`از ${fa(data.overview.total)} بلوک شناخته‌شده`}
          icon={<Radar size={15} />}
          tone={data.overview.blocked > 0 ? 'warn' : undefined}
        />
      </div>

      {/* نرخ موفقیت لوکیشن‌ها */}
      <Card
        title="وضعیت دسترسی هر لوکیشن"
        description="بر پایه آزمایش‌های واقعی همین پنل. لوکیشنی که نرخ بالاتری دارد، برای مشتری ایرانی انتخاب بهتری است."
        action={
          <Button
            variant="secondary"
            size="sm"
            icon={<PlayCircle size={14} />}
            onClick={runNow}
            loading={running}
          >
            اجرای دور بررسی
          </Button>
        }
        bodyClassName={data.byLocation.length ? 'p-0' : undefined}
      >
        {data.byLocation.length === 0 ? (
          <EmptyState
            icon={<MapPin size={26} />}
            title="هنوز داده‌ای جمع نشده"
            description="با ساخته شدن نخستین سرورها، نتیجه آزمایش‌ها اینجا جمع می‌شود و کم‌کم می‌فهمید کدام لوکیشن برای ایران بهتر است."
          />
        ) : (
          <div className="scroll-x">
            <table className="table table-cards">
              <thead>
                <tr>
                  <th>لوکیشن</th>
                  <th>نرخ موفقیت</th>
                  <th>مشاهده موفق</th>
                  <th>مشاهده ناموفق</th>
                  <th>بلوک بررسی‌شده</th>
                </tr>
              </thead>
              <tbody>
                {data.byLocation.map((row) => {
                  const loc = locationFa(row.locationName);
                  const pct = row.successPercent;
                  return (
                    <tr key={row.locationName}>
                      <td data-label="لوکیشن" className="text-xs font-semibold">
                        {loc.flag} {loc.title}
                      </td>
                      <td data-label="نرخ موفقیت">
                        {pct === null ? (
                          <span className="text-xs muted">—</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full surface-2">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500',
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="tabular text-xs font-bold">{fa(pct)}٪</span>
                          </div>
                        )}
                      </td>
                      <td data-label="مشاهده موفق" className="tabular text-xs">
                        {fa(row.ok)}
                      </td>
                      <td data-label="مشاهده ناموفق" className="tabular text-xs">
                        {fa(row.bad)}
                      </td>
                      <td data-label="بلوک بررسی‌شده" className="tabular text-xs muted">
                        {fa(row.prefixes)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* آزمایش دستی */}
      <Card
        title="آزمایش یک آدرس"
        description="آدرس دلخواهی را از داخل ایران امتحان کنید. برای بررسی شکایت مشتری کاربردی است."
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field label="آدرس IPv4" className="flex-1">
            <Input
              value={testIp}
              onChange={(e) => setTestIp(e.target.value)}
              placeholder="95.216.181.24"
              className="ltr mono"
              dir="ltr"
            />
          </Field>
          <Button
            onClick={test}
            loading={testing}
            disabled={!/^\d{1,3}(\.\d{1,3}){3}$/.test(testIp.trim())}
            icon={<Radar size={15} />}
          >
            آزمایش
          </Button>
        </div>

        {testResult ? (
          <div className="mt-3">
            <Alert
              tone={
                testResult.verdict === 'OK' ? 'success' : testResult.verdict === 'BLOCKED' ? 'error' : 'warning'
              }
            >
              {testResult.message}
            </Alert>
          </div>
        ) : null}
      </Card>

      {/* بلوک‌های سوخته */}
      <Card
        title="بلوک‌های سوخته"
        description="رنج‌های /24 که پنل آن‌ها را برای ایران مسدود تشخیص داده. سرور تازه روی این رنج‌ها تحویل نمی‌شود."
        bodyClassName={data.blocked.length ? 'space-y-3' : undefined}
      >
        <div className="mb-4 flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-end">
          <Field
            label="افزودن دستی بلوک"
            hint="سه بخش نخست آدرس، مثل ۹۵.۲۱۶.۱۸۱"
            className="flex-1"
          >
            <Input
              value={newPrefix}
              onChange={(e) => setNewPrefix(e.target.value)}
              placeholder="95.216.181"
              className="ltr mono"
              dir="ltr"
            />
          </Field>
          <Button
            variant="secondary"
            onClick={() => setPrefix(newPrefix.trim(), { blocked: true, pinned: true })}
            loading={busyPrefix === newPrefix.trim()}
            disabled={!/^\d{1,3}(\.\d{1,3}){2}$/.test(newPrefix.trim())}
            icon={<Lock size={15} />}
          >
            سوخته علامت بزن
          </Button>
        </div>

        {data.blocked.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck size={26} />}
            title="فعلاً بلوک سوخته‌ای نداریم"
            description="هر بار آدرسی از ایران باز نشود، بلوکش اینجا ثبت می‌شود و سرورهای بعدی رویش تحویل داده نمی‌شوند."
          />
        ) : (
          data.blocked.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mono ltr text-sm font-bold">{row.prefix}.0/24</span>
                  {row.pinned ? <Badge tone="muted">دستی</Badge> : <Badge tone="warn">خودکار</Badge>}
                  {row.locationName ? (
                    <span className="text-[11px] muted">{locationFa(row.locationName).title}</span>
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] muted">
                  <span className="tabular">{fa(row.badCount)} مشاهده ناموفق</span>
                  {row.okCount > 0 ? <span className="tabular">{fa(row.okCount)} مشاهده موفق</span> : null}
                  {row.lastBadAt ? <span>آخرین بار {faRelative(row.lastBadAt)}</span> : null}
                </div>
                {row.note ? <p className="mt-1 text-[11px] muted">{row.note}</p> : null}
              </div>

              <Button
                variant="ghost"
                size="sm"
                icon={<Unlock size={14} />}
                loading={busyPrefix === row.prefix}
                onClick={() => setPrefix(row.prefix, { blocked: false, pinned: true })}
              >
                سالم اعلام کن
              </Button>
            </div>
          ))
        )}
      </Card>

      <OrphanIpCard />

      <Card title="راهنما" bodyClassName="text-xs leading-7 muted space-y-1.5">
        <p className="flex items-start gap-1.5">
          <HelpCircle size={14} className="mt-1 shrink-0" />
          پنل روی سرور خارج اجرا می‌شود، پس خودش نمی‌تواند بفهمد یک آدرس از ایران باز است یا نه. این کار را
          سرویس کوچکی انجام می‌دهد که روی یکی از سرورهای ایرانی شما اجرا می‌شود.
        </p>
        <p>
          برای اینکه «مسدود بودن» با «هنوز بالا نیامدن سرور» اشتباه نشود، همزمان چند آدرس از سرورهای سالم خودتان
          هم آزمایش می‌شود. اگر آن‌ها جواب بدهند و آدرس تازه ندهد، یعنی آدرس مسدود است.
        </p>
        <p>
          تشخیص «مسدود» یعنی پنل خودش و رایگان آدرس را عوض می‌کند. سقف دفعات و سایر رفتارها در بخش تنظیمات
          قابل تغییر است.
        </p>
      </Card>
    </div>
  );
}

type Orphan = {
  accountName: string;
  hetznerId: number;
  ip: string;
  createdAt: string;
};

/**
 * آدرس‌هایی که در هتزنر مانده‌اند ولی به هیچ سروری وصل نیستند.
 * هر کدام ماهانه هزینه دارد؛ جاروب ساعتی خودکار پاکشان می‌کند و اینجا هم
 * می‌شود دستی و فوری تمیزشان کرد.
 */
function OrphanIpCard() {
  const toast = useToast();
  const [orphans, setOrphans] = useState<Orphan[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  async function scan() {
    setScanning(true);
    try {
      const res = await apiGet<{ orphans: Orphan[]; errors: string[] }>('/api/admin/ip-cleanup');
      setOrphans(res.orphans);
      setErrors(res.errors);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setScanning(false);
    }
  }

  async function clean() {
    setCleaning(true);
    try {
      const res = await apiPost<{ message: string }>('/api/admin/ip-cleanup');
      toast.success(res.message);
      await scan();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setCleaning(false);
    }
  }

  return (
    <Card
      title="آدرس‌های بلااستفاده در هتزنر"
      description="هر Primary IP که به سروری وصل نباشد، ماهانه هزینه دارد. جاروب خودکار هر ساعت این‌ها را پاک می‌کند؛ اینجا می‌توانید همین حالا هم بررسی و حذف کنید."
      action={
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<Search size={14} />}
            onClick={scan}
            loading={scanning}
          >
            بررسی حساب‌ها
          </Button>
          {orphans?.length ? (
            <Button size="sm" icon={<Trash2 size={14} />} onClick={clean} loading={cleaning}>
              حذف همه
            </Button>
          ) : null}
        </div>
      }
    >
      {orphans === null ? (
        <p className="flex items-center gap-1.5 text-xs leading-7 muted">
          <Banknote size={14} />
          برای دیدن آدرس‌های جدا افتاده، روی «بررسی حساب‌ها» بزنید. آدرس‌های جوان‌تر از نیم ساعت شمرده
          نمی‌شوند تا با تعویض در جریان تداخل نشود.
        </p>
      ) : orphans.length === 0 ? (
        <Alert tone="success" title="حساب‌های هتزنر تمیزند">
          هیچ آدرس بلااستفاده‌ای پیدا نشد؛ هزینه اضافه‌ای بابت آی‌پی پرداخت نمی‌کنید.
        </Alert>
      ) : (
        <div className="space-y-2">
          <Alert tone="warning" title={`${fa(orphans.length)} آدرس بلااستفاده پیدا شد`}>
            این آدرس‌ها به هیچ سروری وصل نیستند و فقط هزینه می‌سازند.
          </Alert>
          {orphans.map((o) => (
            <div
              key={`${o.accountName}-${o.hetznerId}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs surface-2"
            >
              <span className="mono ltr font-semibold">{o.ip}</span>
              <span className="muted">
                {o.accountName} · ساخته‌شده {faRelative(o.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}

      {errors.length ? (
        <div className="mt-3">
          <Alert tone="error" title="بعضی حساب‌ها بررسی نشدند">
            {errors.join(' · ')}
          </Alert>
        </div>
      ) : null}
    </Card>
  );
}
