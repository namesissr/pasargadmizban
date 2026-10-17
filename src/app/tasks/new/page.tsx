import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { TaskForm } from '../_components/task-form';

export const metadata: Metadata = { title: 'ثبت تسک جدید' };
export const dynamic = 'force-dynamic';

export default function NewTaskPage() {
  return (
    <>
      <PageHeader
        title="ثبت تسک جدید"
        description="باگ، قابلیت جدید یا هر کاری که برنامه‌نویس باید انجام دهد را با جزئیات بنویسید. پس از ثبت، مسئول از طریق پنل، تلگرام و ایمیل باخبر می‌شود."
        breadcrumb={[{ href: '/tasks', label: 'میز کار تسک‌ها' }]}
      />
      <TaskForm />
    </>
  );
}
