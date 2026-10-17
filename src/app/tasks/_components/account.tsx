'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Bell, KeyRound, MessageSquareText, Send, User } from 'lucide-react';
import { Alert, Button, Card, Field, Input, LoadingBlock, PasswordInput, Select, Toggle } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, apiDelete, apiPatch, apiPost, errorFields, errorMessage, fetcher } from '@/lib/client';

type Profile = Record<string, string | null> & { firstName: string | null; lastName: string | null; email: string };

type Prefs = {
  preferences: {
    emailEnabled: boolean;
    telegramEnabled: boolean;
    ticketEvents: boolean;
    taskSms: boolean;
    quietHoursEnabled: boolean;
    quietHoursStart: number;
    quietHoursEnd: number;
  };
  channels: { email: boolean; telegram: boolean };
};

type TelegramState = {
  available: boolean;
  botLink: string | null;
  linked: boolean;
  link: { username: string | null; firstName: string | null; active: boolean } | null;
};

type SmsState = { configured: boolean; provider: string; phone: string | null };

const PROFILE_FIELDS = ['phone', 'company', 'nationalId', 'address', 'city', 'province', 'postalCode'] as const;

/**
 * حساب من در میز کار: نام، رمز عبور، اتصال تلگرام و کانال‌های اعلان تسک‌ها.
 * فقط همین چند مورد لازم است؛ تنظیمات مربوط به سرور و کیف پول اینجا نمی‌آید.
 */
