'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Landmark, CreditCard, Wallet, Save } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CopyButton,
  Field,
  Input,
  LoadingBlock,
  Pagination,
  Select,
  Stat,
  Textarea,
  Toggle,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiPost, errorMessage, fetcher } from '@/lib/client';
import { formatToman, formatNumber } from '@/lib/money';
import { faDateTime } from '@/lib/utils';

type Stats = { successCount: number; successSum: number; pending: number; failed: number };

type Data = {
  callbackUrl: string;
  zibal: { enabled: boolean; merchant: string; source: string; effectiveMerchant: string; sandbox: boolean; stats: Stats };
  bitpay: { enabled: boolean; hasApi: boolean; stats: Stats };
  manual: { enabled: boolean; bankInfo: string; stats: Stats };
  logs: {
    items: {
      id: string;
      gateway: string | null;
      amount: number;
      status: string;
      trackId: string | null;
      refId: string | null;
      email: string | null;
      createdAt: string;
      paidAt: string | null;
    }[];
    meta: { page: number; total: number; totalPages: number };
  };
};

const GATEWAY_FA: Record<string, string> = { zibal: 'زیبال', bitpay: 'بیت‌پی', manual: 'کارت‌به‌کارت' };
const STATUS_FA: Record<string, { label: string; tone: 'ok' | 'bad' | 'warn' | 'muted' }> = {
  SUCCESS: { label: 'موفق', tone: 'ok' },
  PENDING: { label: 'در انتظار', tone: 'warn' },
  FAILED: { label: 'ناموفق', tone: 'bad' },
  CANCELED: { label: 'لغو شده', tone: 'muted' },
};

