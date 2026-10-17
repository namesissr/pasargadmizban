import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { Account } from '../../tasks/_components/account';

export const metadata: Metadata = { title: 'حساب من' };
export const dynamic = 'force-dynamic';

export default function DevAccountPage() {
  return (
    <>
      <PageHeader
        title="حساب من و اعلان‌ها"
        description="اتصال تلگرام، کانال‌های اعلان تسک‌ها، نام و رمز عبور."
        breadcrumb={[{ href: '/dev', label: 'پنل برنامه‌نویس' }]}
      />
      <Account />
    </>
  );
}
