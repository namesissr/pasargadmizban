'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Activity, Radio, Save, Trash2, TrendingUp, AlertTriangle } from 'lucide-react';
import { Alert, Badge, Button, Field, Input, LoadingBlock, Select, Stat, Toggle } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiDelete, apiPost, errorMessage, fetcher } from '@/lib/client';
import { formatNumber } from '@/lib/money';
import { faDateTime, faDate, cn } from '@/lib/utils';
import type { ServerData } from '../detail';

type Monitor = {
  id: string;
  enabled: boolean;
  checkType: string;
  port: number;
  httpPath: string;
  expectStatus: number;
  intervalMinutes: number;
  failThreshold: number;
  timeoutSeconds: number;
  status: 'UNKNOWN' | 'UP' | 'DOWN' | 'PAUSED';
  lastCheckAt: string | null;
  lastLatencyMs: number | null;
  lastError: string | null;
  downSince: string | null;
};

type Summary = {
  uptimePercent: number | null;
  totalChecks: number;
  avgLatencyMs: number;
  downtimeSeconds: number;
  incidents: {
    id: string;
    startedAt: string;
    endedAt: string | null;
    durationSeconds: number | null;
    reason: string | null;
  }[];
  daily: { date: string; uptime: number | null; checks: number; avgLatencyMs: number }[];
};

type Response = {
  available: boolean;
  monitor: Monitor | null;
  suggestion: { checkType: string; port: number; intervalMinutes: number } | null;
  summary: Summary | null;
};

const STATUS_FA: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }> = {
  UP: { label: 'در دسترس', tone: 'ok' },
  DOWN: { label: 'قطع', tone: 'bad' },
  UNKNOWN: { label: 'در حال بررسی', tone: 'warn' },
  PAUSED: { label: 'متوقف', tone: 'muted' },
};

