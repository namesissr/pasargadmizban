import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { requireFullPanel } from '@/lib/panel-mode';
import { PricingClient } from './client';

export const metadata: Metadata = { title: 'قیمت‌گذاری' };
export const dynamic = 'force-dynamic';

export default async function AdminPricingPage() {
  // روی نصب «فقط وبلاگ» این بخش وجود ندارد
  await requireFullPanel();
  return (
    <>
      <PageHeader
        title="قیمت‌گذاری"
        description="نرخ یورو، درصد سود و قوانین اختصاصی قیمت برای پلن‌ها، لوکیشن‌ها و کاربران."
      />
      <PricingClient />
    </>
  );
}
