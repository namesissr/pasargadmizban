import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { ListChecks, Plus } from 'lucide-react';
import { PageHeader } from '@/components/app/shell';
import { LoadingBlock } from '@/components/ui';
import { TaskBoard } from '../_components/task-board';

export const metadata: Metadata = { title: 'تخته کانبان' };
export const dynamic = 'force-dynamic';

export default function TaskBoardPage() {
  return (
    <>
      <PageHeader
        title="تخته کانبان"
        description="نمای کلی همه کارها بر اساس وضعیت."
        breadcrumb={[{ href: '/tasks', label: 'پنل کارفرما' }]}
        action={
          <>
            <Link href="/tasks/list" className="btn btn-secondary btn-sm">
              <ListChecks size={15} /> نمای فهرست
            </Link>
            <Link href="/tasks/new" className="btn btn-primary btn-sm">
              <Plus size={15} /> تسک جدید
            </Link>
          </>
        }
      />
      <Suspense fallback={<LoadingBlock />}>
        <TaskBoard />
      </Suspense>
    </>
  );
}
