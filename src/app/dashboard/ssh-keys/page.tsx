import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { SshKeysClient } from './client';

export const metadata: Metadata = { title: 'کلیدهای SSH' };
export const dynamic = 'force-dynamic';

export default function SshKeysPage() {
  return (
    <>
      <PageHeader
        title="کلیدهای SSH"
        description="با افزودن کلید عمومی، می‌توانید بدون رمز عبور و با امنیت بیشتر به سرورها وصل شوید."
        breadcrumb={[{ href: '/dashboard', label: 'داشبورد' }]}
      />
      <SshKeysClient />
    </>
  );
}
