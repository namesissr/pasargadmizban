import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { GatewaysClient } from './client';

export const metadata: Metadata = { title: 'درگاه‌ها' };
export const dynamic = 'force-dynamic';

export default function AdminGatewaysPage() {
  return (
    <>
      <PageHeader
        title="درگاه‌های پرداخت"
        description="اتصال، فعال‌سازی و گزارش درگاه‌های پرداخت (زیبال، بیت‌پی و واریز کارت‌به‌کارت) را از این‌جا مدیریت کنید."
        breadcrumb={[
          { href: '/admin', label: 'مدیریت' },
          { href: '/admin/gateways', label: 'درگاه‌ها' },
        ]}
      />
      <GatewaysClient />
    </>
  );
}
