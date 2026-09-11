'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import {
  Save,
  Send,
  Unlink,
  BellRing,
  Wallet,
  Moon,
  MessageCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CopyButton,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Select,
  Toggle,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, apiDelete, apiPost, errorMessage, fetcher } from '@/lib/client';
import { formatToman, formatNumber } from '@/lib/money';
import { faDateTime, faDuration, cn } from '@/lib/utils';

type Prefs = {
  emailEnabled: boolean;
  smsEnabled: boolean;
  telegramEnabled: boolean;
  lowBalanceEnabled: boolean;
  lowBalanceHours: number;
  lowBalanceAmount: number;
  trafficAlertEnabled: boolean;
  trafficAlertPercent: number;
  monthlyBudget: number;
  budgetAlertPercent: number;
  serverEvents: boolean;
  billingEvents: boolean;
  ticketEvents: boolean;
  monitorEvents: boolean;
  newsEvents: boolean;
  weeklyReport: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
};

type Response = {
  preferences: Prefs;
  defaults: { lowBalanceHours: number; trafficAlertPercent: number; channels: Record<string, boolean> };
  kinds: Record<string, string>;
  channels: { email: boolean; sms: boolean; telegram: boolean };
  telegram:
    | { linked: true; username: string | null; firstName: string | null; active: boolean; linkedAt: string }
    | { linked: false };
  botUsername: string;
  estimate: { hourlyBurn: number; thresholdAmount: number; balance: number; hoursLeft: number | null };
};

const HOUR_PRESETS = [12, 24, 48, 72, 120, 168];

