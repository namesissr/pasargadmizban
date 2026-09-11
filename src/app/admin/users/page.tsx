import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { UsersTable } from './table';

export const metadata: Metadata = { title: 'کاربران' };
export const dynamic = 'force-dynamic';

export default function AdminUsersPage() {
  return (
    <>
      <PageHeader title="کاربران" description="مدیریت حساب‌ها، سطح دسترسی، تخفیف و موجودی." />
      <UsersTable />
    </>
  );
}
