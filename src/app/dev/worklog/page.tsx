import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { Worklog } from '../../tasks/_components/worklog';

export const metadata: Metadata = { title: 'کارکرد من' };
export const dynamic = 'force-dynamic';

export default function DevWorklogPage() {
  return (
    <>
      <PageHeader
        title="کارکرد من"
        description="ساعت‌هایی که روی تسک‌ها ثبت کرده‌اید — با زمان‌سنج یا دستی. کارفرماها همین گزارش را می‌بینند."
        breadcrumb={[{ href: '/dev', label: 'پنل برنامه‌نویس' }]}
      />
      <Worklog />
    </>
  );
}
