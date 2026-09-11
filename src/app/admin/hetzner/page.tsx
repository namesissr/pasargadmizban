import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { HetznerAccountsClient } from './client';

export const metadata: Metadata = { title: 'حساب‌های هتزنر' };
export const dynamic = 'force-dynamic';

export default function AdminHetznerPage() {
  return (
    <>
      <PageHeader
        title="حساب‌های هتزنر"
        description="هر تعداد حساب Hetzner Cloud که بخواهید اینجا اضافه کنید. هنگام ساخت سرور، پنل حساب‌ها را به ترتیب اولویت امتحان می‌کند و به محض پر شدن ظرفیت یکی، خودکار سراغ حساب بعدی می‌رود."
        breadcrumb={[
          { href: '/admin', label: 'مدیریت' },
          { href: '/admin/hetzner', label: 'حساب‌های هتزنر' },
        ]}
      />
      <HetznerAccountsClient />
    </>
  );
}
