'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Save, ShieldCheck, MailCheck, LogOut, Gift, Monitor } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CopyButton,
  Field,
  Input,
  PasswordInput,
  Stat,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { ThemePicker } from '@/components/app/theme';
import { api, apiDelete, apiPost, errorFields, errorMessage, fetcher } from '@/lib/client';
import { formatNumber } from '@/lib/money';
import { faDateTime, USER_STATUS_FA, ROLE_FA, truncate } from '@/lib/utils';
import { TwoFactorCard } from './two-factor';

type Profile = {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  nationalId: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  role: string;
  status: string;
  discountPct: number;
  maxServers: number;
  referralCode: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  _count: { servers: number; tickets: number; referrals: number };
};

export function ProfileClient({ profile }: { profile: Profile }) {
  const toast = useToast();
  const router = useRouter();

  const [form, setForm] = useState({
    firstName: profile.firstName ?? '',
    lastName: profile.lastName ?? '',
    phone: profile.phone ?? '',
    company: profile.company ?? '',
    nationalId: profile.nationalId ?? '',
    address: profile.address ?? '',
    city: profile.city ?? '',
    province: profile.province ?? '',
    postalCode: profile.postalCode ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [changing, setChanging] = useState(false);
  const [passFields, setPassFields] = useState<Record<string, string>>({});

  const [resending, setResending] = useState(false);

  const { data: sessions, mutate: mutateSessions } = useSWR<{
    items: { id: string; ip: string | null; userAgent: string | null; createdAt: string }[];
  }>('/api/me/sessions', fetcher);

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFields({});
    try {
      const res = await api<{ message: string }>('/api/profile', { method: 'PATCH', body: form });
      toast.success(res.message);
      router.refresh();
    } catch (err) {
      toast.error('ذخیره انجام نشد', errorMessage(err));
      setFields(errorFields(err));
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPassFields({});
    if (next !== confirm) {
      setPassFields({ confirm: 'تکرار رمز جدید مطابقت ندارد.' });
      return;
    }
    setChanging(true);
    try {
      const res = await apiPost<{ message: string }>('/api/profile/password', {
        currentPassword: current,
        newPassword: next,
      });
      toast.success(res.message);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      toast.error('تغییر رمز انجام نشد', errorMessage(err));
      setPassFields(errorFields(err));
    } finally {
      setChanging(false);
    }
  }

  async function resendVerification() {
    setResending(true);
    try {
      const res = await apiPost<{ message: string }>('/api/auth/resend-verification');
      toast.success('ارسال شد', res.message);
    } catch (err) {
      toast.error('ارسال ایمیل انجام نشد', errorMessage(err));
    } finally {
      setResending(false);
    }
  }

  async function revokeSessions() {
    if (!window.confirm('از تمام دستگاه‌ها خارج می‌شوید و باید دوباره وارد شوید. ادامه می‌دهید؟')) return;
    try {
      await apiDelete('/api/me/sessions');
      toast.success('از همه دستگاه‌ها خارج شدید.');
      router.push('/login');
    } catch (err) {
      toast.error('عملیات انجام نشد', errorMessage(err));
      mutateSessions();
    }
  }

  const status = USER_STATUS_FA[profile.status] ?? { label: profile.status, tone: 'muted' as const };

  return (
    <div className="space-y-5">
      {!profile.emailVerifiedAt ? (
        <Alert
          tone="warning"
          title="ایمیل شما تایید نشده است"
          action={
            <Button variant="secondary" size="sm" onClick={resendVerification} loading={resending} icon={<MailCheck size={14} />}>
              ارسال مجدد ایمیل تایید
            </Button>
          }
        >
          تا زمانی که ایمیل تایید نشود، امکان ساخت سرور وجود ندارد.
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="وضعیت حساب" value={status.label} tone={status.tone === 'ok' ? 'ok' : status.tone === 'bad' ? 'bad' : 'warn'} />
        <Stat label="نقش" value={ROLE_FA[profile.role] ?? profile.role} />
        <Stat label="سرورها" value={formatNumber(profile._count.servers)} hint={`سقف مجاز: ${formatNumber(profile.maxServers)}`} />
        <Stat
          label="تخفیف اختصاصی"
          value={profile.discountPct > 0 ? `${formatNumber(profile.discountPct)}٪` : 'ندارد'}
          tone={profile.discountPct > 0 ? 'ok' : undefined}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        {/* اطلاعات شخصی */}
        <Card title="اطلاعات شخصی" description="این اطلاعات روی فاکتورهای شما درج می‌شود.">
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="نام" required error={fields.firstName}>
                <Input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required />
              </Field>
              <Field label="نام خانوادگی" required error={fields.lastName}>
                <Input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} required />
              </Field>
            </div>

            <Field label="ایمیل" hint="برای تغییر ایمیل با پشتیبانی تماس بگیرید.">
              <Input value={profile.email} className="ltr" dir="ltr" disabled />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="شماره موبایل" error={fields.phone}>
                <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} className="ltr" dir="ltr" />
              </Field>
              <Field label="کد ملی" error={fields.nationalId}>
                <Input value={form.nationalId} onChange={(e) => set('nationalId', e.target.value)} className="ltr" dir="ltr" />
              </Field>
            </div>

            <Field label="نام شرکت (اختیاری)">
              <Input value={form.company} onChange={(e) => set('company', e.target.value)} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="استان">
                <Input value={form.province} onChange={(e) => set('province', e.target.value)} />
              </Field>
              <Field label="شهر">
                <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
              </Field>
            </div>

            <Field label="نشانی">
              <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
            </Field>

            <Field label="کد پستی" error={fields.postalCode}>
              <Input value={form.postalCode} onChange={(e) => set('postalCode', e.target.value)} className="ltr" dir="ltr" />
            </Field>

            <Button type="submit" loading={saving} icon={<Save size={15} />}>
              ذخیره اطلاعات
            </Button>
          </form>
        </Card>

        <div className="space-y-5">
          {/* تغییر رمز */}
          <Card title="تغییر رمز عبور" description="پس از تغییر، نشست‌های دیگر شما معتبر باقی می‌مانند.">
            <form onSubmit={changePassword} className="space-y-4">
              <Field label="رمز فعلی" required error={passFields.currentPassword}>
                <PasswordInput
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  className="ltr"
                  dir="ltr"
                  required
                />
              </Field>
              <Field label="رمز جدید" required error={passFields.newPassword} hint="حداقل ۸ کاراکتر، شامل حرف و عدد.">
                <PasswordInput
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  className="ltr"
                  dir="ltr"
                  autoComplete="new-password"
                  required
                />
              </Field>
              <Field label="تکرار رمز جدید" required error={passFields.confirm}>
                <PasswordInput
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="ltr"
                  dir="ltr"
                  autoComplete="new-password"
                  required
                />
              </Field>
              <Button type="submit" loading={changing} icon={<ShieldCheck size={15} />}>
                تغییر رمز عبور
              </Button>
            </form>
          </Card>

          {/* ورود دو مرحله‌ای */}
          <TwoFactorCard />

          {/* کد معرف */}
          {profile.referralCode ? (
            <Card title="کد معرف">
              <div className="flex items-center gap-2">
                <code className="mono ltr flex-1 rounded-lg px-3 py-2 text-sm font-bold surface-2">
                  {profile.referralCode}
                </code>
                <CopyButton value={profile.referralCode} label="کپی" />
              </div>
              <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-6 muted">
                <Gift size={13} className="mt-1 shrink-0" />
                این کد را با دوستان خود به اشتراک بگذارید. تاکنون {formatNumber(profile._count.referrals)} نفر با کد
                شما ثبت‌نام کرده‌اند.
              </p>
            </Card>
          ) : null}

          {/* نشست‌ها */}
          <Card
            title="نشست‌های فعال"
            description={`آخرین ورود: ${faDateTime(profile.lastLoginAt)}${profile.lastLoginIp ? ` از ${profile.lastLoginIp}` : ''}`}
            action={
              <Button variant="secondary" size="sm" onClick={revokeSessions} icon={<LogOut size={13} />}>
                خروج از همه
              </Button>
            }
          >
            {!sessions?.items.length ? (
              <p className="py-4 text-center text-xs muted">نشست فعالی یافت نشد.</p>
            ) : (
              <ul className="space-y-2.5">
                {sessions.items.map((s) => (
                  <li key={s.id} className="flex items-start justify-between gap-3 border-b pb-2.5 last:border-b-0 last:pb-0">
                    <div className="flex min-w-0 items-start gap-2">
                      <Monitor size={14} className="mt-0.5 shrink-0 muted" />
                      <div className="min-w-0">
                        <div className="truncate text-[11px]">{truncate(s.userAgent ?? 'نامشخص', 48)}</div>
                        <div className="mono ltr mt-0.5 text-[10px] muted">{s.ip ?? '—'}</div>
                      </div>
                    </div>
                    <span className="shrink-0 text-[10px] muted">{faDateTime(s.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="ظاهر پنل"
            description="حالت روشن یا تیره. در حالت خودکار، پنل با تنظیمات گوشی یا سیستم‌عامل شما هماهنگ می‌شود."
          >
            <ThemePicker />
          </Card>

          <Card title="اطلاعات حساب">
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between border-b pb-2">
                <dt className="muted">شناسه کاربری</dt>
                <dd className="mono ltr">{profile.id}</dd>
              </div>
              <div className="flex justify-between border-b pb-2">
                <dt className="muted">تاریخ عضویت</dt>
                <dd>{faDateTime(profile.createdAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="muted">وضعیت ایمیل</dt>
                <dd>
                  {profile.emailVerifiedAt ? (
                    <Badge tone="ok">تایید شده</Badge>
                  ) : (
                    <Badge tone="warn">تایید نشده</Badge>
                  )}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
