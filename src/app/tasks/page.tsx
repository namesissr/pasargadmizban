import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { Columns3, Plus } from 'lucide-react';
import { PageHeader } from '@/components/app/shell';
import { LoadingBlock } from '@/components/ui';
import { TaskList } from './task-list';

export const metadata: Metadata = { title: 'میز کار تسک‌ها' };
export const dynamic = 'force-dynamic';

export default function TasksPage() {
  return (
    <>
      <PageHeader
        title="میز کار تسک‌ها"
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
