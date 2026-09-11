import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { LogsClient } from './client';

export const metadata: Metadata = { title: 'گزارش رویدادها' };
export const dynamic = 'force-dynamic';

export default function AdminLogsPage() {
  return (
    <>
      <PageHeader
        title="گزارش رویدادها"
        description="دفتر ممیزی تمام اقدامات مهم کاربران، کارکنان و سیستم."
      />
      <LogsClient />
    </>
  );
}