export function MonitorTab({ server }: { server: ServerData }) {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<Response>(`/api/servers/${server.id}/monitor`, fetcher, {
    refreshInterval: 60_000,
  });

  const [patch, setPatch] = useState<Partial<Monitor>>({});
  const [saving, setSaving] = useState(false);

  if (isLoading && !data) return <LoadingBlock />;
  if (!data) return <Alert tone="error">دریافت اطلاعات پایش ممکن نشد.</Alert>;

  if (!data.available) {
    return (
      <Alert tone="info" title="پایش سرور در دسترس نیست">
        این قابلیت توسط مدیر سامانه غیرفعال شده است.
      </Alert>
    );
  }

  const m = data.monitor;
  const current = {
    enabled: m?.enabled ?? true,
    checkType: m?.checkType ?? data.suggestion?.checkType ?? 'tcp',
    port: m?.port ?? data.suggestion?.port ?? 22,
    httpPath: m?.httpPath ?? '/',
    expectStatus: m?.expectStatus ?? 0,
    intervalMinutes: m?.intervalMinutes ?? data.suggestion?.intervalMinutes ?? 5,
    failThreshold: m?.failThreshold ?? 2,
    timeoutSeconds: m?.timeoutSeconds ?? 8,
    ...patch,
  };
  const dirty = Object.keys(patch).length > 0;

  function set<K extends keyof Monitor>(key: K, value: Monitor[K]) {
    setPatch((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await apiPost<{ message: string }>(`/api/servers/${server.id}/monitor`, current);
      toast.success(res.message);
      setPatch({});
      mutate();
    } catch (err) {
      toast.error('ذخیره تنظیمات پایش انجام نشد', errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!window.confirm('پایش این سرور حذف شود؟ تاریخچه آپ‌تایم هم پاک می‌شود.')) return;
    try {
      await apiDelete(`/api/servers/${server.id}/monitor`);
      toast.success('پایش حذف شد.');
      setPatch({});
      mutate();
    } catch (err) {
      toast.error('حذف پایش ممکن نشد', errorMessage(err));
    }
  }

  const st = m ? (STATUS_FA[m.status] ?? STATUS_FA.UNKNOWN) : null;

  return (
    <div className="space-y-6">
      {!m ? (
        <Alert tone="info" title="پایش این سرور فعال نیست">
          با فعال کردن پایش، هر چند دقیقه از بیرون به سرور شما وصل می‌شویم. اگر سرویس بالا نیاید، بلافاصله از طریق
          تلگرام و ایمیل به شما خبر می‌دهیم.
        </Alert>
      ) : null}

      {/* وضعیت فعلی */}
      {m && data.summary ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="وضعیت فعلی"
            value={st!.label}
            hint={m.lastCheckAt ? `آخرین بررسی: ${faDateTime(m.lastCheckAt)}` : 'هنوز بررسی نشده'}
            icon={<Radio size={16} />}
            tone={st!.tone === 'ok' ? 'ok' : st!.tone === 'bad' ? 'bad' : 'warn'}
          />
          <Stat
            label="آپ‌تایم ۳۰ روز"
            value={data.summary.uptimePercent !== null ? `${formatNumber(data.summary.uptimePercent, 2)}٪` : '—'}
            hint={`از ${formatNumber(data.summary.totalChecks)} بررسی`}
            icon={<TrendingUp size={16} />}
            tone={
              data.summary.uptimePercent === null
                ? undefined
                : data.summary.uptimePercent >= 99.5
                  ? 'ok'
                  : data.summary.uptimePercent >= 98
                    ? 'warn'
                    : 'bad'
            }
          />
          <Stat
            label="زمان پاسخ"
            value={m.lastLatencyMs ? `${formatNumber(m.lastLatencyMs)} میلی‌ثانیه` : '—'}
            hint={data.summary.avgLatencyMs ? `میانگین: ${formatNumber(data.summary.avgLatencyMs)}` : undefined}
            icon={<Activity size={16} />}
          />
          <Stat
            label="قطعی‌های ۳۰ روز"
            value={formatNumber(data.summary.incidents.length)}
            hint={
              data.summary.downtimeSeconds
                ? `مجموع ${formatNumber(Math.round(data.summary.downtimeSeconds / 60))} دقیقه`
                : 'بدون قطعی'
            }
            icon={<AlertTriangle size={16} />}
            tone={data.summary.incidents.length ? 'warn' : 'ok'}
          />
        </div>
      ) : null}

      {m?.status === 'DOWN' ? (
        <Alert tone="error" title="سرور در حال حاضر در دسترس نیست">
          {m.lastError ?? 'اتصال برقرار نشد.'}
          {m.downSince ? <> از {faDateTime(m.downSince)} قطع است.</> : null}
        </Alert>
      ) : null}

      {/* نوار آپ‌تایم روزانه */}
      {data.summary?.daily.length ? (
        <section>
          <h3 className="mb-3 text-xs font-bold">آپ‌تایم روزانه</h3>
          <div className="scroll-x">
            <div className="flex min-w-max items-end gap-1">
              {data.summary.daily.map((d) => {
                const value = d.uptime ?? 0;
                const color =
                  d.uptime === null
                    ? 'var(--border)'
                    : value >= 99.5
                      ? '#10b981'
                      : value >= 95
                        ? '#f59e0b'
                        : '#ef4444';
                return (
                  <div
                    key={d.date}
                    title={`${faDate(d.date)} — ${d.uptime !== null ? `${formatNumber(d.uptime, 2)}٪` : 'بدون داده'}`}
                    className="w-3 rounded-sm transition hover:opacity-70"
                    style={{ height: 40, background: color, opacity: d.uptime === null ? 0.35 : 1 }}
                  />
                );
              })}
            </div>
          </div>
          <div className="mt-2 flex justify-between text-[10px] muted">
            <span>{faDate(data.summary.daily[0]?.date)}</span>
            <span>امروز</span>
          </div>
        </section>
      ) : null}

      {/* تنظیمات */}
      <section className={m ? 'border-t pt-5' : ''}>
        <h3 className="mb-3 text-xs font-bold">تنظیمات پایش</h3>
        <div className="space-y-4">
          <Toggle
            checked={current.enabled}
            onChange={(v) => set('enabled', v)}
            label="پایش فعال باشد"
            description="هر چند دقیقه از بیرون به سرور شما وصل می‌شویم تا از در دسترس بودنش مطمئن شویم."
          />

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Field label="نوع بررسی" hint="TCP برای هر سرویسی، HTTP برای وب‌سایت.">
              <Select value={current.checkType} onChange={(e) => set('checkType', e.target.value)}>
                <option value="tcp">اتصال TCP (مثلاً SSH)</option>
                <option value="http">درخواست HTTP</option>
                <option value="https">درخواست HTTPS</option>
              </Select>
            </Field>

            <Field label="پورت">
              <Input
                type="number"
                min={1}
                max={65535}
                value={current.port}
                onChange={(e) => set('port', Number(e.target.value))}
                className="ltr tabular"
                dir="ltr"
              />
            </Field>

            <Field label="فاصله بررسی" hint="هرچه کمتر، سریع‌تر باخبر می‌شوید.">
              <Select value={current.intervalMinutes} onChange={(e) => set('intervalMinutes', Number(e.target.value))}>
                {[1, 2, 5, 10, 15, 30, 60].map((v) => (
                  <option key={v} value={v}>
                    هر {formatNumber(v)} دقیقه
                  </option>
                ))}
              </Select>
            </Field>

            {current.checkType !== 'tcp' ? (
              <>
                <Field label="مسیر درخواست">
                  <Input
                    value={current.httpPath}
                    onChange={(e) => set('httpPath', e.target.value)}
                    className="ltr mono"
                    dir="ltr"
                    placeholder="/"
                  />
                </Field>
                <Field label="کد وضعیت مورد انتظار" hint="صفر یعنی هر کدی زیر ۵۰۰ قبول است.">
                  <Input
                    type="number"
                    min={0}
                    max={599}
                    value={current.expectStatus}
                    onChange={(e) => set('expectStatus', Number(e.target.value))}
                    className="ltr tabular"
                    dir="ltr"
                  />
                </Field>
              </>
            ) : null}

            <Field label="آستانه هشدار" hint="پس از چند بررسی ناموفق پیاپی هشدار بدهیم.">
              <Select value={current.failThreshold} onChange={(e) => set('failThreshold', Number(e.target.value))}>
                {[1, 2, 3, 5].map((v) => (
                  <option key={v} value={v}>
                    {formatNumber(v)} بار
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="مهلت پاسخ (ثانیه)">
              <Input
                type="number"
                min={2}
                max={30}
                value={current.timeoutSeconds}
                onChange={(e) => set('timeoutSeconds', Number(e.target.value))}
                className="ltr tabular"
                dir="ltr"
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button onClick={save} loading={saving} disabled={Boolean(m) && !dirty} icon={<Save size={15} />}>
              {m ? 'ذخیره تنظیمات' : 'فعال‌سازی پایش'}
            </Button>
            {m ? (
              <Button variant="ghost" size="sm" onClick={remove} icon={<Trash2 size={14} />}>
                حذف پایش
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      {/* تاریخچه قطعی */}
      {data.summary?.incidents.length ? (
        <section className="border-t pt-5">
          <h3 className="mb-3 text-xs font-bold">تاریخچه قطعی</h3>
          <div className="scroll-x">
            <table className="table table-cards">
              <thead>
                <tr>
                  <th>شروع</th>
                  <th>پایان</th>
                  <th>مدت</th>
                  <th>علت</th>
                </tr>
              </thead>
              <tbody>
                {data.summary.incidents.map((i) => (
                  <tr key={i.id}>
                    <td data-label="شروع" className="whitespace-nowrap text-xs">{faDateTime(i.startedAt)}</td>
                    <td data-label="پایان" className="whitespace-nowrap text-xs muted">
                      {i.endedAt ? faDateTime(i.endedAt) : <Badge tone="bad">همچنان قطع</Badge>}
                    </td>
                    <td data-label="مدت" className="tabular whitespace-nowrap text-xs">
                      {i.durationSeconds
                        ? i.durationSeconds >= 3600
                          ? `${formatNumber(Math.round(i.durationSeconds / 3600))} ساعت`
                          : `${formatNumber(Math.round(i.durationSeconds / 60))} دقیقه`
                        : '—'}
                    </td>
                    <td data-label="علت" className="text-xs muted">{i.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className={cn('rounded-xl p-4 text-[11px] leading-7 surface-2')}>
        <div className="font-semibold">تفاوت این پایش با وضعیت سرور چیست؟</div>
        <p className="mt-1 muted">
          وضعیتی که در بالای صفحه می‌بینید فقط می‌گوید ماشین مجازی روشن است. این پایش از بیرون به سرویس واقعی شما وصل
          می‌شود؛ پس اگر سیستم‌عامل هنگ کند، وب‌سرور بالا نیاید یا فایروال اشتباه تنظیم شود، متوجه می‌شوید.
        </p>
      </div>
    </div>
  );
}
