import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/app/shell';
import { LoadingBlock } from '@/components/ui';
import { TaskBoard } from '../../tasks/_components/task-board';

export const metadata: Metadata = { title: 'تخته کانبان' };
export const dynamic = 'force-dynamic';

export default function DevBoardPage() {
  return (
    <>
      <PageHeader
        title="تخته کانبان"
        description="کارت‌های خودتان را بین ستون‌ها بکشید تا وضعیت عوض شود."
        breadcrumb={[{ href: '/dev', label: 'پنل برنامه‌نویس' }]}
      />
      <Suspense fallback={<LoadingBlock />}>
        <TaskBoard />
      </Suspense>
    </>
  );
}
