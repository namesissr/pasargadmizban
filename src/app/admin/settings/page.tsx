import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { isBlogPanel, panelModeLocked } from '@/lib/panel-mode';
import { SettingsClient } from './client';
import { BlogSettingsClient } from './blog-settings';

export const metadata: Metadata = { title: 'تنظیمات' };
export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  // نصب «فقط وبلاگ» نسخه کوتاه‌شده این صفحه را می‌بیند
  if (await isBlogPanel()) {
    return (
      <>
        <PageHeader
          title="تنظیمات"
          description="حالت پنل، نمایش وبلاگ، ثبت‌نام، حالت تعمیر و اطلاعات برند."
          breadcrumb={[
            { href: '/admin', label: 'مدیریت' },
            { href: '/admin/settings', label: 'تنظیمات' },
          ]}
        />
        <BlogSettingsClient modeLocked={panelModeLocked()} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="تنظیمات سیستم" description="پیکربندی درگاه‌ها، چرخه سرویس، ثبت‌نام و اطلاعات برند." />
      <SettingsClient />
    </>
  );
}
