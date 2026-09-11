import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { NotificationSettingsClient } from './client';

export const metadata: Metadata = { title: 'اطلاع‌رسانی' };
export const dynamic = 'force-dynamic';

export default function NotificationSettingsPage() {
  return (
    <>
      <PageHeader
        title="اطلاع‌رسانی"
        description="تعیین کنید چه چیزی، چه زمانی و از کدام کانال به شما اطلاع داده شود."
        breadcrumb={[{ href: '/dashboard', label: 'داشبورد' }]}
      />
      <NotificationSettingsClient />
    </>
  );
}
