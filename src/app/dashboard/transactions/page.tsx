import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { TransactionList } from './transaction-list';

export const metadata: Metadata = { title: 'تراکنش‌ها' };
export const dynamic = 'force-dynamic';

export default function TransactionsPage() {
  return (
    <>
      <PageHeader
        title="گردش حساب"
        description="تمام واریزها، کسرها و بازگشت وجه‌های کیف پول شما."
        breadcrumb={[{ href: '/dashboard', label: 'داشبورد' }]}
      />
      <TransactionList />
    </>
  );
}
