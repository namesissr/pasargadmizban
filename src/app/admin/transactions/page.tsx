import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { requireFullPanel } from '@/lib/panel-mode';
import { AdminTransactions } from './table';

export const metadata: Metadata = { title: 'تراکنش‌ها' };
export const dynamic = 'force-dynamic';

export default async function AdminTransactionsPage() {
  // روی نصب «فقط وبلاگ» این بخش وجود ندارد
  await requireFullPanel();
  return (
    <>
      <PageHeader
        title="تراکنش‌ها"
        description="تایید واریزهای دستی، بررسی پرداخت‌های ناموفق و مشاهده گردش مالی کل سیستم."
      />
      <AdminTransactions />
    </>
  );
}
