import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { requireFullPanel } from '@/lib/panel-mode';
import { IpHealthClient } from './client';

export const metadata: Metadata = { title: 'سلامت آدرس‌ها' };
export const dynamic = 'force-dynamic';

export default async function AdminIpHealthPage() {
  // روی نصب «فقط وبلاگ» این بخش وجود ندارد
  await requireFullPanel();
  return (
    <>
      <PageHeader
        title="سلامت آدرس‌ها"
        description="پنل آدرس هر سرور تازه را از داخل ایران آزمایش می‌کند و اگر باز نشود، پیش از تحویل به مشتری رایگان عوضش می‌کند. آنچه یاد می‌گیرد اینجا جمع می‌شود."
        breadcrumb={[
          { href: '/admin', label: 'مدیریت' },
          { href: '/admin/ip-health', label: 'سلامت آدرس‌ها' },
        ]}
      />
      <IpHealthClient />
    </>
  );
}
