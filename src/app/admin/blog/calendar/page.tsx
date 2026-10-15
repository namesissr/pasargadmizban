import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { BlogNav } from '../nav';
import { CalendarPanel } from './calendar-panel';

export const metadata: Metadata = { title: 'تقویم انتشار' };
export const dynamic = 'force-dynamic';

export default function AdminBlogCalendarPage() {
  return (
    <>
      <PageHeader
        title="تقویم انتشار"
        description="نظم انتشار را ببینید: کدام روزها مقاله رفته، کدام روزها خالی مانده و چه چیزی در نوبت است."
        breadcrumb={[
          { href: '/admin', label: 'مدیریت' },
          { href: '/admin/blog', label: 'وبلاگ' },
          { href: '/admin/blog/calendar', label: 'تقویم انتشار' },
        ]}
      />
      <BlogNav />
      <CalendarPanel />
    </>
  );
}
