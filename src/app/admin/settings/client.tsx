'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Save, CheckCircle2, XCircle, Cloud, ArrowLeft, Radar } from 'lucide-react';
import { Alert, Badge, Button, Card, CopyButton, Field, Input, LoadingBlock, MoneyInput, NumberInput, Textarea, Toggle } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage, fetcher } from '@/lib/client';
import { AdvancedSettingsCards, type AdvancedData } from './advanced-cards';

type SettingsData = {
  settings: Record<string, string | number | boolean>;
  defaults: Record<string, string | number | boolean>;
  integrations: AdvancedData['integrations'];
  bot: AdvancedData['bot'];
  stats: AdvancedData['stats'];
  hetznerCapacity: {
    accounts: number;
    enabled: number;
    totalSlots: number;
    usedSlots: number;
    freeSlots: number;
    usagePercent: number;
  };
};

const fa = (n: number) => new Intl.NumberFormat('fa-IR').format(n);

export function SettingsClient() {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<SettingsData>('/api/admin/settings', fetcher);
  const [patch, setPatch] = useState<Record<string, string | number | boolean>>({});
  const [saving, setSaving] = useState(false);

  if (isLoading && !data) return <LoadingBlock />;
  if (!data) return <Alert tone="error">دریافت تنظیمات ممکن نشد.</Alert>;

  const s = { ...data.settings, ...patch };
  const dirty = Object.keys(patch).length > 0;

  function set(key: string, value: string | number | boolean) {
    setPatch((p) => ({ ...p, [key]: value }));
  }

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
      <HetznerCapacityCard capacity={data.hetznerCapacity} />

      {/* وضعیت سرویس‌های خارجی */}
      <Card title="سرویس‌های متصل" description="این مقادیر در فایل .env تنظیم می‌شوند و از پنل قابل تغییر نیستند.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Integration ok title={`زیبال${data.integrations.zibalSandbox ? ' (تست)' : ''}`} env="ZIBAL_MERCHANT" />
          <Integration ok={data.integrations.smtp} title="ایمیل (SMTP)" env="SMTP_HOST" />
          <Integration ok={data.integrations.sms} title="پیامک" env="SMS_API_KEY" />
          <Integration ok={data.integrations.telegram} title="ربات تلگرام" env="TELEGRAM_BOT_TOKEN" />
        </div>

        {data.integrations.zibalSandbox ? (
          <Alert tone="warning" title="درگاه زیبال در حالت تست است">
            مقدار <code className="mono ltr">ZIBAL_MERCHANT</code> برابر <code className="mono ltr">zibal</code> است.
            برای دریافت پول واقعی، کد مرچنت خود را جایگزین کنید.
          </Alert>
        ) : null}

        <div className="mt-4">
          <Field label="آدرس بازگشت از درگاه" hint="این آدرس را در پنل زیبال ثبت کنید.">
            <div className="flex items-center gap-2">
              <code className="mono ltr flex-1 overflow-x-auto whitespace-nowrap rounded-lg px-3 py-2 text-[11px] surface-2">
                {data.integrations.appUrl}/api/wallet/callback
              </code>
              <CopyButton value={`${data.integrations.appUrl}/api/wallet/callback`} />
            </div>
          </Field>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        {/* ثبت‌نام و حساب */}
        <Card title="ثبت‌نام و حساب کاربری">
          <div className="space-y-4">
            <Toggle
              checked={Boolean(s.registrationOpen)}
              onChange={(v) => set('registrationOpen', v)}
              label="ثبت‌نام باز است"
              description="با خاموش کردن، کاربر جدید نمی‌تواند ثبت‌نام کند."
            />
            <Toggle
              checked={Boolean(s.requireEmailVerify)}
              onChange={(v) => set('requireEmailVerify', v)}
              label="الزام تایید ایمیل"
              description="تا تایید ایمیل، کاربر نمی‌تواند سرور بسازد."
            />
            <Toggle
              checked={Boolean(s.requirePhoneVerify)}
              onChange={(v) => set('requirePhoneVerify', v)}
              label="الزام تایید شماره موبایل"
              description="نیازمند پیکربندی سرویس پیامک."
            />
          </div>
        </Card>

        {/* درگاه‌ها */}
        <Card title="روش‌های پرداخت">
          <div className="space-y-4">
            <Toggle
              checked={Boolean(s.gatewayZibal)}
              onChange={(v) => set('gatewayZibal', v)}
              label="درگاه آنلاین زیبال"
              description="پرداخت با کارت‌های عضو شتاب."
            />
            <Toggle
              checked={Boolean(s.gatewayManual)}
              onChange={(v) => set('gatewayManual', v)}
              label="واریز کارت به کارت"
              description="کاربر رسید ثبت می‌کند و شما تایید می‌کنید."
            />

            {s.gatewayManual ? (
              <Field label="اطلاعات حساب برای واریز" hint="این متن به کاربر نمایش داده می‌شود.">
                <Textarea
                  value={String(s.manualBankInfo ?? '')}
                  onChange={(e) => set('manualBankInfo', e.target.value)}
                  className="min-h-28 text-xs"
                  placeholder={'بانک ملت\nشماره کارت: 6104-3378-xxxx-xxxx\nبه نام: ...'}
                />
              </Field>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="حداقل شارژ (تومان)">
                <MoneyInput value={Number(s.minTopup)} onValueChange={(v) => set('minTopup', v)} />
              </Field>
              <Field label="حداکثر شارژ (تومان)">
                <MoneyInput value={Number(s.maxTopup)} onValueChange={(v) => set('maxTopup', v)} />
              </Field>
            </div>
          </div>
        </Card>

        {/* چرخه سرویس */}
        <Card title="چرخه سرویس و تعلیق">
          <div className="space-y-4">
            <Field
              label="حداقل اعتبار برای سرور ساعتی (ساعت)"
              hint={`کاربر باید معادل این تعداد ساعت موجودی داشته باشد تا بتواند سرور ساعتی بسازد.`}
            >
              <NumberInput
                value={Number(s.hourlyPrepayHours)}
                onValueChange={(v) => set('hourlyPrepayHours', v)}
                />
            </Field>

            <Field label="مهلت پس از اتمام موجودی (ساعت)" hint="پس از این مدت سرور تعلیق می‌شود.">
              <NumberInput
                value={Number(s.suspendGraceHours)}
                onValueChange={(v) => set('suspendGraceHours', v)}
                />
            </Field>

            <Field label="نگهداری داده پس از تعلیق (روز)" hint="پس از این مدت سرور برای همیشه حذف می‌شود.">
              <NumberInput
                value={Number(s.deleteAfterDays)}
                onValueChange={(v) => set('deleteAfterDays', v)}
                />
            </Field>

            <Field label="یادآوری قبل از سررسید (روز)">
              <NumberInput
                value={Number(s.invoiceLeadDays)}
                onValueChange={(v) => set('invoiceLeadDays', v)}
                />
            </Field>

            <Alert tone="info">
              با تنظیم فعلی، کاربری که موجودی‌اش تمام شود {String(s.suspendGraceHours)} ساعت مهلت دارد و داده‌هایش
              تا {String(s.deleteAfterDays)} روز پس از تعلیق نگهداری می‌شود.
            </Alert>
          </div>
        </Card>

        {/* تعویض آی‌پی */}
        <Card
          title="تعویض آی‌پی سرور"
          description="کاربر می‌تواند آدرس IPv4 سرورش را عوض کند؛ کاربردی برای زمانی که آی‌پی از داخل ایران فیلتر یا مسدود می‌شود."
        >
          <div className="space-y-4">
            <Toggle
              checked={Boolean(s.ipChangeEnabled)}
              onChange={(v) => set('ipChangeEnabled', v)}
              label="امکان تعویض آی‌پی فعال باشد"
              description="با خاموش کردن، دکمه تعویض آی‌پی از پنل کاربر برداشته می‌شود."
            />

            <Field
              label="هزینه هر بار تعویض (تومان)"
              hint="این مبلغ پیش از شروع عملیات از کیف پول کاربر کسر می‌شود و در صورت شکست، کامل برمی‌گردد."
            >
              <MoneyInput
                value={Number(s.ipChangeFee)}
                onValueChange={(v) => set('ipChangeFee', v)}
                disabled={!s.ipChangeEnabled}
              />
            </Field>

            <Field label="سقف تعویض در هر ماه برای هر سرور" hint="برای جلوگیری از سوءاستفاده و مصرف بی‌رویه آی‌پی.">
              <NumberInput
                value={Number(s.ipChangeMaxPerMonth)}
                onValueChange={(v) => set('ipChangeMaxPerMonth', v)}
                disabled={!s.ipChangeEnabled} />
            </Field>

            <Field
              label="پنجره تعویض رایگان پس از ساخت (ساعت)"
              hint="در این مدت تعویض آدرس رایگان است و از سهمیه ماهانه کم نمی‌کند. صفر یعنی بدون پنجره رایگان."
            >
              <NumberInput
                value={Number(s.ipChangeFreeHours)}
                onValueChange={(v) => set('ipChangeFreeHours', v)}
                disabled={!s.ipChangeEnabled} />
            </Field>

            <Alert tone="warning" title="چند نکته درباره این عملیات">
              سرور در جریان تعویض آی‌پی چند دقیقه خاموش می‌شود و آی‌پی قبلی برای همیشه از دست می‌رود. هزینه واقعی
              آی‌پی جدید را هتزنر از حساب شما می‌گیرد، پس مبلغ را کمتر از آن تعیین نکنید.
            </Alert>
          </div>
        </Card>

        {/* بررسی دسترسی از ایران */}
        <Card
          title="بررسی دسترسی آدرس از ایران"
          description="آدرس هر سرور تازه پیش از تحویل، از داخل ایران آزمایش می‌شود. اگر باز نشود، پنل خودش و رایگان عوضش می‌کند."
          action={
            <Link href="/admin/ip-health" className="btn btn-secondary btn-sm">
              <Radar size={14} /> وضعیت آدرس‌ها <ArrowLeft size={13} />
            </Link>
          }
        >
          <div className="space-y-4">
            <Toggle
              checked={Boolean(s.ipProbeEnabled)}
              onChange={(v) => set('ipProbeEnabled', v)}
              label="بررسی خودکار فعال باشد"
              description="نیازمند اجرای سرویس آزمایش روی یک سرور ایرانی و تنظیم IRAN_PROBE_URL در فایل .env."
            />

            <Toggle
              checked={Boolean(s.ipAutoSwapEnabled)}
              onChange={(v) => set('ipAutoSwapEnabled', v)}
              disabled={!s.ipProbeEnabled}
              label="تعویض خودکار آدرس مسدود"
              description="اگر خاموش باشد، فقط به شما و مشتری اطلاع داده می‌شود و تعویض دستی می‌ماند."
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="پورت آزمایش" hint="معمولاً ۲۲ که روی همه سرورها باز است.">
                <NumberInput
                value={Number(s.ipProbePort)}
                onValueChange={(v) => set('ipProbePort', v)}
                disabled={!s.ipProbeEnabled} />
              </Field>

              <Field label="مهلت هر تلاش (میلی‌ثانیه)">
                <NumberInput
                value={Number(s.ipProbeTimeoutMs)}
                onValueChange={(v) => set('ipProbeTimeoutMs', v)}
                disabled={!s.ipProbeEnabled} />
              </Field>

              <Field label="تلاش در هر دور" hint="یک پاسخ موفق کافی است.">
                <NumberInput
                value={Number(s.ipProbeTries)}
                onValueChange={(v) => set('ipProbeTries', v)}
                disabled={!s.ipProbeEnabled} />
              </Field>

              <Field label="دور ناموفق تا تصمیم" hint="هر دور دو دقیقه فاصله دارد.">
                <NumberInput
                value={Number(s.ipProbeRoundsToFail)}
                onValueChange={(v) => set('ipProbeRoundsToFail', v)}
                disabled={!s.ipProbeEnabled} />
              </Field>

              <Field label="سقف تعویض خودکار هر سرور">
                <NumberInput
                value={Number(s.ipAutoSwapMax)}
                onValueChange={(v) => set('ipAutoSwapMax', v)}
                disabled={!s.ipProbeEnabled || !s.ipAutoSwapEnabled} />
              </Field>

              <Field label="مشاهده منفی تا سوختن یک رنج" hint="پس از این تعداد، کل بلوک /24 کنار گذاشته می‌شود.">
                <NumberInput
                value={Number(s.ipPrefixBadThreshold)}
                onValueChange={(v) => set('ipPrefixBadThreshold', v)}
                disabled={!s.ipProbeEnabled} />
              </Field>
            </div>

            <Alert tone="info">
              با تنظیم فعلی، اگر آدرسی {String(s.ipProbeRoundsToFail)} دور پیاپی از ایران جواب ندهد مسدود شناخته
              می‌شود و تا {String(s.ipAutoSwapMax)} بار رایگان عوض می‌شود.
            </Alert>
          </div>
        </Card>

        {/* باشگاه مشتریان و گزارش هفتگی */}
        <Card
          title="باشگاه مشتریان و گزارش هفتگی"
          description="تخفیف پلکانی خودکار بر اساس مجموع مصرف؛ سطح کاربر هرگز پایین نمی‌آید."
        >
          <div className="space-y-4">
            <Toggle
              checked={Boolean(s.loyaltyEnabled)}
              onChange={(v) => set('loyaltyEnabled', v)}
              label="باشگاه مشتریان فعال باشد"
              description="تخفیف مؤثر هر کاربر، بیشترینِ تخفیف دستی و تخفیف سطح اوست."
            />

            <div className="grid grid-cols-2 gap-3">
              <Field label="آستانه نقره‌ای (تومان)">
                <MoneyInput value={Number(s.loyaltySilverSpend)} onValueChange={(v) => set('loyaltySilverSpend', v)} disabled={!s.loyaltyEnabled} />
              </Field>
              <Field label="تخفیف نقره‌ای (٪)">
                <NumberInput
                value={Number(s.loyaltySilverPct)}
                onValueChange={(v) => set('loyaltySilverPct', v)}
                disabled={!s.loyaltyEnabled} />
              </Field>
              <Field label="آستانه طلایی (تومان)">
                <MoneyInput value={Number(s.loyaltyGoldSpend)} onValueChange={(v) => set('loyaltyGoldSpend', v)} disabled={!s.loyaltyEnabled} />
              </Field>
              <Field label="تخفیف طلایی (٪)">
                <NumberInput
                value={Number(s.loyaltyGoldPct)}
                onValueChange={(v) => set('loyaltyGoldPct', v)}
                disabled={!s.loyaltyEnabled} />
              </Field>
              <Field label="آستانه الماس (تومان)">
                <MoneyInput value={Number(s.loyaltyDiamondSpend)} onValueChange={(v) => set('loyaltyDiamondSpend', v)} disabled={!s.loyaltyEnabled} />
              </Field>
              <Field label="تخفیف الماس (٪)">
                <NumberInput
                value={Number(s.loyaltyDiamondPct)}
                onValueChange={(v) => set('loyaltyDiamondPct', v)}
                disabled={!s.loyaltyEnabled} />
              </Field>
            </div>

            <div className="border-t pt-4">
              <Toggle
                checked={Boolean(s.weeklyReportEnabled)}
                onChange={(v) => set('weeklyReportEnabled', v)}
                label="گزارش هفتگی ایمیلی"
                description="جمعه‌ها برای کاربران دارای سرور ارسال می‌شود؛ هر کاربر می‌تواند برای خودش خاموشش کند."
              />
            </div>
          </div>
        </Card>

        {/* برند */}
        <Card title="اطلاعات برند و پشتیبانی">
          <div className="space-y-4">
            <Field label="نام برند">
              <Input value={String(s.brandName ?? '')} onChange={(e) => set('brandName', e.target.value)} />
            </Field>
            <Field label="آدرس سایت">
              <Input
                value={String(s.siteUrl ?? '')}
                onChange={(e) => set('siteUrl', e.target.value)}
                className="ltr"
                dir="ltr"
              />
            </Field>
            <Field label="ایمیل پشتیبانی">
              <Input
                value={String(s.supportEmail ?? '')}
                onChange={(e) => set('supportEmail', e.target.value)}
                className="ltr"
                dir="ltr"
              />
            </Field>
            <Field label="تلفن پشتیبانی">
              <Input
                value={String(s.supportPhone ?? '')}
                onChange={(e) => set('supportPhone', e.target.value)}
                className="ltr"
                dir="ltr"
              />
            </Field>

            <div className="border-t pt-4">
              <Toggle
                checked={Boolean(s.maintenanceMode)}
                onChange={(v) => set('maintenanceMode', v)}
                label="حالت تعمیر و نگهداری"
                description="کاربران عادی پیام نگهداری می‌بینند؛ مدیران همچنان دسترسی دارند."
              />
              {s.maintenanceMode ? (
                <div className="mt-3">
                  <Field label="پیام نگهداری">
                    <Textarea
                      value={String(s.maintenanceMessage ?? '')}
                      onChange={(e) => set('maintenanceMessage', e.target.value)}
                      className="min-h-20 text-xs"
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          </div>
        </Card>
      </div>

      <AdvancedSettingsCards data={data} s={s} set={set} />

      <div className="sticky bottom-4 z-20">
        <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3 shadow-lg">
          <span className="text-xs muted">
            {dirty ? 'تغییرات ذخیره‌نشده دارید.' : 'همه تغییرات ذخیره شده است.'}
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

function HetznerCapacityCard({ capacity }: { capacity: SettingsData['hetznerCapacity'] }) {
  const percent = Math.min(100, capacity.usagePercent);
  const tone = percent >= 100 ? 'bg-red-500' : percent >= 80 ? 'bg-amber-500' : 'bg-[var(--color-brand-500)]';

  return (
    <Card
      title="ظرفیت ساخت سرور"
      description="مجموع ظرفیت همه حساب‌های هتزنر. هنگام ساخت سرور، حساب‌ها به ترتیب اولویت امتحان می‌شوند."
      action={
        <Link href="/admin/hetzner" className="btn btn-secondary btn-sm">
          <Cloud size={14} /> مدیریت حساب‌ها <ArrowLeft size={13} />
        </Link>
      }
    >
      {capacity.accounts === 0 ? (
        <Alert
          tone="error"
          title="هیچ حساب هتزنری ثبت نشده است"
          action={
            <Link href="/admin/hetzner" className="btn btn-primary btn-sm">
              افزودن حساب
            </Link>
          }
        >
          تا وقتی دست‌کم یک توکن API اضافه نکنید، هیچ سروری ساخته نمی‌شود.
        </Alert>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="حساب فعال" value={`${fa(capacity.enabled)} از ${fa(capacity.accounts)}`} />
            <MiniStat label="کل ظرفیت" value={fa(capacity.totalSlots)} />
            <MiniStat label="مصرف‌شده" value={fa(capacity.usedSlots)} />
            <MiniStat
              label="جای خالی"
              value={fa(capacity.freeSlots)}
              danger={capacity.freeSlots === 0}
              warn={capacity.freeSlots > 0 && capacity.freeSlots < 5}
            />
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="muted">درصد اشغال</span>
              <span className="tabular font-semibold">{fa(percent)}٪</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full surface-2">
              <div className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${percent}%` }} />
            </div>
          </div>

          {capacity.freeSlots === 0 ? (
            <div className="mt-4">
              <Alert tone="error" title="ظرفیت تکمیل است">
                کاربران تا افزودن حساب تازه یا بالا بردن سقف حساب‌های فعلی نمی‌توانند سرور جدید بسازند.
              </Alert>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

function MiniStat({
  label,
  value,
  danger,
  warn,
}: {
  label: string;
  value: string;
  danger?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-[11px] muted">{label}</div>
      <div
        className={`tabular mt-1 text-sm font-bold ${danger ? 'text-red-500' : warn ? 'text-amber-500' : ''}`}
      >
        {value}
      </div>
    </div>
  );
}

function Integration({ ok, title, env }: { ok: boolean; title: string; env: string }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">{title}</span>
        {ok ? (
          <Badge tone="ok">
            <CheckCircle2 size={11} /> فعال
          </Badge>
        ) : (
          <Badge tone="bad">
            <XCircle size={11} /> تنظیم نشده
          </Badge>
        )}
      </div>
      <code className="mono ltr mt-2 block text-[10px] muted">{env}</code>
    </div>
  );
}
