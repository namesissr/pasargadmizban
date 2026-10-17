import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { TaskGuide } from '../_components/guide';

export const metadata: Metadata = { title: 'راهنمای گردش کار تسک‌ها' };

export default function TaskGuidePage() {
  return (
    <>
      <PageHeader
        title="راهنمای گردش کار"
        description="هر تسک تا وقتی کارفرما تأییدش نکرده باز می‌ماند و سیستم مدام یادآوری می‌کند؛ پس هیچ کاری فراموش نمی‌شود."
        breadcrumb={[{ href: '/tasks', label: 'پنل کارفرما' }]}
      />
      <TaskGuide panel="employer" />
    </>
  );
}
