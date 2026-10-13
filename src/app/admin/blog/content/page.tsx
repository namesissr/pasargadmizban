import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { BlogNav } from '../nav';
import { ContentPanel } from '../content-panel';

export const metadata: Metadata = { title: 'تولید خودکار محتوا' };
export const dynamic = 'force-dynamic';

export default function AdminBlogContentPage() {
  return (
    <>
      <PageHeader
        title="تولید خودکار محتوا"
        description="صف موضوع‌ها، مقاله‌های ساخته‌شده، مصرف توکن و افزودن کلیدواژه دلخواه به صف."
        breadcrumb={[
          { href: '/admin', label: 'مدیریت' },
          { href: '/admin/blog', label: 'وبلاگ' },
          { href: '/admin/blog/content', label: 'تولید خودکار' },
        ]}
      />
      <BlogNav />
      <ContentPanel />
    </>
  );
}
