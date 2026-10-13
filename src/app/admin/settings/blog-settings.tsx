'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  Save,
  CheckCircle2,
  XCircle,
  Newspaper,
  Server,
  ArrowLeft,
  Mail,
  ShieldCheck,
  Wrench,
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
  Select,
  Textarea,
  Toggle,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage, fetcher } from '@/lib/client';

type SettingsData = {
  settings: Record<string, string | number | boolean>;
  integrations: { smtp: boolean; sms: boolean; telegram: boolean; appUrl: string };
};

/**
 * تنظیمات نصب «فقط وبلاگ».
 *
 * نسخه کامل این صفحه پر از کلیدهای قیمت‌گذاری، صورتحساب و چرخه سرور است که
 * روی سرور وبلاگ هیچ کاری نمی‌کنند. اینجا فقط چیزهایی هست که در این نصب
 * معنی دارند؛ تنظیمات سئو و برند هم جای خودش را دارد: /admin/seo
 */
export function BlogSettingsClient({ modeLocked }: { modeLocked: boolean }) {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<SettingsData>('/api/admin/settings', fetcher);
  const [patch, setPatch] = useState<Record<string, string | number | boolean>>({});
  const [saving, setSaving] = useState(false);

  if (isLoading && !data) return <LoadingBlock />;
  if (!data) return <Alert tone="error">دریافت تنظیمات ممکن نشد.</Alert>;

  const s = { ...data.settings, ...patch };
  const dirty = Object.keys(patch).length > 0;
  const set = (key: string, value: string | number | boolean) => setPatch((p) => ({ ...p, [key]: value }));

  async function save() {
    setSaving(true);
    try {
      const res = await api<{ message: string }>('/api/admin/settings', { method: 'PATCH', body: patch });
      toast.success(res.message);
      setPatch({});
      mutate();
    } catch (err) {
      toast.error('ذخیره تنظیمات انجام نشد', errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Alert tone="info" title="این نصب در حالت «فقط وبلاگ» است">
        بخش‌های سرور، هتزنر، قیمت‌گذاری و صورتحساب از پنل برداشته شده‌اند، چون روی این سرور کاری ندارند. تنظیمات
        سئو، برند و آدرس پنل ابری در{' '}
        <Link href="/admin/seo" className="underline">
          سئو و آمار
        </Link>{' '}
        است.
      </Alert>

      {/* حالت پنل */}
      <Card
        title="حالت پنل"
        description="مشخص می‌کند پنل مدیریت کدام بخش‌ها را نشان بدهد."
      >
        {modeLocked ? (
          <Alert tone="warning" title="حالت پنل از فایل .env قفل شده است">
            متغیر <code className="mono ltr">APP_MODE</code> روی این سرور تنظیم شده و بر این کلید اولویت دارد. برای
            تغییر، مقدار آن را در <code className="mono ltr">.env</code> عوض کنید و سرویس را دوباره راه‌اندازی کنید.
          </Alert>
        ) : (
          <Field
            label="حالت پنل مدیریت"
            hint="«فقط وبلاگ» برای سروری که فقط وبلاگ را سرو می‌کند؛ «کامل» برای پنل فروش سرور."
          >
            <Select value={String(s.panelMode ?? 'full')} onChange={(e) => set('panelMode', e.target.value)}>
              <option value="blog">فقط وبلاگ — مقاله، سئو و تولید محتوا</option>
              <option value="full">کامل — فروش سرور، مالی و وبلاگ</option>
            </Select>
          </Field>
        )}

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="flex items-start gap-2 rounded-xl p-3 text-[11px] leading-6 surface-2">
            <Newspaper size={14} className="mt-1 shrink-0 text-[var(--color-brand-600)]" />
            <span>
              <b className="block">فقط وبلاگ</b>
              مقاله‌ها، دسته‌ها، برچسب‌ها، تقویم انتشار، تولید خودکار، تصاویر، ریدایرکت‌ها و سئو.
            </span>
          </div>
          <div className="flex items-start gap-2 rounded-xl p-3 text-[11px] leading-6 surface-2">
            <Server size={14} className="mt-1 shrink-0 muted" />
            <span>
              <b className="block">کامل</b>
              همه موارد بالا به‌اضافه سرورها، کاتالوگ، قیمت‌گذاری، تراکنش‌ها، فاکتورها و درگاه‌ها.
            </span>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        {/* برند و تماس */}
        <Card title="برند و راه تماس" description="این مقادیر در سربرگ، فوتر و ایمیل‌ها دیده می‌شوند.">
          <div className="space-y-3.5">
            <Field label="نام برند">
              <Input value={String(s.brandName ?? '')} onChange={(e) => set('brandName', e.target.value)} maxLength={80} />
            </Field>
            <Field label="ایمیل پشتیبانی">
              <Input
                value={String(s.supportEmail ?? '')}
                onChange={(e) => set('supportEmail', e.target.value)}
                className="ltr"
                maxLength={190}
              />
            </Field>
            <Field label="شماره تماس" hint="خالی بگذارید اگر نمی‌خواهید در سایت دیده شود.">
              <Input
                value={String(s.supportPhone ?? '')}
                onChange={(e) => set('supportPhone', e.target.value)}
                className="ltr"
                maxLength={40}
              />
            </Field>
            <Link href="/admin/seo" className="btn btn-secondary btn-sm w-full">
              تنظیمات سئو، رنگ برند و آدرس پنل ابری <ArrowLeft size={14} />
            </Link>
          </div>
        </Card>

        {/* ثبت‌نام */}
        <Card
          title="ثبت‌نام و حساب‌ها"
          description="روی نصب وبلاگ معمولاً ثبت‌نام عمومی لازم نیست؛ کاربر در پنل ابری ثبت‌نام می‌کند."
        >
          <div className="space-y-4">
            <Toggle
              checked={Boolean(s.registrationOpen)}
              onChange={(v) => set('registrationOpen', v)}
              label="ثبت‌نام باز است"
              description="پیشنهاد: روی سرور وبلاگ خاموش باشد تا کسی حساب بی‌مصرف نسازد."
            />
            <Toggle
              checked={Boolean(s.requireEmailVerify)}
              onChange={(v) => set('requireEmailVerify', v)}
              label="الزام تایید ایمیل"
            />
            {Boolean(s.registrationOpen) ? (
              <Alert tone="warning" title="ثبت‌نام عمومی باز است">
                اگر این سرور فقط وبلاگ را سرو می‌کند، بستن ثبت‌نام جلوی ساخت حساب‌های اسپم را می‌گیرد. حساب مدیر را
                با دستور <code className="mono ltr">npm run admin:create</code> می‌سازید.
              </Alert>
            ) : null}
          </div>
        </Card>

        {/* حالت تعمیر */}
        <Card title="حالت تعمیر و نگهداری" description="برای وقتی که می‌خواهید سایت موقتاً بسته باشد.">
          <div className="space-y-3.5">
            <Toggle
              checked={Boolean(s.maintenanceMode)}
              onChange={(v) => set('maintenanceMode', v)}
              label="حالت تعمیر فعال باشد"
              description="بازدیدکننده پیام نگهداری می‌بیند. در این حالت گوگل هم صفحه‌ها را نمی‌خزد."
            />
            <Field label="پیام نگهداری">
              <Textarea
                value={String(s.maintenanceMessage ?? '')}
                onChange={(e) => set('maintenanceMessage', e.target.value)}
                rows={2}
                maxLength={500}
              />
            </Field>
            {Boolean(s.maintenanceMode) ? (
              <Alert tone="error" title="سایت الان بسته است">
                حالت تعمیر را طولانی روشن نگذارید؛ ایندکس گوگل به صفحه‌های بسته حساس است.
              </Alert>
            ) : null}
          </div>
        </Card>

        {/* نمایش وبلاگ */}
        <Card title="نمایش وبلاگ" description="کلید اصلی روشن بودن وبلاگ روی سایت عمومی.">
          <div className="space-y-4">
            <Toggle
              checked={Boolean(s.blogEnabled)}
              onChange={(v) => set('blogEnabled', v)}
              label="وبلاگ روی سایت دیده شود"
              description="خاموش کردن، همه صفحه‌های /blog را از دسترس بازدیدکننده و گوگل خارج می‌کند."
            />
            <Field label="تعداد مقاله در هر صفحه">
              <Select value={String(s.blogPerPage ?? 12)} onChange={(e) => set('blogPerPage', Number(e.target.value))}>
                {[6, 9, 12, 15, 18, 24].map((n) => (
                  <option key={n} value={n}>
                    {new Intl.NumberFormat('fa-IR').format(n)}
                  </option>
                ))}
              </Select>
            </Field>
            <Link href="/admin/blog" className="btn btn-secondary btn-sm w-full">
              مدیریت مقاله‌ها <ArrowLeft size={14} />
            </Link>
          </div>
        </Card>
      </div>

      {/* سرویس‌های متصل */}
      <Card title="سرویس‌های متصل" description="این مقادیر در فایل .env تنظیم می‌شوند و از پنل قابل تغییر نیستند.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Integration ok={data.integrations.smtp} title="ایمیل (SMTP)" env="SMTP_HOST" icon={<Mail size={14} />} />
          <Integration ok={data.integrations.sms} title="پیامک" env="SMS_API_KEY" icon={<ShieldCheck size={14} />} />
          <Integration ok={data.integrations.telegram} title="ربات تلگرام" env="TELEGRAM_BOT_TOKEN" icon={<Wrench size={14} />} />
        </div>

        <div className="mt-4">
          <Field label="آدرس عمومی این نصب" hint="همان مقداری که در APP_URL گذاشته‌اید.">
            <div className="flex items-center gap-2">
              <code className="mono ltr flex-1 overflow-x-auto whitespace-nowrap rounded-lg px-3 py-2 text-[11px] surface-2">
                {data.integrations.appUrl}
              </code>
              <CopyButton value={data.integrations.appUrl} />
            </div>
          </Field>
        </div>
      </Card>

      {/* نوار ذخیره */}
      {dirty ? (
        <div className="sticky bottom-4 z-20 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 shadow-lg" style={{ background: 'var(--surface)' }}>
          <span className="text-xs muted">
            {new Intl.NumberFormat('fa-IR').format(Object.keys(patch).length)} تغییر ذخیره‌نشده
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPatch({})} disabled={saving}>
              بازگرداندن
            </Button>
            <Button size="sm" icon={<Save size={14} />} loading={saving} onClick={save}>
              ذخیره تغییرات
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Integration({
  ok,
  title,
  env,
  icon,
}: {
  ok: boolean;
  title: string;
  env: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border p-3">
      <span className="flex min-w-0 items-center gap-2 text-xs font-semibold">
        <span className="muted">{icon}</span>
        <span className="min-w-0">
          {title}
          <code className="mono ltr block text-[10px] font-normal muted">{env}</code>
        </span>
      </span>
      <Badge tone={ok ? 'ok' : 'muted'}>
        {ok ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
        {ok ? 'متصل' : 'تنظیم نشده'}
      </Badge>
    </div>
  );
}
