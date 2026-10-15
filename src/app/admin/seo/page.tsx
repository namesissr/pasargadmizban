import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { SeoClient } from './client';

export const metadata: Metadata = { title: 'سئو و آمار' };
export const dynamic = 'force-dynamic';

export default function AdminSeoPage() {
  return (
    <>
      <PageHeader
        title="سئو و آمار"
        description="جایگاه سایت و هر مقاله در گوگل، سلامت سئوی سایت، و تنظیماتی که سرعت دیده شدن را بالا می‌برد."
        breadcrumb={[
          { href: '/admin', label: 'مدیریت' },
          { href: '/admin/seo', label: 'سئو و آمار' },
        ]}
      />
      <SeoClient />
    </>
  );
}
