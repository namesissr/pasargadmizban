import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { CatalogClient } from './client';

export const metadata: Metadata = { title: 'کاتالوگ هتزنر' };
export const dynamic = 'force-dynamic';

export default function AdminCatalogPage() {
  return (
    <>
      <PageHeader
        title="کاتالوگ هتزنر"
        description="همگام‌سازی پلن‌ها، لوکیشن‌ها و سیستم‌عامل‌ها و انتخاب اینکه کدام‌یک به مشتریان نمایش داده شود."
      />
      <CatalogClient />
    </>
  );
}
