import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { AdminServersTable } from './table';

export const metadata: Metadata = { title: 'سرورها' };
export const dynamic = 'force-dynamic';

export default function AdminServersPage() {
  return (
    <>
      <PageHeader title="سرورها" description="تمام سرورهای ساخته‌شده در سیستم، وضعیت و مالک آن‌ها." />
      <AdminServersTable />
    </>
  );
}
