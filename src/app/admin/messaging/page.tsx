import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { MessagingClient } from './client';

export const metadata: Metadata = { title: 'ایمیل و پیامک' };
export const dynamic = 'force-dynamic';

export default function AdminMessagingPage() {
  return (
    <>
      <PageHeader
        title="ایمیل و پیامک"
        description="اتصال به سرور ایمیل را همین‌جا تنظیم و آزمایش کنید و ببینید چه ایمیل‌هایی برای چه کسانی رفته است."
        breadcrumb={[
          { href: '/admin', label: 'مدیریت' },
          { href: '/admin/messaging', label: 'ایمیل و پیامک' },
        ]}
      />
      <MessagingClient />
    </>
  );
}
