import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { requireFullPanel } from '@/lib/panel-mode';
import { PromosClient } from './client';

export const metadata: Metadata = { title: 'کدهای هدیه و تخفیف' };
export const dynamic = 'force-dynamic';

export default async function AdminPromosPage() {
  // روی نصب «فقط وبلاگ» این بخش وجود ندارد
  await requireFullPanel();
  return (
    <>
      <PageHeader
        title="کدهای هدیه و تخفیف"
        description="کد بسازید و در کانال تلگرام یا کمپین‌ها پخش کنید؛ کاربر با کد هدیه اعتبار فوری می‌گیرد و با کد شارژ بیشتر، درصدی اضافه بر شارژش هدیه می‌گیرد."
        breadcrumb={[
          { href: '/admin', label: 'مدیریت' },
          { href: '/admin/promos', label: 'کدها' },
        ]}
      />
      <PromosClient />
    </>
  );
}