export function NotificationSettingsClient() {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<Response>('/api/notifications/preferences', fetcher);

  const [patch, setPatch] = useState<Partial<Prefs>>({});
  const [saving, setSaving] = useState(false);

  if (isLoading && !data) return <LoadingBlock />;
  if (!data) return <Alert tone="error">دریافت تنظیمات ممکن نشد.</Alert>;

  const p = { ...data.preferences, ...patch };
  const dirty = Object.keys(patch).length > 0;

  function set<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    setPatch((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await api<{ message: string }>('/api/notifications/preferences', {
        method: 'PATCH',
        body: patch,
      });
      toast.success(res.message);
      setPatch({});
      mutate();
    } catch (err) {
      toast.error('ذخیره تنظیمات انجام نشد', errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // مبلغی که با تنظیم فعلی، هشدار در آن فرستاده می‌شود
  const thresholdAmount = data.estimate.hourlyBurn * p.lowBalanceHours;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        {/* هشدار اعتبار */}
        <Card
          title="هشدار اتمام اعتبار"
          description="مهم‌ترین هشدار پنل. پیش از اینکه موجودی تمام شود و سرورها تعلیق شوند، خبردار می‌شوید."
        >
          <div className="space-y-5">
            <Toggle
              checked={p.lowBalanceEnabled}
              onChange={(v) => set('lowBalanceEnabled', v)}
              label="هشدار اعتبار رو به اتمام"
              description="بر اساس مصرف واقعی سرورهای شما محاسبه می‌شود، نه یک مبلغ ثابت."
            />

            {p.lowBalanceEnabled ? (
              <>
                <div>
                  <span className="label">چند ساعت قبل از اتمام اعتبار به من خبر بده؟</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {HOUR_PRESETS.map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => set('lowBalanceHours', h)}
                        className={cn(
                          'rounded-xl border px-3 py-2 text-xs font-semibold transition',
                          p.lowBalanceHours === h
                            ? 'border-[var(--color-brand-500)] bg-[color-mix(in_srgb,var(--color-brand-500)_10%,transparent)]'
                            : 'muted hover:bg-[var(--surface-2)]',
                        )}
                      >
                        {h >= 24 ? `${formatNumber(h / 24)} روز` : `${formatNumber(h)} ساعت`}
                        {h === data.defaults.lowBalanceHours ? (
                          <span className="mr-1 text-[10px] opacity-70">(پیش‌فرض)</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 max-w-xs">
                    <Field label="یا مقدار دلخواه (ساعت)">
                      <Input
                        type="number"
                        min={1}
                        max={720}
                        value={p.lowBalanceHours}
                        onChange={(e) => set('lowBalanceHours', Math.max(1, Number(e.target.value)))}
                        className="ltr tabular"
                        dir="ltr"
                      />
                    </Field>
                  </div>
                </div>

                <div className="rounded-xl p-3 text-xs leading-7 surface-2">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <Wallet size={14} /> با تنظیم فعلی شما
                  </div>
                  {data.estimate.hourlyBurn > 0 ? (
                    <>
                      <p className="mt-1 muted">
                        مصرف فعلی شما ساعتی {formatToman(data.estimate.hourlyBurn)} است. وقتی موجودی به حدود{' '}
                        <b className="text-[var(--text)]">{formatToman(thresholdAmount)}</b> برسد، هشدار می‌گیرید.
                      </p>
                      {data.estimate.hoursLeft !== null ? (
                        <p className="mt-1 muted">
                          موجودی فعلی: {formatToman(data.estimate.balance)} — کافی برای{' '}
                          {faDuration(data.estimate.hoursLeft * 3600_000)}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="mt-1 muted">
                      در حال حاضر سرویس فعالی ندارید، پس هشداری فرستاده نمی‌شود. پس از ساخت اولین سرور این محاسبه فعال
                      می‌شود.
                    </p>
                  )}
                </div>

                <Field
                  label="هشدار اضافه وقتی موجودی از این مبلغ کمتر شد (تومان)"
                  hint="اختیاری. صفر یعنی فقط بر اساس ساعت هشدار بده."
                >
                  <Input
                    type="number"
                    min={0}
                    step={50000}
                    value={p.lowBalanceAmount}
                    onChange={(e) => set('lowBalanceAmount', Math.max(0, Number(e.target.value)))}
                    className="ltr tabular"
                    dir="ltr"
                  />
                </Field>
              </>
            ) : (
              <Alert tone="warning">
                با خاموش بودن این هشدار، ممکن است بدون اطلاع قبلی موجودی شما تمام و سرورها تعلیق شوند.
              </Alert>
            )}
          </div>
        </Card>

        {/* تلگرام */}
        <TelegramCard data={data} onChange={() => mutate()} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        {/* کانال‌ها و رویدادها */}
        <Card title="کانال‌های دریافت" description="اعلان‌ها همیشه در پنل ثبت می‌شوند؛ این‌ها کانال‌های بیرونی‌اند.">
          <div className="space-y-4">
            <Toggle
              checked={p.emailEnabled}
              onChange={(v) => set('emailEnabled', v)}
              disabled={!data.channels.email}
              label="ایمیل"
              description={data.channels.email ? 'برای رویدادهای مهم مثل تعلیق و قطعی سرور.' : 'در حال حاضر غیرفعال است.'}
            />
            <Toggle
              checked={p.telegramEnabled}
              onChange={(v) => set('telegramEnabled', v)}
              disabled={!data.channels.telegram}
              label="تلگرام"
              description={
                data.channels.telegram
                  ? 'سریع‌ترین کانال. برای دریافت، حساب خود را به ربات وصل کنید.'
                  : 'ربات تلگرام در حال حاضر فعال نیست.'
              }
            />
            <Toggle
              checked={p.smsEnabled}
              onChange={(v) => set('smsEnabled', v)}
              disabled={!data.channels.sms}
              label="پیامک"
              description={data.channels.sms ? 'فقط برای هشدارهای بحرانی.' : 'در حال حاضر غیرفعال است.'}
            />

            <div className="border-t pt-4">
              <span className="label">کدام رویدادها را بفرستیم؟</span>
              <div className="mt-2 space-y-3">
                <Toggle checked={p.serverEvents} onChange={(v) => set('serverEvents', v)} label={data.kinds.server} />
                <Toggle checked={p.billingEvents} onChange={(v) => set('billingEvents', v)} label={data.kinds.billing} />
                <Toggle checked={p.monitorEvents} onChange={(v) => set('monitorEvents', v)} label={data.kinds.monitor} />
                <Toggle checked={p.ticketEvents} onChange={(v) => set('ticketEvents', v)} label={data.kinds.ticket} />
                <Toggle checked={p.newsEvents} onChange={(v) => set('newsEvents', v)} label={data.kinds.news} />
                <Toggle
                  checked={p.weeklyReport}
                  onChange={(v) => set('weeklyReport', v)}
                  label="گزارش هفتگی ایمیلی"
                  description="جمعه‌ها: خلاصه هزینه، ترافیک، وضعیت سرورها و دوام موجودی."
                />
              </div>
              <p className="mt-3 text-[11px] leading-6 muted">
                رویدادهای امنیتی حساب (تغییر رمز، ورود دو مرحله‌ای) همیشه ارسال می‌شوند و قابل خاموش کردن نیستند.
              </p>
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          {/* ترافیک و بودجه */}
          <Card title="هشدار مصرف" description="پیش از رسیدن به سقف ترافیک یا بودجه ماهانه خبردار شوید.">
            <div className="space-y-5">
              <div>
                <Toggle
                  checked={p.trafficAlertEnabled}
                  onChange={(v) => set('trafficAlertEnabled', v)}
                  label="هشدار مصرف ترافیک"
                  description="وقتی مصرف ماهانه سرور به درصد تعیین‌شده برسد."
                />
                {p.trafficAlertEnabled ? (
                  <div className="mt-3 max-w-xs">
                    <Field label="آستانه هشدار (درصد سهمیه)">
                      <Select
                        value={p.trafficAlertPercent}
                        onChange={(e) => set('trafficAlertPercent', Number(e.target.value))}
                      >
                        {[50, 60, 70, 80, 90, 95].map((v) => (
                          <option key={v} value={v}>
                            {formatNumber(v)}٪
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                ) : null}
              </div>

              <div className="border-t pt-4">
                <Field
                  label="سقف هزینه ماهانه (تومان)"
                  hint="فقط هشدار می‌دهد و سرویسی را قطع نمی‌کند. صفر یعنی بدون سقف."
                >
                  <Input
                    type="number"
                    min={0}
                    step={100000}
                    value={p.monthlyBudget}
                    onChange={(e) => set('monthlyBudget', Math.max(0, Number(e.target.value)))}
                    className="ltr tabular"
                    dir="ltr"
                  />
                </Field>
                {p.monthlyBudget > 0 ? (
                  <div className="mt-3 max-w-xs">
                    <Field label="هشدار در چند درصد سقف؟">
                      <Select
                        value={p.budgetAlertPercent}
                        onChange={(e) => set('budgetAlertPercent', Number(e.target.value))}
                      >
                        {[50, 70, 80, 90, 100].map((v) => (
                          <option key={v} value={v}>
                            {formatNumber(v)}٪
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                ) : null}
              </div>
            </div>
          </Card>

          {/* ساعات سکوت */}
          <Card title="ساعات سکوت" description="در این بازه پیام بیرونی فرستاده نمی‌شود، ولی اعلان در پنل ثبت می‌گردد.">
            <div className="space-y-4">
              <Toggle
                checked={p.quietHoursEnabled}
                onChange={(v) => set('quietHoursEnabled', v)}
                label="فعال بودن ساعات سکوت"
                description="هشدارهای فوری مثل قطعی سرور و اتمام اعتبار همچنان ارسال می‌شوند."
              />
              {p.quietHoursEnabled ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="از ساعت">
                    <Select value={p.quietHoursStart} onChange={(e) => set('quietHoursStart', Number(e.target.value))}>
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>
                          {formatNumber(h)}:۰۰
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="تا ساعت">
                    <Select value={p.quietHoursEnd} onChange={(e) => set('quietHoursEnd', Number(e.target.value))}>
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>
                          {formatNumber(h)}:۰۰
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              ) : null}
              <p className="flex items-start gap-1.5 text-[11px] leading-6 muted">
                <Moon size={13} className="mt-1 shrink-0" />
                ساعت‌ها بر اساس وقت تهران محاسبه می‌شود.
              </p>
            </div>
          </Card>
        </div>
      </div>

      {/* نوار ذخیره */}
      <div className="sticky bottom-4 z-20">
        <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3 shadow-lg">
          <span className="flex items-center gap-1.5 text-xs muted">
            <BellRing size={14} />
            {dirty ? 'تغییرات ذخیره‌نشده دارید.' : 'همه تنظیمات ذخیره شده است.'}
          </span>
          <div className="flex gap-2">
            {dirty ? (
              <Button variant="secondary" size="sm" onClick={() => setPatch({})}>
                لغو تغییرات
              </Button>
            ) : null}
            <Button size="sm" onClick={save} loading={saving} disabled={!dirty} icon={<Save size={14} />}>
              ذخیره تنظیمات
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TelegramCard({ data, onChange }: { data: Response; onChange: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<{ code: string; deepLink: string | null; expiresInMinutes: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  const linked = data.telegram.linked;

  useEffect(() => {
    if (!open || !code) return;
    setCountdown(code.expiresInMinutes * 60);
    const timer = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [open, code]);

  // وقتی کاربر در تلگرام کد را می‌فرستد، این بررسی وضعیت را به‌روز می‌کند
  useEffect(() => {
    if (!open || linked) return;
    const timer = setInterval(onChange, 4000);
    return () => clearInterval(timer);
  }, [open, linked, onChange]);

  useEffect(() => {
    if (open && linked) {
      setOpen(false);
      toast.success('حساب تلگرام شما متصل شد.');
    }
  }, [open, linked, toast]);

  async function generate() {
    setBusy('generate');
    try {
      const res = await apiPost<{ code: string; deepLink: string | null; expiresInMinutes: number }>(
        '/api/telegram/link',
      );
      setCode(res);
      setOpen(true);
    } catch (err) {
      toast.error('ساخت کد اتصال ممکن نشد', errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy('test');
    try {
      const res = await api<{ message: string }>('/api/telegram/link', { method: 'PUT' });
      toast.success('ارسال شد', res.message);
    } catch (err) {
      toast.error('ارسال پیام آزمایشی ناموفق بود', errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function unlink() {
    if (!window.confirm('اتصال تلگرام قطع شود؟ دیگر اعلانی در تلگرام دریافت نمی‌کنید.')) return;
    setBusy('unlink');
    try {
      await apiDelete('/api/telegram/link');
      toast.success('اتصال تلگرام قطع شد.');
      onChange();
    } catch (err) {
      toast.error('قطع اتصال ممکن نشد', errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (!data.channels.telegram) {
    return (
      <Card title="ربات تلگرام">
        <Alert tone="info" title="ربات در دسترس نیست">
          ربات تلگرام هنوز توسط مدیر سامانه پیکربندی نشده است.
        </Alert>
      </Card>
    );
  }

  return (
    <>
      <Card
        title={
          <span className="flex items-center gap-2">
            <MessageCircle size={15} className="text-[#229ED9]" /> ربات تلگرام
          </span>
        }
        description="سریع‌ترین راه دریافت هشدار. علاوه بر اعلان، می‌توانید سرورها را از تلگرام کنترل کنید."
        action={
          data.telegram.linked ? (
            <Badge tone="ok">
              <CheckCircle2 size={11} /> متصل
            </Badge>
          ) : (
            <Badge tone="muted">متصل نیست</Badge>
          )
        }
      >
        {data.telegram.linked ? (
          <div className="space-y-4">
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between border-b pb-2">
                <dt className="muted">حساب تلگرام</dt>
                <dd className="ltr">
                  {data.telegram.username ? `@${data.telegram.username}` : (data.telegram.firstName ?? '—')}
                </dd>
              </div>
              <div className="flex justify-between border-b pb-2">
                <dt className="muted">زمان اتصال</dt>
                <dd>{faDateTime(data.telegram.linkedAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="muted">وضعیت</dt>
                <dd>
                  {data.telegram.active ? (
                    <Badge tone="ok">فعال</Badge>
                  ) : (
                    <Badge tone="bad">ربات بلاک شده</Badge>
                  )}
                </dd>
              </div>
            </dl>

            {!data.telegram.active ? (
              <Alert tone="warning" title="ارسال متوقف شده است">
                به نظر می‌رسد ربات را در تلگرام بلاک کرده‌اید. آن را آنبلاک کنید و روی «ارسال پیام آزمایشی» بزنید.
              </Alert>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={test} loading={busy === 'test'} icon={<Send size={13} />}>
                ارسال پیام آزمایشی
              </Button>
              <Button variant="ghost" size="sm" onClick={unlink} loading={busy === 'unlink'} icon={<Unlink size={13} />}>
                قطع اتصال
              </Button>
            </div>

            <div className="rounded-xl p-3 text-[11px] leading-7 surface-2">
              <div className="font-semibold">دستورهای ربات</div>
              <div className="mt-1.5 grid gap-1 muted sm:grid-cols-2">
                <span className="ltr">/balance — موجودی و اعتبار</span>
                <span className="ltr">/servers — فهرست سرورها</span>
                <span className="ltr">/server نام — کنترل سرور</span>
                <span className="ltr">/status — وضعیت کلی</span>
                <span className="ltr">/mute — قطع موقت اعلان</span>
                <span className="ltr">/help — راهنما</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <ul className="space-y-2 text-xs leading-7 muted">
              <li>• هشدار فوری قبل از اتمام اعتبار</li>
              <li>• اطلاع لحظه‌ای از قطعی سرور</li>
              <li>• روشن، خاموش و ریست سرور مستقیم از تلگرام</li>
              <li>• مشاهده موجودی و وضعیت سرورها با یک دستور</li>
            </ul>
            <Button onClick={generate} loading={busy === 'generate'} icon={<MessageCircle size={15} />}>
              اتصال به ربات تلگرام
            </Button>
          </div>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="اتصال حساب به تلگرام"
        description="یکی از دو راه زیر را انتخاب کنید."
        footer={
          <Button variant="secondary" onClick={() => setOpen(false)}>
            بستن
          </Button>
        }
      >
        {code ? (
          <div className="space-y-5">
            {code.deepLink ? (
              <div>
                <div className="mb-2 text-xs font-bold">راه اول: با یک کلیک</div>
                <a href={code.deepLink} target="_blank" rel="noopener noreferrer" className="btn btn-primary w-full">
                  <MessageCircle size={16} /> باز کردن ربات در تلگرام
                </a>
                <p className="mt-2 text-[11px] leading-6 muted">
                  تلگرام باز می‌شود و کد به صورت خودکار ارسال می‌گردد. سپس همین صفحه به‌روز می‌شود.
                </p>
              </div>
            ) : null}

            <div className={code.deepLink ? 'border-t pt-4' : ''}>
              <div className="mb-2 text-xs font-bold">{code.deepLink ? 'راه دوم: دستی' : 'کد اتصال'}</div>
              <p className="mb-2 text-[11px] leading-6 muted">
                در تلگرام ربات{' '}
                {data.botUsername ? (
                  <span className="ltr font-semibold">@{data.botUsername}</span>
                ) : (
                  'پنل'
                )}{' '}
                را باز کنید و این دستور را بفرستید:
              </p>
              <div className="flex items-center gap-2">
                <code className="mono ltr flex-1 rounded-lg px-3 py-2.5 text-sm font-bold surface-2">
                  /start {code.code}
                </code>
                <CopyButton value={`/start ${code.code}`} />
              </div>
            </div>

            <Alert tone={countdown > 0 ? 'info' : 'warning'}>
              {countdown > 0 ? (
                <>
                  این کد تا{' '}
                  <b className="tabular">
                    {formatNumber(Math.floor(countdown / 60))}:{String(countdown % 60).padStart(2, '0')}
                  </b>{' '}
                  معتبر است. پس از ارسال، همین صفحه به‌طور خودکار به‌روز می‌شود.
                </>
              ) : (
                'مهلت این کد تمام شد. پنجره را ببندید و دوباره کد بگیرید.'
              )}
            </Alert>
          </div>
        ) : (
          <LoadingBlock />
        )}
      </Modal>
    </>
  );
}
