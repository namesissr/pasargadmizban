import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { requireAdmin } from '@/lib/auth';
import { siteInfo } from '@/lib/seo';
import { PostEditor } from '../editor';

export const metadata: Metadata = { title: 'مقاله تازه' };
export const dynamic = 'force-dynamic';

export default async function NewPostPage() {
  await requireAdmin();
  const site = await siteInfo();

  return (
    <>
      <PageHeader
        title="مقاله تازه"
        description="عنوان و کلیدواژه هدف را مشخص کنید؛ بقیه چک‌لیست سئو همان‌جا راهنمایی‌تان می‌کند."
        breadcrumb={[
          { href: '/admin', label: 'مدیریت' },
          { href: '/admin/blog', label: 'وبلاگ' },
          { href: '/admin/blog/new', label: 'مقاله تازه' },
        ]}
      />
      <PostEditor siteUrl={site.siteUrl} />
    </>
  );
}
