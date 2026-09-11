import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { AnnouncementsClient } from './client';

export const metadata: Metadata = { title: 'اعلان‌های سایت' };
export const dynamic = 'force-dynamic';

export default function AdminAnnouncementsPage() {
  return (
    <>
      <PageHeader
        title="اعلان‌های سایت"
        description="پیام‌هایی که بالای داشبورد همه کاربران نمایش داده می‌شود؛ مناسب اطلاع‌رسانی قطعی، تخفیف یا تغییرات سرویس."
        breadcrumb={[
          { href: '/admin', label: 'مدیریت' },
          { href: '/admin/announcements', label: 'اعلان‌ها' },
        ]}
      />
      <AnnouncementsClient />
    </>
  );
}
