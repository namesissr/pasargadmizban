import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { AdminDashboard } from './dashboard';

export const metadata: Metadata = { title: 'پنل مدیریت' };
export const dynamic = 'force-dynamic';

export default function AdminHomePage() {
  return (
    <>
      <PageHeader
        title="داشبورد مدیریت"
        description="نمای کلی کسب‌وکار: کاربران، سرورها، درآمد و سلامت سیستم."
      />
      <AdminDashboard />
    </>
  );
}
