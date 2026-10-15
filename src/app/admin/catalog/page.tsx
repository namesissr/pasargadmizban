import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { requireFullPanel } from '@/lib/panel-mode';
import { CatalogClient } from './client';

export const metadata: Metadata = { title: 'کاتالوگ هتزنر' };
export const dynamic = 'force-dynamic';

export default async function AdminCatalogPage() {
  // روی نصب «فقط وبلاگ» این بخش وجود ندارد
  await requireFullPanel();
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
