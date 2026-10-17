import type { Metadata } from 'next';
import Link from 'next/link';
import { ListChecks } from 'lucide-react';
import { PageHeader } from '@/components/app/shell';
import { getCurrentUser } from '@/lib/auth';
import { DeveloperHome } from '../tasks/_components/developer-home';

export const metadata: Metadata = { title: 'میز کار من' };
export const dynamic = 'force-dynamic';

export default async function DeveloperHomePage() {
  const user = await getCurrentUser();
  const name = user?.firstName ? `${user.firstName} عزیز، ` : '';
  return (
    <>
      <PageHeader
        title="میز کار من"
        description={`${name}کار بعدی، کارهای برگشتی و تسک‌های آزاد اینجاست. قبل از شروع هر کار زمان‌سنج را روشن کنید تا کارکردتان ثبت شود.`}
        action={
          <Link href="/dev/tasks" className="btn btn-secondary btn-sm">
            <ListChecks size={15} /> همه تسک‌های من
          </Link>
        }
      />
      <DeveloperHome />
    </>
  );
}
