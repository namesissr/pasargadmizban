import type { Metadata } from 'next';
import Link from 'next/link';
import { Columns3, Plus } from 'lucide-react';
import { PageHeader } from '@/components/app/shell';
import { EmployerHome } from './_components/employer-home';

export const metadata: Metadata = { title: 'داشبورد کارفرما' };
export const dynamic = 'force-dynamic';

export default function EmployerHomePage() {
  return (
    <>
      <PageHeader
        title="داشبورد کارفرما"
        description="کارهایی که منتظر شماست، وضعیت تیم برنامه‌نویسان و آخرین اتفاق‌ها — یک نگاه تا هیچ کاری معطل نماند."
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
      <EmployerHome />
    </>
  );
}
