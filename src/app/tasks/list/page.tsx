import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { Columns3, Plus } from 'lucide-react';
import { PageHeader } from '@/components/app/shell';
import { LoadingBlock } from '@/components/ui';
import { TaskList } from '../_components/task-list';

export const metadata: Metadata = { title: 'همه تسک‌ها' };
export const dynamic = 'force-dynamic';

export default function TasksPage() {
  return (
    <>
      <PageHeader
        title="همه تسک‌ها"
        breadcrumb={[{ href: '/tasks', label: 'پنل کارفرما' }]}
        description="کارها، باگ‌ها و درخواست‌های توسعه سایت — از ثبت تا تأیید نهایی، با یادآوری خودکار تا هیچ کاری فراموش نشود."
        action={
          <>
            <Link href="/tasks/board" className="btn btn-secondary btn-sm">
              <Columns3 size={15} /> تخته کانبان
            </Link>
            <Link href="/tasks/new" className="btn btn-primary btn-sm">
              <Plus size={15} /> تسک جدید
            </Link>
          </>
        }
      />
      <Suspense fallback={<LoadingBlock />}>
        <TaskList />
      </Suspense>
    </>
  );
}
