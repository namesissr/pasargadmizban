'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Printer, Wallet, CheckCircle2 } from 'lucide-react';
import { Alert, Badge, Button, Card } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/app/shell';
import { apiPost, errorMessage } from '@/lib/client';
import { formatToman, formatNumber } from '@/lib/money';
import { faDate, faDateTime, INVOICE_STATUS_FA } from '@/lib/utils';

type Invoice = {
  id: string;
  number: number;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  note: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  dueAt: string | null;
  paidAt: string | null;
  createdAt: string;
  items: {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    serverName: string | null;
  }[];
  customer: {
    name: string;
    email: string;
    phone: string | null;
    company: string | null;
    address: string | null;
    nationalId: string | null;
    postalCode: string | null;
  };
};

export function InvoiceView({
  invoice,
  brand,
  balance,
}: {
  invoice: Invoice;
  brand: { name: string; email: string; phone: string; site: string };
  balance: number;
}) {
  const toast = useToast();
  const router = useRouter();
  const [paying, setPaying] = useState(false);

  const st = INVOICE_STATUS_FA[invoice.status] ?? { label: invoice.status, tone: 'muted' as const };
  const canPay = invoice.status === 'UNPAID';
  const enough = balance >= invoice.total;

  async function pay() {
    setPaying(true);
    try {
      const res = await apiPost<{ message: string }>(`/api/invoices/${invoice.id}`);
      toast.success('پرداخت انجام شد', res.message);
      router.refresh();
    } catch (err) {
      toast.error('پرداخت انجام نشد', errorMessage(err));
    } finally {
      setPaying(false);
    }
  }

  return (
    <>
      <div className="no-print">
        <PageHeader
          title={`فاکتور شماره ${formatNumber(invoice.number)}`}
          breadcrumb={[
            { href: '/dashboard', label: 'داشبورد' },
            { href: '/dashboard/invoices', label: 'فاکتورها' },
          ]}
          action={
            <>
              <Badge tone={st.tone}>{st.label}</Badge>
              <Button variant="secondary" size="sm" onClick={() => window.print()} icon={<Printer size={14} />}>
                چاپ
              </Button>
              {canPay ? (
                <Button size="sm" onClick={pay} loading={paying} disabled={!enough} icon={<Wallet size={14} />}>
                  پرداخت از کیف پول
                </Button>
              ) : null}
            </>
          }
        />

        {canPay && !enough ? (
          <div className="mb-5">
            <Alert tone="warning" title="موجودی کیف پول کافی نیست">
              برای پرداخت این فاکتور {formatToman(invoice.total - balance)} کم دارید. ابتدا کیف پول را شارژ کنید.
            </Alert>
          </div>
        ) : null}
      </div>

      <Card bodyClassName="p-6 sm:p-8">
        {/* سربرگ */}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
          <div>
            <div className="text-lg font-extrabold text-[var(--color-brand-700)]">{brand.name}</div>
            <div className="mt-1.5 space-y-0.5 text-[11px] muted">
              {brand.site ? <div className="ltr">{brand.site}</div> : null}
              {brand.email ? <div className="ltr">{brand.email}</div> : null}
              {brand.phone ? <div className="ltr">{brand.phone}</div> : null}
            </div>
          </div>
          <div className="text-left">
            <div className="text-sm font-bold">صورتحساب فروش خدمات</div>
            <dl className="mt-2 space-y-1 text-[11px]">
              <div className="flex justify-end gap-2">
                <dt className="muted">شماره فاکتور:</dt>
                <dd className="tabular font-semibold">{formatNumber(invoice.number)}</dd>
              </div>
              <div className="flex justify-end gap-2">
                <dt className="muted">تاریخ صدور:</dt>
                <dd>{faDate(invoice.createdAt)}</dd>
              </div>
              {invoice.paidAt ? (
                <div className="flex justify-end gap-2">
                  <dt className="muted">تاریخ پرداخت:</dt>
                  <dd>{faDate(invoice.paidAt)}</dd>
                </div>
              ) : invoice.dueAt ? (
                <div className="flex justify-end gap-2">
                  <dt className="muted">مهلت پرداخت:</dt>
                  <dd>{faDate(invoice.dueAt)}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </header>

        {/* اطلاعات خریدار */}
        <section className="border-b py-5">
          <h3 className="mb-2 text-xs font-bold">مشخصات خریدار</h3>
          <div className="grid gap-x-8 gap-y-1.5 text-[11px] sm:grid-cols-2">
            <Line label="نام" value={invoice.customer.name} />
            <Line label="ایمیل" value={invoice.customer.email} ltr />
            {invoice.customer.phone ? <Line label="تلفن" value={invoice.customer.phone} ltr /> : null}
            {invoice.customer.company ? <Line label="شرکت" value={invoice.customer.company} /> : null}
            {invoice.customer.nationalId ? <Line label="کد ملی" value={invoice.customer.nationalId} ltr /> : null}
            {invoice.customer.postalCode ? <Line label="کد پستی" value={invoice.customer.postalCode} ltr /> : null}
            {invoice.customer.address ? <Line label="آدرس" value={invoice.customer.address} full /> : null}
          </div>
        </section>

        {/* اقلام */}
        <section className="py-5">
          <div className="scroll-x">
            <table className="table table-cards">
              <thead>
                <tr>
                  <th className="w-10">ردیف</th>
                  <th>شرح خدمات</th>
                  <th className="w-20">تعداد</th>
                  <th className="w-32">مبلغ واحد</th>
                  <th className="w-32">مبلغ کل</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, i) => (
                  <tr key={item.id}>
                    <td data-label="ردیف" className="tabular text-xs muted">{formatNumber(i + 1)}</td>
                    <td data-label="شرح خدمات" className="text-xs">{item.description}</td>
                    <td data-label="تعداد" className="tabular text-xs">{formatNumber(item.quantity)}</td>
                    <td data-label="مبلغ واحد" className="tabular whitespace-nowrap text-xs">
                      {formatToman(item.unitPrice, { suffix: false })}
                    </td>
                    <td data-label="مبلغ کل" className="tabular whitespace-nowrap text-xs font-semibold">
                      {formatToman(item.total, { suffix: false })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {invoice.periodStart && invoice.periodEnd ? (
            <p className="mt-3 text-[11px] muted">
              دوره سرویس: از {faDate(invoice.periodStart)} تا {faDate(invoice.periodEnd)}
            </p>
          ) : null}
        </section>

        {/* جمع */}
        <section className="flex justify-end border-t pt-5">
          <dl className="w-full max-w-xs space-y-2 text-xs">
            <div className="flex justify-between">
              <dt className="muted">جمع کل</dt>
              <dd className="tabular">{formatToman(invoice.subtotal)}</dd>
            </div>
            {invoice.discount > 0 ? (
              <div className="flex justify-between text-emerald-600">
                <dt>تخفیف</dt>
                <dd className="tabular">− {formatToman(invoice.discount, { suffix: false })}</dd>
              </div>
            ) : null}
            {invoice.tax > 0 ? (
              <div className="flex justify-between">
                <dt className="muted">مالیات بر ارزش افزوده</dt>
                <dd className="tabular">{formatToman(invoice.tax)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t pt-2 text-sm font-extrabold">
              <dt>مبلغ قابل پرداخت</dt>
              <dd className="tabular">{formatToman(invoice.total)}</dd>
            </div>
          </dl>
        </section>

        {invoice.status === 'PAID' ? (
          <div className="mt-6 flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/8 px-4 py-3 text-xs text-emerald-700">
            <CheckCircle2 size={16} />
            این فاکتور در تاریخ {faDateTime(invoice.paidAt)} پرداخت شده است.
          </div>
        ) : null}

        {invoice.note ? <p className="mt-5 text-[11px] leading-6 muted">{invoice.note}</p> : null}

        <footer className="mt-8 border-t pt-4 text-center text-[10px] muted">
          این فاکتور به صورت الکترونیکی صادر شده و بدون مهر و امضا معتبر است.
        </footer>
      </Card>
    </>
  );
}

function Line({ label, value, ltr, full }: { label: string; value: string; ltr?: boolean; full?: boolean }) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <span className="muted">{label}: </span>
      <span className={ltr ? 'ltr inline-block' : ''}>{value}</span>
    </div>
  );
}
