import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { Members } from '../_components/members';

export const metadata: Metadata = { title: 'اعضای تیم و نقش‌ها' };
export const dynamic = 'force-dynamic';

export default function MembersPage() {
  return (
    <>
      <PageHeader
        title="اعضای تیم و نقش‌ها"
        description="کارفرماها و برنامه‌نویس‌ها را اینجا تعیین کنید. هر کس ثبت‌نام کند تا وقتی نقش نگرفته به میز کار دسترسی ندارد."
        breadcrumb={[{ href: '/tasks', label: 'پنل کارفرما' }]}
      />
      <Members />
    </>
  );
}
