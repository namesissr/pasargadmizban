import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { ReferralsClient } from './client';

export const metadata: Metadata = { title: 'معرفی دوستان' };
export const dynamic = 'force-dynamic';

export default function ReferralsPage() {
  return (
    <>
      <PageHeader
        title="معرفی دوستان"
        description="از هر شارژی که دوستان شما انجام می‌دهند، درصدی به کیف پول شما اضافه می‌شود."
        breadcrumb={[{ href: '/dashboard', label: 'داشبورد' }]}
      />
      <ReferralsClient />
    </>
  );
}
