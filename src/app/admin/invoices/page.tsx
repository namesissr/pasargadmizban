import type { Metadata } from 'next';
import Link from 'next/link';
import prisma from '@/lib/prisma';
import { requireStaff } from '@/lib/auth';
import { Badge, Card, EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/app/shell';
import { formatToman, formatNumber } from '@/lib/money';
import { faDate, INVOICE_STATUS_FA } from '@/lib/utils';
import { Receipt } from 'lucide-react';

export const metadata: Metadata = { title: 'فاکتورها' };
export const dynamic = 'force-dynamic';

export default async function AdminInvoicesPage() {
  await requireStaff();

  const [invoices, totals] = await Promise.all([
    prisma.invoice.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        items: { select: { description: true } },
      },
    }),
    prisma.invoice.groupBy({ by: ['status'], _sum: { total: true }, _count: true }),
  ]);

  return (
    <>
      <PageHeader title="فاکتورها" description="فاکتورهای صادرشده برای تمدید سرویس‌ها." />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {totals.map((t) => {
          const st = INVOICE_STATUS_FA[t.status] ?? { label: t.status, tone: 'muted' as const };
          return (
            <div key={t.status} className="card p-4">
              <div className="text-xs muted">{st.label}</div>
              <div className="tabular mt-1.5 text-base font-bold">{formatToman(t._sum.total ?? 0n)}</div>
              <div className="mt-1 text-[11px] muted">{formatNumber(t._count)} فاکتور</div>
            </div>
          );
        })}
      </div>

      <Card bodyClassName={invoices.length ? 'p-0' : undefined}>
        {invoices.length === 0 ? (
          <EmptyState icon={<Receipt size={40} />} title="فاکتوری صادر نشده است" />
        ) : (
          <div className="scroll-x">
            <table className="table table-cards">
              <thead>
                <tr>
                  <th>شماره</th>
                  <th>کاربر</th>
                  <th>شرح</th>
                  <th>مبلغ</th>
                  <th>وضعیت</th>
                  <th>تاریخ</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const st = INVOICE_STATUS_FA[inv.status] ?? { label: inv.status, tone: 'muted' as const };
                  const name = [inv.user.firstName, inv.user.lastName].filter(Boolean).join(' ') || inv.user.email;
                  return (
                    <tr key={inv.id}>
                      <td data-label="شماره" className="tabular text-xs font-bold">
                        <Link
                          href={`/dashboard/invoices/${inv.id}`}
                          className="hover:text-[var(--color-brand-600)]"
                        >
                          {formatNumber(inv.number)}
                        </Link>
                      </td>
                      <td data-label="کاربر" className="max-w-40">
                        <Link
                          href={`/admin/users/${inv.user.id}`}
                          className="block truncate text-xs hover:text-[var(--color-brand-600)]"
                        >
                          {name}
                        </Link>
                        <div className="ltr truncate text-[10px] muted">{inv.user.email}</div>
                      </td>
                      <td data-label="شرح" className="max-w-sm truncate text-xs muted">{inv.items[0]?.description ?? '—'}</td>
                      <td data-label="مبلغ" className="tabular whitespace-nowrap text-xs font-bold">{formatToman(inv.total)}</td>
                      <td data-label="وضعیت">
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </td>
                      <td data-label="تاریخ" className="whitespace-nowrap text-xs muted">{faDate(inv.createdAt)}</td>
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
