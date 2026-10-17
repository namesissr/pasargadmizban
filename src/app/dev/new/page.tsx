import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { TaskForm } from '../../tasks/_components/task-form';

export const metadata: Metadata = { title: 'گزارش باگ یا پیشنهاد' };
export const dynamic = 'force-dynamic';

export default function DevNewTaskPage() {
  return (
    <>
      <PageHeader
        title="گزارش باگ یا پیشنهاد"
        description="باگی دیدید یا کاری لازم است که در فهرست نیست؟ اینجا ثبت کنید تا کارفرماها باخبر شوند. به‌طور پیش‌فرض خودتان مسئول آن هستید."
        breadcrumb={[{ href: '/dev', label: 'پنل برنامه‌نویس' }]}
      />
      <TaskForm />
    </>
  );
}