export function GatewaysClient() {
  const [page, setPage] = useState(1);
  const [gatewayFilter, setGatewayFilter] = useState('ALL');
  const key = `/api/admin/gateways?page=${page}&gateway=${gatewayFilter}`;
  const { data, isLoading, mutate } = useSWR<Data>(key, fetcher, { refreshInterval: 60_000 });

  if (isLoading && !data) return <LoadingBlock label="در حال دریافت وضعیت درگاه‌ها…" />;
  if (!data) return <Alert tone="error">دریافت اطلاعات ممکن نشد.</Alert>;

  return (
    <div className="space-y-6">
      {/* آدرس بازگشت مشترک */}
      <Card title="آدرس بازگشت از درگاه (Callback)">
        <p className="text-[11px] leading-6 muted">
          این آدرس را در پنل هر درگاه (زیبال، بیت‌پی) به‌عنوان آدرس بازگشت/Callback ثبت کنید.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <code className="mono ltr flex-1 overflow-x-auto whitespace-nowrap rounded-lg px-3 py-2 text-[11px] surface-2">
            {data.callbackUrl}
          </code>
          <CopyButton value={data.callbackUrl} />
        </div>
      </Card>

      <ZibalCard data={data.zibal} onSaved={mutate} />
      <BitpayCard data={data.bitpay} onSaved={mutate} />
      <ManualCard data={data.manual} onSaved={mutate} />

      {/* گزارش تراکنش‌ها */}
      <Card
        title={data.logs ? `گزارش پرداخت‌ها (${formatNumber(data.logs.meta.total)})` : 'گزارش پرداخت‌ها'}
        action={
          <Select
            value={gatewayFilter}
            onChange={(e) => {
              setGatewayFilter(e.target.value);
              setPage(1);
            }}
            className="w-36 text-xs"
          >
            <option value="ALL">همه درگاه‌ها</option>
            <option value="zibal">زیبال</option>
            <option value="bitpay">بیت‌پی</option>
            <option value="manual">کارت‌به‌کارت</option>
          </Select>
        }
        bodyClassName="p-0"
      >
        {!data.logs.items.length ? (
          <p className="py-10 text-center text-xs muted">تراکنشی یافت نشد.</p>
        ) : (
          <>
            <div className="scroll-x">
              <table className="table table-cards">
                <thead>
                  <tr>
                    <th>کاربر</th>
                    <th>درگاه</th>
                    <th>مبلغ</th>
                    <th>وضعیت</th>
                    <th>کد پیگیری</th>
                    <th>تاریخ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.logs.items.map((t) => {
                    const st = STATUS_FA[t.status] ?? { label: t.status, tone: 'muted' as const };
                    return (
                      <tr key={t.id}>
                        <td data-label="کاربر" className="ltr max-w-40 truncate text-[11px]">{t.email ?? '—'}</td>
                        <td data-label="درگاه" className="text-xs">{GATEWAY_FA[t.gateway ?? ''] ?? t.gateway ?? '—'}</td>
                        <td data-label="مبلغ" className="tabular whitespace-nowrap text-xs font-bold">
                          {formatToman(t.amount, { suffix: false })}
                        </td>
                        <td data-label="وضعیت">
                          <Badge tone={st.tone}>{st.label}</Badge>
                        </td>
                        <td data-label="کد پیگیری" className="mono ltr text-[10px] muted">{t.trackId ?? t.refId ?? '—'}</td>
                        <td data-label="تاریخ" className="whitespace-nowrap text-[11px] muted">{faDateTime(t.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={data.logs.meta.page} totalPages={data.logs.meta.totalPages} onChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}

function GatewayStats({ stats }: { stats: Stats }) {
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <Stat label="درآمد ۳۰ روز" value={formatToman(stats.successSum, { suffix: false })} tone="ok" />
      <Stat label="پرداخت موفق ۳۰ روز" value={formatNumber(stats.successCount)} />
      <Stat label="در انتظار" value={formatNumber(stats.pending)} tone={stats.pending ? 'warn' : undefined} />
      <Stat label="ناموفق ۳۰ روز" value={formatNumber(stats.failed)} />
    </div>
  );
}

function ZibalCard({ data, onSaved }: { data: Data['zibal']; onSaved: () => void }) {
  const toast = useToast();
  const [enabled, setEnabled] = useState(data.enabled);
  const [merchant, setMerchant] = useState(data.merchant);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await apiPost<{ message: string }>('/api/admin/gateways', { action: 'save-zibal', enabled, merchant });
      toast.success(res.message);
      onSaved();
    } catch (err) {
      toast.error('ذخیره انجام نشد', errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <CreditCard size={15} /> درگاه زیبال
          <Badge tone={data.enabled ? 'ok' : 'muted'}>{data.enabled ? 'فعال' : 'غیرفعال'}</Badge>
          {data.sandbox ? <Badge tone="warn">حالت تست</Badge> : null}
        </span>
      }
    >
      <div className="space-y-4">
        <GatewayStats stats={data.stats} />
        <Toggle checked={enabled} onChange={setEnabled} label="درگاه زیبال فعال باشد" description="پرداخت آنلاین با کارت‌های عضو شتاب." />
        <Field label="کد مرچنت زیبال" hint="از پنل زیبال دریافت می‌شود. اگر خالی بماند، مقدار موجود در فایل env استفاده می‌شود.">
          <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="مثلاً 6xxxxxxx-xxxx-xxxx" className="ltr mono" dir="ltr" />
        </Field>
        {data.sandbox ? (
          <Alert tone="warning">
            مرچنت فعلی «zibal» (تست) است؛ پول واقعی دریافت نمی‌شود. برای دریافت پول، کد مرچنت واقعی خود را وارد کنید.
          </Alert>
        ) : null}
        <Button size="sm" onClick={save} loading={saving} icon={<Save size={14} />}>
          ذخیره درگاه زیبال
        </Button>
      </div>
    </Card>
  );
}

function BitpayCard({ data, onSaved }: { data: Data['bitpay']; onSaved: () => void }) {
  const toast = useToast();
  const [enabled, setEnabled] = useState(data.enabled);
  const [api, setApi] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await apiPost<{ message: string }>('/api/admin/gateways', { action: 'save-bitpay', enabled, api });
      toast.success(res.message);
      setApi('');
      onSaved();
    } catch (err) {
      toast.error('ذخیره انجام نشد', errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Landmark size={15} /> درگاه بیت‌پی
          <Badge tone={data.enabled ? 'ok' : 'muted'}>{data.enabled ? 'فعال' : 'غیرفعال'}</Badge>
        </span>
      }
    >
      <div className="space-y-4">
        <GatewayStats stats={data.stats} />
        <Toggle checked={enabled} onChange={setEnabled} label="درگاه بیت‌پی فعال باشد" description="پرداخت آنلاین از طریق درگاه بیت‌پی (bitpay.ir)." />
        <Field
          label="کلید API بیت‌پی"
          hint={data.hasApi ? 'یک کلید ذخیره شده است. برای تغییر، کلید جدید را وارد کنید؛ خالی گذاشتن، کلید فعلی را نگه می‌دارد.' : 'از پنل بیت‌پی دریافت می‌شود.'}
        >
          <Input
            value={api}
            onChange={(e) => setApi(e.target.value)}
            placeholder={data.hasApi ? '••••••••  (بدون تغییر)' : 'کلید API را وارد کنید'}
            className="ltr mono"
            dir="ltr"
            autoComplete="off"
          />
        </Field>
        {enabled && !data.hasApi && !api ? (
          <Alert tone="warning">برای فعال شدن واقعی، کلید API بیت‌پی را وارد کنید.</Alert>
        ) : null}
        <Button size="sm" onClick={save} loading={saving} icon={<Save size={14} />}>
          ذخیره درگاه بیت‌پی
        </Button>
      </div>
    </Card>
  );
}

function ManualCard({ data, onSaved }: { data: Data['manual']; onSaved: () => void }) {
  const toast = useToast();
  const [enabled, setEnabled] = useState(data.enabled);
  const [bankInfo, setBankInfo] = useState(data.bankInfo);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await apiPost<{ message: string }>('/api/admin/gateways', { action: 'save-manual', enabled, bankInfo });
      toast.success(res.message);
      onSaved();
    } catch (err) {
      toast.error('ذخیره انجام نشد', errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Wallet size={15} /> واریز کارت‌به‌کارت
          <Badge tone={data.enabled ? 'ok' : 'muted'}>{data.enabled ? 'فعال' : 'غیرفعال'}</Badge>
        </span>
      }
    >
      <div className="space-y-4">
        <GatewayStats stats={data.stats} />
        <Toggle checked={enabled} onChange={setEnabled} label="واریز کارت‌به‌کارت فعال باشد" description="کاربر رسید ثبت می‌کند و شما در بخش تراکنش‌ها تایید می‌کنید." />
        <Field label="اطلاعات حساب برای واریز" hint="این متن هنگام انتخاب این روش به کاربر نمایش داده می‌شود.">
          <Textarea
            value={bankInfo}
            onChange={(e) => setBankInfo(e.target.value)}
            className="min-h-28 text-xs"
            placeholder={'بانک ملت\nشماره کارت: 6104-3378-xxxx-xxxx\nبه نام: ...'}
          />
        </Field>
        <Button size="sm" onClick={save} loading={saving} icon={<Save size={14} />}>
          ذخیره واریز کارت‌به‌کارت
        </Button>
      </div>
    </Card>
  );
}
