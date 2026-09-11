import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { PricingClient } from './client';

export const metadata: Metadata = { title: 'قیمت‌گذاری' };
export const dynamic = 'force-dynamic';

export default function AdminPricingPage() {
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
