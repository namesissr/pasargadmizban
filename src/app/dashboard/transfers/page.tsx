import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { TransfersClient } from './client';

export const metadata: Metadata = { title: 'انتقال سرور' };
export const dynamic = 'force-dynamic';

export default function TransfersPage() {
  return (
    <>
      <PageHeader
        title="انتقال سرور"
        description="درخواست‌های انتقال سروری که برای شما ارسال شده یا شما ارسال کرده‌اید را اینجا مدیریت کنید."
        breadcrumb={[{ href: '/dashboard', label: 'داشبورد' }]}
      />
      <TransfersClient />
    </>
  );
}
