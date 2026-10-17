import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { TeamView } from '../_components/team';

export const metadata: Metadata = { title: 'تیم برنامه‌نویسان' };
export const dynamic = 'force-dynamic';

export default function TeamPage() {
  return (
    <>
      <PageHeader
        title="تیم برنامه‌نویسان"
        description="بار کاری، کارکرد و کیفیت کار هر برنامه‌نویس — تا بدانید تسک بعدی را به چه کسی بسپارید."
        breadcrumb={[{ href: '/tasks', label: 'پنل کارفرما' }]}
      />
      <TeamView />
    </>
  );
}