export function Account() {
  const toast = useToast();
  const { data: profile, mutate: refreshProfile } = useSWR<Profile>('/api/profile', fetcher);
  const { data: prefs, mutate: refreshPrefs } = useSWR<Prefs>('/api/notifications/preferences', fetcher);
  const { data: tg, mutate: refreshTg } = useSWR<TelegramState>('/api/telegram/link', fetcher);
  const { data: sms, mutate: refreshSms } = useSWR<SmsState>('/api/tasks/sms-test', fetcher);

  const [name, setName] = useState({ firstName: '', lastName: '' });
  const [phone, setPhone] = useState('');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setName({ firstName: profile.firstName ?? '', lastName: profile.lastName ?? '' });
      setPhone(profile.phone ?? '');
    }
  }, [profile]);

  if (!profile || !prefs || !tg || !sms) return <LoadingBlock />;
  const p = prefs.preferences;

  async function run(key: string, fn: () => Promise<unknown>, okMsg: string) {
    setBusy(key);
    setErrors({});
    try {
      await fn();
      toast.success(okMsg);
    } catch (err) {
      setErrors(errorFields(err));
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  // سایر فیلدهای پروفایل (اگر پیش‌تر پر شده باشند) دست‌نخورده برگردانده می‌شوند
  const keepFields = Object.fromEntries(PROFILE_FIELDS.map((k) => [k, profile[k] ?? '']));

  const setPref = (patch: Partial<Prefs['preferences']>) =>
    run('prefs', async () => {
      await apiPatch('/api/notifications/preferences', patch);
      await refreshPrefs();
    }, 'ذخیره شد.');

  return (
    <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
      <div className="space-y-5">
        <Card title={<span className="flex items-center gap-2"><Send size={15} /> اتصال تلگرام</span>}>
          {!tg.available ? (
            <Alert tone="warning">ربات تلگرام روی سرور تنظیم نشده است (TELEGRAM_BOT_TOKEN). اعلان‌ها فعلاً در پنل، پیامک و ایمیل می‌آیند.</Alert>
          ) : tg.linked ? (
            <div className="space-y-3">
              <Alert tone="success" title="تلگرام شما وصل است">
                اعلان تسک‌ها و یادآوری‌ها در تلگرام برای {tg.link?.username ? `@${tg.link.username}` : tg.link?.firstName} ارسال می‌شود.
              </Alert>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy === 'tgtest'}
                  onClick={() => run('tgtest', () => api('/api/telegram/link', { method: 'PUT' }), 'پیام آزمایشی فرستاده شد.')}
                >
                  ارسال پیام آزمایشی
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busy === 'tgoff'}
                  onClick={() =>
                    run('tgoff', async () => {
                      await apiDelete('/api/telegram/link');
                      await refreshTg();
                    }, 'اتصال تلگرام قطع شد.')
                  }
                >
                  قطع اتصال
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm leading-7">
              <p>
                برای اینکه تسک تازه، سؤال‌ها و یادآوری‌ها روی گوشی‌تان برسد، حساب را به ربات تلگرام وصل کنید. دکمه زیر تلگرام را باز می‌کند؛ فقط
                «Start» را بزنید.
              </p>
              <Button
                loading={busy === 'tglink'}
                icon={<Send size={15} />}
                onClick={() =>
                  run('tglink', async () => {
                    const res = await apiPost<{ deepLink: string | null; code: string }>('/api/telegram/link');
                    if (res.deepLink) window.open(res.deepLink, '_blank', 'noopener');
                    else toast.info(`کد اتصال: ${res.code} — آن را برای ربات بفرستید.`);
                    setTimeout(() => refreshTg(), 15_000);
                  }, 'تلگرام را باز کنید و Start را بزنید.')
                }
              >
                اتصال به تلگرام
              </Button>
              <button type="button" onClick={() => refreshTg()} className="block text-xs text-[var(--color-brand-600)] hover:underline">
                وصل کردم — بررسی دوباره
              </button>
            </div>
          )}
        </Card>

        <Card title={<span className="flex items-center gap-2"><MessageSquareText size={15} /> پیامک</span>}>
          <div className="space-y-4">
            {!sms.configured ? (
              <Alert tone="warning">
                سرویس پیامک روی سرور تنظیم نشده است. مدیر سرور باید کلید API کاوه‌نگار را در <code className="ltr">SMS_API_KEY</code> فایل{' '}
                <code className="ltr">.env</code> بگذارد.
              </Alert>
            ) : null}
            <p className="text-xs leading-6 muted">
              تسک تازه، سپردن کار، شروع کار، اعلام انجام شد، سؤال، تأیید یا برگشت، نظرها، پیوست‌ها، چک‌لیست، تغییر جزئیات و یادآوری‌ها با پیامک
              به این شماره می‌رسد.
            </p>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Field label="شماره موبایل" error={errors.phone}>
                  <Input value={phone} dir="ltr" inputMode="tel" placeholder="09121234567" onChange={(e) => setPhone(e.target.value)} />
                </Field>
              </div>
              <Button
                variant="secondary"
                loading={busy === 'phone'}
                disabled={!phone.trim() || phone === (profile.phone ?? '')}
                onClick={() =>
                  run('phone', async () => {
                    await apiPatch('/api/profile', { ...keepFields, ...name, phone });
                    await Promise.all([refreshProfile(), refreshSms()]);
                  }, 'شماره موبایل ذخیره شد.')
                }
              >
                ذخیره
              </Button>
            </div>
            <Toggle
              checked={p.taskSms}
              disabled={busy === 'prefs'}
              onChange={(v) => setPref({ taskSms: v })}
              label="پیامک رویدادهای تسک"
              description="در ساعات سکوت فقط پیامک تسک‌های فوری می‌آید. چند تغییر پشت سر هم روی یک تسک، حداکثر پنج پیامک در ده دقیقه می‌سازد."
            />
            <Button
              size="sm"
              variant="secondary"
              loading={busy === 'smstest'}
              disabled={!sms.configured || !sms.phone}
              onClick={() => run('smstest', () => apiPost('/api/tasks/sms-test'), 'پیامک آزمایشی فرستاده شد.')}
            >
              ارسال پیامک آزمایشی
            </Button>
          </div>
        </Card>

        <Card title={<span className="flex items-center gap-2"><Bell size={15} /> اعلان‌های تسک</span>}>
          <div className="space-y-4">
            <Toggle
              checked={p.ticketEvents}
              disabled={busy === 'prefs'}
              onChange={(v) => setPref({ ticketEvents: v })}
              label="اعلان تسک‌ها بیرون از پنل"
              description="تسک تازه، تغییر وضعیت، نظرها و یادآوری‌ها در تلگرام و ایمیل. اگر خاموش باشد فقط داخل پنل دیده می‌شود. پیامک کلید جداگانه خودش را دارد."
            />
            <Toggle
              checked={p.telegramEnabled}
              disabled={busy === 'prefs' || !prefs.channels.telegram}
              onChange={(v) => setPref({ telegramEnabled: v })}
              label="تلگرام"
            />
            <Toggle
              checked={p.emailEnabled}
              disabled={busy === 'prefs' || !prefs.channels.email}
              onChange={(v) => setPref({ emailEnabled: v })}
              label="ایمیل"
              description="گزارش صبحگاهی و رویدادهای مهم (انجام شد، نیاز به اطلاعات، برگشت داده شد) با ایمیل هم می‌آید."
            />
            <div className="border-t pt-4">
              <Toggle
                checked={p.quietHoursEnabled}
                disabled={busy === 'prefs'}
                onChange={(v) => setPref({ quietHoursEnabled: v })}
                label="ساعات سکوت"
                description="در این ساعت‌ها پیامی به تلگرام، ایمیل و پیامک نمی‌رود، مگر تسک فوری یا حیاتی."
              />
              {p.quietHoursEnabled ? (
                <div className="mt-3 flex items-center gap-2 text-xs">
                  از
                  <div className="w-24">
                    <Select value={p.quietHoursStart} onChange={(e) => setPref({ quietHoursStart: Number(e.target.value) })} className="py-1.5 text-xs">
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>
                          ساعت {new Intl.NumberFormat('fa-IR').format(h)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  تا
                  <div className="w-24">
                    <Select value={p.quietHoursEnd} onChange={(e) => setPref({ quietHoursEnd: Number(e.target.value) })} className="py-1.5 text-xs">
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>
                          ساعت {new Intl.NumberFormat('fa-IR').format(h)}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-5">
        <Card title={<span className="flex items-center gap-2"><User size={15} /> نام نمایشی</span>}>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="نام" error={errors.firstName}>
                <Input value={name.firstName} onChange={(e) => setName((n) => ({ ...n, firstName: e.target.value }))} />
              </Field>
              <Field label="نام خانوادگی" error={errors.lastName}>
                <Input value={name.lastName} onChange={(e) => setName((n) => ({ ...n, lastName: e.target.value }))} />
              </Field>
            </div>
            <p className="ltr text-right text-xs muted">{profile.email}</p>
            <Button
              loading={busy === 'name'}
              onClick={() =>
                run('name', async () => {
                  await apiPatch('/api/profile', { ...keepFields, ...name });
                  await refreshProfile();
                }, 'نام ذخیره شد.')
              }
            >
              ذخیره
            </Button>
          </div>
        </Card>

        <Card title={<span className="flex items-center gap-2"><KeyRound size={15} /> تغییر رمز عبور</span>}>
          <div className="space-y-3">
            <Field label="رمز فعلی" error={errors.currentPassword}>
              <PasswordInput value={pw.currentPassword} onChange={(e) => setPw((v) => ({ ...v, currentPassword: e.target.value }))} />
            </Field>
            <Field label="رمز جدید" error={errors.newPassword} hint="حداقل ۸ کاراکتر، شامل حرف انگلیسی و عدد.">
              <PasswordInput
                value={pw.newPassword}
                autoComplete="new-password"
                onChange={(e) => setPw((v) => ({ ...v, newPassword: e.target.value }))}
              />
            </Field>
            <Button
              loading={busy === 'pw'}
              disabled={!pw.currentPassword || !pw.newPassword}
              onClick={() =>
                run('pw', async () => {
                  await apiPost('/api/profile/password', pw);
                  setPw({ currentPassword: '', newPassword: '' });
                }, 'رمز عبور تغییر کرد.')
              }
            >
              تغییر رمز
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
