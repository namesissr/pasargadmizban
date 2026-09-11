'use client';

import { Alert, Badge, Card, CopyButton, Field, Input, MoneyInput, Toggle } from '@/components/ui';
import { formatNumber, formatToman } from '@/lib/money';

export type AdvancedData = {
  integrations: { hetzner: boolean; smtp: boolean; sms: boolean; telegram: boolean; zibalSandbox: boolean; appUrl: string };
  bot: { username: string | null; webhook: string | null; pending: number; linkedUsers: number } | null;
  stats: { activeMonitors: number; referralPaid: number; referralCount: number };
};

type Values = Record<string, string | number | boolean>;
type Setter = (key: string, value: string | number | boolean) => void;

/**
 * کارت‌های تنظیمات امکانات پیشرفته: اطلاع‌رسانی، تلگرام، پایش و معرفی.
 * از فایل اصلی جدا شده تا صفحه تنظیمات قابل خواندن بماند.
 */
export function AdvancedSettingsCards({ data, s, set }: { data: AdvancedData; s: Values; set: Setter }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
      {/* ─── اطلاع‌رسانی ─── */}
      <Card title="اطلاع‌رسانی" description="پیش‌فرض‌هایی که برای کاربران جدید اعمال می‌شود.">
        <div className="space-y-4">
          <Field
            label="پیش‌فرض هشدار اتمام اعتبار (ساعت)"
            hint="هر کاربر می‌تواند این مقدار را در پنل خودش تغییر دهد."
          >
            <Input
              type="number"
              min={1}
              max={720}
              value={Number(s.defaultLowBalanceHours)}
              onChange={(e) => set('defaultLowBalanceHours', Number(e.target.value))}
              className="ltr tabular"
              dir="ltr"
            />
          </Field>

          <Field label="پیش‌فرض هشدار ترافیک (درصد سهمیه)">
            <Input
              type="number"
              min={10}
              max={100}
              value={Number(s.defaultTrafficAlertPercent)}
              onChange={(e) => set('defaultTrafficAlertPercent', Number(e.target.value))}
              className="ltr tabular"
              dir="ltr"
            />
          </Field>

          <div className="border-t pt-4">
            <span className="label">کانال‌های فعال سامانه</span>
            <div className="mt-2 space-y-3">
              <Toggle
                checked={Boolean(s.channelEmail)}
                onChange={(v) => set('channelEmail', v)}
                label="ایمیل"
                description={data.integrations.smtp ? 'SMTP پیکربندی شده است.' : 'SMTP تنظیم نشده؛ ایمیلی ارسال نمی‌شود.'}
              />
              <Toggle
                checked={Boolean(s.channelTelegram)}
                onChange={(v) => set('channelTelegram', v)}
                label="تلگرام"
                description={data.integrations.telegram ? 'ربات فعال است.' : 'توکن ربات تنظیم نشده است.'}
              />
              <Toggle
                checked={Boolean(s.channelSms)}
                onChange={(v) => set('channelSms', v)}
                label="پیامک"
                description={data.integrations.sms ? 'سرویس پیامک فعال است.' : 'کلید سرویس پیامک تنظیم نشده است.'}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* ─── تلگرام ─── */}
      <Card
        title="ربات تلگرام"
        description="کاربران با اتصال حسابشان هشدارها را در تلگرام می‌گیرند و سرور را از همان‌جا کنترل می‌کنند."
        action={data.bot ? <Badge tone="ok">فعال</Badge> : <Badge tone="muted">تنظیم نشده</Badge>}
      >
        <div className="space-y-4">
          {data.bot ? (
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between border-b pb-2">
                <dt className="muted">نام کاربری ربات</dt>
                <dd className="ltr font-semibold">@{data.bot.username ?? '—'}</dd>
              </div>
              <div className="flex justify-between border-b pb-2">
                <dt className="muted">حالت دریافت پیام</dt>
                <dd>{data.bot.webhook ? 'Webhook' : 'Long polling (ورکر)'}</dd>
              </div>
              <div className="flex justify-between border-b pb-2">
                <dt className="muted">پیام‌های در صف</dt>
                <dd className="tabular">{formatNumber(data.bot.pending)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="muted">کاربران متصل</dt>
                <dd className="tabular font-bold">{formatNumber(data.bot.linkedUsers)}</dd>
              </div>
            </dl>
          ) : (
            <Alert tone="info" title="ربات تنظیم نشده است">
              در <span className="ltr">@BotFather</span> یک ربات بسازید و توکن آن را در متغیر{' '}
              <code className="mono ltr">TELEGRAM_BOT_TOKEN</code> فایل .env بگذارید، سپس سرویس و ورکر را دوباره
              راه‌اندازی کنید.
            </Alert>
          )}

          <Toggle
            checked={Boolean(s.telegramEnabled)}
            onChange={(v) => set('telegramEnabled', v)}
            label="ربات فعال باشد"
            description="با خاموش کردن، نه اعلانی فرستاده می‌شود و نه کاربر جدیدی می‌تواند متصل شود."
          />
          <Toggle
            checked={Boolean(s.telegramPolling)}
            onChange={(v) => set('telegramPolling', v)}
            label="دریافت پیام با ورکر (long polling)"
            description="اگر webhook تنظیم کرده‌اید این را خاموش کنید تا پیام‌ها دو بار پردازش نشوند."
          />
          <Toggle
            checked={Boolean(s.telegramAllowActions)}
            onChange={(v) => set('telegramAllowActions', v)}
            label="اجازه کنترل سرور از تلگرام"
            description="روشن، خاموش و ریست سرور با دکمه‌های داخل ربات."
          />

          {data.integrations.telegram ? (
            <Field label="آدرس webhook" hint="فقط اگر می‌خواهید به جای ورکر از webhook استفاده کنید.">
              <div className="flex items-center gap-2">
                <code className="mono ltr flex-1 overflow-x-auto whitespace-nowrap rounded-lg px-3 py-2 text-[11px] surface-2">
                  {data.integrations.appUrl}/api/telegram/webhook
                </code>
                <CopyButton value={`${data.integrations.appUrl}/api/telegram/webhook`} />
              </div>
            </Field>
          ) : null}
        </div>
      </Card>

      {/* ─── پایش ─── */}
      <Card
        title="پایش سرورها"
        description="بررسی دوره‌ای در دسترس بودن سرور مشتریان از بیرون."
        action={<Badge tone="muted">{formatNumber(data.stats.activeMonitors)} پایش فعال</Badge>}
      >
        <div className="space-y-4">
          <Toggle
            checked={Boolean(s.monitoringEnabled)}
            onChange={(v) => set('monitoringEnabled', v)}
            label="پایش فعال باشد"
            description="مشتری قبل از اینکه خودش متوجه شود، از قطعی سرورش باخبر می‌شود."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="فاصله پیش‌فرض بررسی (دقیقه)">
              <Input
                type="number"
                min={1}
                max={60}
                value={Number(s.monitorDefaultInterval)}
                onChange={(e) => set('monitorDefaultInterval', Number(e.target.value))}
                className="ltr tabular"
                dir="ltr"
              />
            </Field>
            <Field label="حداکثر پایش هر کاربر">
              <Input
                type="number"
                min={0}
                max={1000}
                value={Number(s.monitorMaxPerUser)}
                onChange={(e) => set('monitorMaxPerUser', Number(e.target.value))}
                className="ltr tabular"
                dir="ltr"
              />
            </Field>
          </div>
          <p className="text-[11px] leading-6 muted">
            فاصله کمتر یعنی اطلاع سریع‌تر ولی مصرف شبکه بیشتر. برای اکثر کسب‌وکارها ۵ دقیقه مناسب است.
          </p>
        </div>
      </Card>

      {/* ─── معرفی ─── */}
      <Card
        title="برنامه معرفی"
        description="پورسانت دائمی از شارژ کاربران معرفی‌شده."
        action={
          <Badge tone="muted">
            {formatNumber(data.stats.referralCount)} پرداخت · {formatToman(data.stats.referralPaid)}
          </Badge>
        }
      >
        <div className="space-y-4">
          <Toggle
            checked={Boolean(s.referralEnabled)}
            onChange={(v) => set('referralEnabled', v)}
            label="برنامه معرفی فعال باشد"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="درصد پورسانت" hint="از هر شارژ کاربر معرفی‌شده.">
              <Input
                type="number"
                min={0}
                max={50}
                step={0.5}
                value={Number(s.referralPercent)}
                onChange={(e) => set('referralPercent', Number(e.target.value))}
                className="ltr tabular"
                dir="ltr"
              />
            </Field>
            <Field label="حداقل شارژ برای پورسانت (تومان)">
              <MoneyInput value={Number(s.referralMinDeposit)} onValueChange={(v) => set('referralMinDeposit', v)} />
            </Field>
            <Field label="سقف پورسانت هر تراکنش (تومان)" hint="صفر یعنی بدون سقف.">
              <MoneyInput value={Number(s.referralMaxPerDeposit)} onValueChange={(v) => set('referralMaxPerDeposit', v)} />
            </Field>
            <Field label="هدیه خوش‌آمد (تومان)" hint="به کاربری که با کد معرف ثبت‌نام می‌کند.">
              <MoneyInput value={Number(s.referralWelcomeBonus)} onValueChange={(v) => set('referralWelcomeBonus', v)} />
            </Field>
          </div>
          <Alert tone="info">
            پورسانت از حاشیه سود شما کم می‌شود. با درصد سود پنل هماهنگش کنید تا فروش زیان‌ده نشود.
          </Alert>
        </div>
      </Card>
    </div>
  );
}
