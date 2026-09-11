'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CreditCard, Wallet, Receipt, TrendingDown, Landmark, ExternalLink, Gift } from 'lucide-react';
import { Alert, Badge, Button, Card, Field, Input, Modal, Stat, Textarea, MoneyInput } from '@/components/ui';
import { useToast, useFlashFromQuery } from '@/components/ui/toast';
import { apiPost, apiPut, errorFields, errorMessage } from '@/lib/client';
import { formatToman, formatNumber } from '@/lib/money';
import { faDateTime, faDuration, TX_STATUS_FA, TX_TYPE_FA, cn } from '@/lib/utils';

type Tx = {
  id: string;
  ref: string;
  type: string;
  direction: string;
  amount: number;
  status: string;
  gateway: string | null;
  gatewayRefId: string | null;
  trackId: string | null;
  description: string | null;
  createdAt: string;
  paidAt: string | null;
};

const QUICK_AMOUNTS = [200_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000];

export function WalletClient({
  balance,
  creditLimit,
  burn,
  gateways,
  limits,
  bankInfo,
  pendingManual,
  recent,
}: {
  balance: number;
  creditLimit: number;
  burn: { hourly: number; daily: number; monthly: number };
  gateways: { id: string; title: string; description: string }[];
  limits: { min: number; max: number };
  bankInfo: string;
  pendingManual: number;
  recent: Tx[];
}) {
  useFlashFromQuery();
  const toast = useToast();

  // دکمه‌های سریع فقط مبالغی را نشان می‌دهند که در بازه مجاز شارژ باشند
  const quickAmounts = QUICK_AMOUNTS.filter((a) => a >= limits.min && a <= limits.max).slice(0, 6);
  const [amount, setAmount] = useState<number>(Math.max(500_000, limits.min));
  const [gateway, setGateway] = useState(gateways[0]?.id ?? 'zibal');
  const [loading, setLoading] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [manualOpen, setManualOpen] = useState(false);
  const [manualInfo, setManualInfo] = useState('');
  const [coupon, setCoupon] = useState('');
  const [couponNote, setCouponNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);

  const numericAmount = amount;
  const hoursLeft = burn.hourly > 0 ? Math.floor(balance / burn.hourly) : null;

  async function startTopup(e: React.FormEvent) {
    e.preventDefault();
    setFields({});

    if (numericAmount < limits.min) {
      setFields({ amount: `حداقل مبلغ شارژ ${formatToman(limits.min)} است.` });
      return;
    }
    if (numericAmount > limits.max) {
      setFields({ amount: `حداکثر مبلغ در هر تراکنش ${formatToman(limits.max)} است.` });
      return;
    }

    setLoading(true);
    try {
      const res = await apiPost<{
        mode: 'redirect' | 'manual';
        redirectUrl?: string;
        bankInfo?: string;
        message?: string;
      }>('/api/wallet/topup', { amount: numericAmount, gateway, couponCode: coupon.trim() || undefined });

      if (res.mode === 'redirect' && res.redirectUrl) {
        window.location.href = res.redirectUrl;
        return;
      }
      setManualInfo(res.bankInfo ?? bankInfo);
      setManualOpen(true);
    } catch (err) {
      toast.error('شروع پرداخت انجام نشد', errorMessage(err));
      setFields(errorFields(err));
    } finally {
      setLoading(false);
    }
  }

  async function checkCoupon() {
    if (!coupon.trim()) return;
    setCouponChecking(true);
    setCouponNote(null);
    try {
      const res = await apiPut<{ valid: boolean; kind?: string; message: string }>('/api/wallet/redeem', {
        code: coupon.trim(),
      });
      if (!res.valid) setCouponNote({ ok: false, text: res.message });
      else if (res.kind === 'GIFT')
        setCouponNote({ ok: false, text: 'این کد هدیه است؛ آن را در کادر «کد هدیه» پایین صفحه وارد کنید.' });
      else setCouponNote({ ok: true, text: res.message });
    } catch (err) {
      setCouponNote({ ok: false, text: errorMessage(err) });
    } finally {
      setCouponChecking(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_22rem] lg:items-start">
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="موجودی فعلی"
            value={formatToman(balance)}
            hint={creditLimit > 0 ? `اعتبار مجاز منفی: ${formatToman(creditLimit)}` : undefined}
            icon={<Wallet size={16} />}
            tone={balance <= 0 ? 'bad' : hoursLeft !== null && hoursLeft < 72 ? 'warn' : 'ok'}
          />
          <Stat
            label="مصرف روزانه"
            value={formatToman(burn.daily)}
            hint={`ماهانه حدود ${formatToman(burn.monthly)}`}
            icon={<TrendingDown size={16} />}
          />
          <Stat
            label="اعتبار باقی‌مانده"
            value={hoursLeft === null ? 'نامحدود' : faDuration(hoursLeft * 3600_000)}
            hint={hoursLeft === null ? 'سرویس فعالی ندارید' : 'با مصرف فعلی'}
            icon={<Receipt size={16} />}
            tone={hoursLeft !== null && hoursLeft < 48 ? 'bad' : undefined}
          />
        </div>

        {pendingManual > 0 ? (
          <Alert tone="warning" title={`${formatNumber(pendingManual)} رسید در انتظار بررسی`}>
            رسیدهای واریز دستی شما ثبت شده و پس از تایید پشتیبانی به کیف پول اضافه می‌شود.
          </Alert>
        ) : null}

        <Card
          title="آخرین تراکنش‌ها"
          action={
            <Link href="/dashboard/transactions" className="text-xs text-[var(--color-brand-600)] hover:underline">
              مشاهده همه
            </Link>
          }
          bodyClassName="p-0"
        >
          {recent.length === 0 ? (
            <p className="py-12 text-center text-xs muted">هنوز تراکنشی ثبت نشده است.</p>
          ) : (
            <div className="scroll-x">
              <table className="table table-cards">
                <thead>
                  <tr>
                    <th>شرح</th>
                    <th>نوع</th>
                    <th>مبلغ</th>
                    <th>وضعیت</th>
                    <th>تاریخ</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((t) => {
                    const status = TX_STATUS_FA[t.status] ?? { label: t.status, tone: 'muted' as const };
                    return (
                      <tr key={t.id}>
                        <td data-label="شرح" className="max-w-xs">
                          <div className="truncate text-xs">{t.description ?? '—'}</div>
                          {t.gatewayRefId ? (
                            <div className="mono ltr mt-0.5 text-[10px] muted">کد پیگیری: {t.gatewayRefId}</div>
                          ) : null}
                        </td>
                        <td data-label="نوع" className="whitespace-nowrap text-xs muted">{TX_TYPE_FA[t.type] ?? t.type}</td>
                        <td data-label="مبلغ"
                          className={cn(
                            'tabular whitespace-nowrap text-xs font-bold',
                            t.direction === 'CREDIT' ? 'text-emerald-600' : 'text-red-500',
                          )}
                        >
                          {t.direction === 'CREDIT' ? '+' : '−'}
                          {formatToman(t.amount, { suffix: false })}
                        </td>
                        <td data-label="وضعیت">
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </td>
                        <td data-label="تاریخ" className="whitespace-nowrap text-xs muted">{faDateTime(t.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* فرم شارژ */}
      <aside className="lg:sticky lg:top-20">
        <Card title="شارژ کیف پول">
          <form onSubmit={startTopup} className="space-y-4">
            <Field
              label="مبلغ (تومان)"
              required
              error={fields.amount}
              hint={`حداقل ${formatToman(limits.min)}`}
            >
              <MoneyInput
                value={amount}
                onValueChange={setAmount}
                className="text-center text-base font-bold"
                required
              />
            </Field>

            <div className="grid grid-cols-3 gap-2">
              {quickAmounts.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAmount(a)}
                  className={cn(
                    'rounded-lg border px-2 py-2 text-[11px] font-semibold transition',
                    numericAmount === a
                      ? 'border-[var(--color-brand-500)] bg-[color-mix(in_srgb,var(--color-brand-500)_10%,transparent)]'
                      : 'muted hover:bg-[var(--surface-2)]',
                  )}
                >
                  {formatNumber(a / 1000)} هزار
                </button>
              ))}
            </div>

            {gateways.length > 1 ? (
              <div>
                <span className="label">روش پرداخت</span>
                <div className="space-y-2">
                  {gateways.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGateway(g.id)}
                      className={cn(
                        'flex w-full items-start gap-2.5 rounded-xl border p-3 text-right transition',
                        gateway === g.id
                          ? 'border-[var(--color-brand-500)] bg-[color-mix(in_srgb,var(--color-brand-500)_8%,transparent)]'
                          : 'hover:bg-[var(--surface-2)]',
                      )}
                    >
                      {g.id === 'manual' ? (
                        <Landmark size={16} className="mt-0.5 shrink-0 muted" />
                      ) : (
                        <CreditCard size={16} className="mt-0.5 shrink-0 muted" />
                      )}
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold">{g.title}</span>
                        <span className="mt-0.5 block text-[10px] leading-5 muted">{g.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <Field
              label="کد شارژ بیشتر (اختیاری)"
              error={fields.couponCode}
              hint={
                couponNote ? (
                  <span className={couponNote.ok ? 'text-emerald-600' : 'text-red-500'}>{couponNote.text}</span>
                ) : (
                  'اگر کد کمپین دارید، اینجا بزنید تا پس از پرداخت، شارژ بیشتر هدیه بگیرید.'
                )
              }
            >
              <div className="flex gap-2">
                <Input
                  value={coupon}
                  onChange={(e) => {
                    setCoupon(e.target.value.toUpperCase());
                    setCouponNote(null);
                  }}
                  placeholder="مثلاً NOWRUZ20"
                  className="ltr mono"
                  dir="ltr"
                  autoComplete="off"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={checkCoupon}
                  loading={couponChecking}
                  disabled={coupon.trim().length < 3}
                >
                  بررسی
                </Button>
              </div>
            </Field>

            {gateways.length === 0 ? (
              <Alert tone="warning" title="درگاه پرداخت فعال نیست">
                در حال حاضر امکان شارژ آنلاین وجود ندارد. با پشتیبانی تماس بگیرید.
              </Alert>
            ) : (
              <Button type="submit" className="w-full" loading={loading} icon={<ExternalLink size={15} />}>
                پرداخت {numericAmount > 0 ? formatToman(numericAmount) : ''}
              </Button>
            )}

            <p className="text-[11px] leading-6 muted">
              پس از پرداخت موفق، مبلغ بلافاصله به کیف پول اضافه می‌شود و در صورت وجود سرور تعلیق‌شده، به‌طور خودکار
              روشن می‌گردد.
            </p>
          </form>
        </Card>

        {gateway === 'manual' && bankInfo ? (
          <Card title="اطلاعات واریز" className="mt-4">
            <pre className="whitespace-pre-wrap text-xs leading-7">{bankInfo}</pre>
          </Card>
        ) : null}

        <div className="mt-4">
          <GiftCodeCard />
        </div>
      </aside>

      <ManualReceiptModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        bankInfo={manualInfo || bankInfo}
        defaultAmount={numericAmount}
      />
    </div>
  );
}

function ManualReceiptModal({
  open,
  onClose,
  bankInfo,
  defaultAmount,
}: {
  open: boolean;
  onClose: () => void;
  bankInfo: string;
  defaultAmount: number;
}) {
  const toast = useToast();
  const [trackId, setTrackId] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      const res = await apiPost<{ message: string }>('/api/wallet/manual', {
        amount: defaultAmount,
        trackId,
        cardNumber,
        note,
      });
      toast.success('رسید ثبت شد', res.message);
      onClose();
      setTrackId('');
      setNote('');
    } catch (err) {
      toast.error('ثبت رسید انجام نشد', errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ثبت رسید واریز"
      description={`مبلغ ${formatToman(defaultAmount)} را به حساب زیر واریز و سپس اطلاعات رسید را ثبت کنید.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            بعداً
          </Button>
          <Button onClick={submit} loading={loading} disabled={trackId.trim().length < 3}>
            ثبت رسید
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {bankInfo ? (
          <div className="rounded-xl p-3 text-xs leading-7 surface-2">
            <pre className="whitespace-pre-wrap">{bankInfo}</pre>
          </div>
        ) : null}
        <Field label="شماره پیگیری واریز" required>
          <Input value={trackId} onChange={(e) => setTrackId(e.target.value)} className="ltr mono" dir="ltr" />
        </Field>
        <Field label="چهار رقم آخر کارت مبدأ">
          <Input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} className="ltr mono" dir="ltr" />
        </Field>
        <Field label="توضیحات">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-20 text-xs" />
        </Field>
      </div>
    </Modal>
  );
}

/** کد هدیه: اعتبار مستقیم به کیف پول */
function GiftCodeCard() {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function redeem() {
    setBusy(true);
    try {
      const res = await apiPost<{ message: string }>('/api/wallet/redeem', { code: code.trim() });
      toast.success('کد هدیه اعمال شد 🎁', res.message);
      setCode('');
      // موجودی بالای صفحه از سرور می‌آید؛ تازه‌سازی ساده‌ترین راه هماهنگی است
      window.location.reload();
    } catch (err) {
      toast.error('کد اعمال نشد', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="کد هدیه دارید؟" description="کد را وارد کنید تا اعتبارش بلافاصله به کیف پول شما اضافه شود.">
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="مثلاً WELCOME"
          className="ltr mono"
          dir="ltr"
          autoComplete="off"
        />
        <Button onClick={redeem} loading={busy} disabled={code.trim().length < 3} icon={<Gift size={15} />}>
          اعمال
        </Button>
      </div>
    </Card>
  );
}
