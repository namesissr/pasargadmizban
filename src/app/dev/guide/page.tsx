import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { TaskGuide } from '../../tasks/_components/guide';

export const metadata: Metadata = { title: 'راهنمای گردش کار تسک‌ها' };

export default function TaskGuidePage() {
  return (
    <>
      <PageHeader
        title="راهنمای گردش کار"
        description="هر تسک تا وقتی کارفرما تأییدش نکرده باز می‌ماند و سیستم مدام یادآوری می‌کند؛ پس هیچ کاری فراموش نمی‌شود."
        breadcrumb={[{ href: '/dev', label: 'پنل برنامه‌نویس' }]}
      />
      <TaskGuide panel="developer" />
    </>
  );
}
