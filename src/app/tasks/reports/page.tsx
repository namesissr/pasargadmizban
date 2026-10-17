import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { TaskReports } from '../_components/task-reports';

export const metadata: Metadata = { title: 'گزارش عملکرد تسک‌ها' };
export const dynamic = 'force-dynamic';

export default function TaskReportsPage() {
  return (
    <>
      <PageHeader
        title="گزارش عملکرد"
        description="حجم کار باز، سرعت انجام، دقت در مهلت‌ها و سهم هر نفر — برای اینکه بدانید کارها کجا گیر کرده‌اند."
        breadcrumb={[{ href: '/tasks', label: 'پنل کارفرما' }]}
      />
      <TaskReports />
    </>
  );
}
