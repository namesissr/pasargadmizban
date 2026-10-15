import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { BlogNav } from '../nav';
import { RedirectsPanel } from './redirects-panel';

export const metadata: Metadata = { title: 'ریدایرکت‌های وبلاگ' };
export const dynamic = 'force-dynamic';

export default function AdminBlogRedirectsPage() {
  return (
    <>
      <PageHeader
        title="ریدایرکت‌ها"
        description="نشانی‌های قدیمی مقاله‌ها و مقصد تازه‌شان. از همین‌جا می‌توانید نشانی‌های سایت قبلی را هم به مقاله‌های فعلی وصل کنید."
        breadcrumb={[
          { href: '/admin', label: 'مدیریت' },
          { href: '/admin/blog', label: 'وبلاگ' },
          { href: '/admin/blog/redirects', label: 'ریدایرکت‌ها' },
        ]}
      />
      <BlogNav />
      <RedirectsPanel />
    </>
  );
}
