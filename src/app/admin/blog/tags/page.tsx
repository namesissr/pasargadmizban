import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { BlogNav } from '../nav';
import { TagsPanel } from './tags-panel';

export const metadata: Metadata = { title: 'برچسب‌های وبلاگ' };
export const dynamic = 'force-dynamic';

export default function AdminBlogTagsPage() {
  return (
    <>
      <PageHeader
        title="برچسب‌ها"
        description="خوشه‌های موضوعی سایت. برچسب‌های هم‌معنا را ادغام کنید و برچسب‌های بی‌مقاله را پاک کنید."
        breadcrumb={[
          { href: '/admin', label: 'مدیریت' },
          { href: '/admin/blog', label: 'وبلاگ' },
          { href: '/admin/blog/tags', label: 'برچسب‌ها' },
        ]}
      />
      <BlogNav />
      <TagsPanel />
    </>
  );
}
