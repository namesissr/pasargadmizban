import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { Columns3 } from 'lucide-react';
import { PageHeader } from '@/components/app/shell';
import { LoadingBlock } from '@/components/ui';
import { TaskList } from '../../tasks/_components/task-list';

export const metadata: Metadata = { title: 'تسک‌های من' };
export const dynamic = 'force-dynamic';

export default function DevTasksPage() {
  return (
    <>
      <PageHeader
        title="تسک‌ها"
        description="کارهای سپرده به شما به ترتیب اهمیت؛ تسک‌های آزاد را هم می‌توانید بردارید."
        breadcrumb={[{ href: '/dev', label: 'پنل برنامه‌نویس' }]}
        action={
          <Link href="/dev/board" className="btn btn-secondary btn-sm">
            <Columns3 size={15} /> تخته کانبان
          </Link>
        }
      />
      <Suspense fallback={<LoadingBlock />}>
        <TaskList />
      </Suspense>
    </>
  );
}
