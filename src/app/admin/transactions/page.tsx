import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { AdminTransactions } from './table';

export const metadata: Metadata = { title: 'تراکنش‌ها' };
export const dynamic = 'force-dynamic';

export default function AdminTransactionsPage() {
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
