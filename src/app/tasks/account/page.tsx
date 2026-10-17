import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { Account } from '../_components/account';

export const metadata: Metadata = { title: 'حساب من' };
export const dynamic = 'force-dynamic';

export default function AccountPage() {
  return (
    <>
      <PageHeader
        title="حساب من و اعلان‌ها"
        description="اتصال تلگرام، کانال‌های اعلان تسک‌ها، نام و رمز عبور."
        breadcrumb={[{ href: '/tasks', label: 'پنل کارفرما' }]}
      />
      <Account />
    </>
  );
}
