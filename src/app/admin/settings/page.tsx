import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { SettingsClient } from './client';

export const metadata: Metadata = { title: 'تنظیمات' };
export const dynamic = 'force-dynamic';

export default function AdminSettingsPage() {
  return (
    <>
      <PageHeader title="تنظیمات سیستم" description="پیکربندی درگاه‌ها، چرخه سرویس، ثبت‌نام و اطلاعات برند." />
      <SettingsClient />
    </>
  );
}
