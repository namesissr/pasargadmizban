import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { requireFullPanel } from '@/lib/panel-mode';
import { AdminServersTable } from './table';

export const metadata: Metadata = { title: 'سرورها' };
export const dynamic = 'force-dynamic';

export default async function AdminServersPage() {
  // روی نصب «فقط وبلاگ» این بخش وجود ندارد
  await requireFullPanel();
  return (
    <>
      <PageHeader title="سرورها" description="تمام سرورهای ساخته‌شده در سیستم، وضعیت و مالک آن‌ها." />
      <AdminServersTable />
    </>
  );
}
