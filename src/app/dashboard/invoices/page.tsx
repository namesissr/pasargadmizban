import type { Metadata } from 'next';
import Link from 'next/link';
import { Receipt } from 'lucide-react';
import prisma from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { Badge, Card, EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/app/shell';
import { formatToman, formatNumber } from '@/lib/money';
import { faDate, INVOICE_STATUS_FA } from '@/lib/utils';

export const metadata: Metadata = { title: 'فاکتورها' };
export const dynamic = 'force-dynamic';

export default async function InvoicesPage() {
  const user = await requireUser();

  const [invoices, unpaid] = await Promise.all([
    prisma.invoice.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { items: { select: { description: true } } },
    }),
    prisma.invoice.aggregate({
      where: { userId: user.id, status: 'UNPAID' },
      _sum: { total: true },
      _count: true,
    }),
  ]);

  return (
    <>
      <PageHeader
        title="فاکتورها"
        description="فاکتورهای صادرشده برای تمدید سرویس‌ها و خدمات اضافه."
        breadcrumb={[{ href: '/dashboard', label: 'داشبورد' }]}
      />

      {unpaid._count > 0 ? (
        <div className="mb-5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs leading-6 text-amber-700">
          <b>{formatNumber(unpaid._count)} فاکتور پرداخت‌نشده</b> به مبلغ کل{' '}
          {formatToman(unpaid._sum.total ?? 0n)} دارید.
        </div>
      ) : null}

      <Card bodyClassName={invoices.length ? 'p-0' : undefined}>
        {invoices.length === 0 ? (
          <EmptyState
            icon={<Receipt size={40} />}
            title="فاکتوری صادر نشده است"
            description="برای سرورهای ساعتی فاکتور جداگانه صادر نمی‌شود و هزینه مستقیماً از کیف پول کسر می‌گردد."
          />
        ) : (
          <div className="scroll-x">
            <table className="table table-cards">
              <thead>
                <tr>
                  <th>شماره</th>
                  <th>شرح</th>
                  <th>مبلغ</th>
                  <th>وضعیت</th>
                  <th>تاریخ صدور</th>
                  <th className="text-left">مشاهده</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const st = INVOICE_STATUS_FA[inv.status] ?? { label: inv.status, tone: 'muted' as const };
                  return (
                    <tr key={inv.id}>
                      <td data-label="شماره" className="tabular text-xs font-bold">{formatNumber(inv.number)}</td>
                      <td data-label="شرح" className="max-w-sm truncate text-xs">
                        {inv.items[0]?.description ?? '—'}
                        {inv.items.length > 1 ? ` و ${formatNumber(inv.items.length - 1)} مورد دیگر` : ''}
                      </td>
                      <td data-label="مبلغ" className="tabular whitespace-nowrap text-xs font-bold">{formatToman(inv.total)}</td>
                      <td data-label="وضعیت">
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </td>
                      <td data-label="تاریخ صدور" className="whitespace-nowrap text-xs muted">{faDate(inv.createdAt)}</td>
                      <td data-label="مشاهده" className="text-left">
                        <Link
                          href={`/dashboard/invoices/${inv.id}`}
                          className="text-xs text-[var(--color-brand-600)] hover:underline"
                        >
                          جزئیات
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
