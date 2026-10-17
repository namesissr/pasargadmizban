import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { Worklog } from '../_components/worklog';

export const metadata: Metadata = { title: 'کارکرد و ساعت‌ها' };
export const dynamic = 'force-dynamic';

export default function WorklogPage() {
  return (
    <>
      <PageHeader
        title="کارکرد و ساعت‌ها"
        description="ساعت‌های کاری ثبت‌شده هر برنامه‌نویس روی هر تسک — برای پیگیری و تسویه حساب. خروجی اکسل هم دارد."
        breadcrumb={[{ href: '/tasks', label: 'پنل کارفرما' }]}
      />
      <Worklog />
    </>
  );
}
