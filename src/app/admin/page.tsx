import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { isBlogPanel } from '@/lib/panel-mode';
import { AdminDashboard } from './dashboard';
import { BlogDashboard } from './blog-dashboard';

export const metadata: Metadata = { title: 'پنل مدیریت' };
export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  // روی نصب «فقط وبلاگ» داشبورد سرور و مالی جایی ندارد
  if (await isBlogPanel()) {
    return (
      <>
        <PageHeader
          title="داشبورد وبلاگ"
          description="نمای کلی وبلاگ: انتشار، بازدید، وضعیت خط تولید محتوا و سلامت سئو."
        />
        <BlogDashboard />
      </>
    );
  }

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
