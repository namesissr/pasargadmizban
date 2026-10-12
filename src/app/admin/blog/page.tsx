import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { BlogAdminClient } from './client';

export const metadata: Metadata = { title: 'وبلاگ' };
export const dynamic = 'force-dynamic';

export default function AdminBlogPage() {
  return (
    <>
      <PageHeader
        title="وبلاگ"
        description="مقاله بنویسید، امتیاز سئوی هر مقاله را پیش از انتشار ببینید و ساختار موضوعی سایت را بچینید."
        breadcrumb={[
          { href: '/admin', label: 'مدیریت' },
          { href: '/admin/blog', label: 'وبلاگ' },
        ]}
      />
      <BlogAdminClient />
    </>
  );
}
