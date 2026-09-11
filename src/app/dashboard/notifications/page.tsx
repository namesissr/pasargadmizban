import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { NotificationList } from './client';

export const metadata: Metadata = { title: 'اعلان‌ها' };
export const dynamic = 'force-dynamic';

export default function NotificationsPage() {
  return (
    <>
      <PageHeader
        title="اعلان‌ها"
        description="رویدادهای مهم حساب، سرورها و صورتحساب شما."
        breadcrumb={[{ href: '/dashboard', label: 'داشبورد' }]}
      />
      <NotificationList />
    </>
  );
}
