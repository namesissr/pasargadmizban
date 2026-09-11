import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { AdminTicketsTable } from './table';

export const metadata: Metadata = { title: 'تیکت‌ها' };
export const dynamic = 'force-dynamic';

export default function AdminTicketsPage() {
  return (
    <>
      <PageHeader title="تیکت‌های پشتیبانی" description="پاسخ‌گویی به درخواست‌های مشتریان." />
      <AdminTicketsTable />
    </>
  );
}
