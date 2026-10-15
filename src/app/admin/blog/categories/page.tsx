import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { BlogNav } from '../nav';
import { CategoriesPanel } from '../categories-panel';

export const metadata: Metadata = { title: 'دسته‌های وبلاگ' };
export const dynamic = 'force-dynamic';

export default function AdminBlogCategoriesPage() {
  return (
    <>
      <PageHeader
        title="دسته‌های وبلاگ"
        description="ساختار موضوعی سایت. هر دسته یک صفحه مستقل و رتبه‌گیر است؛ عنوان و توضیح متای جداگانه برایش بنویسید."
        breadcrumb={[
          { href: '/admin', label: 'مدیریت' },
          { href: '/admin/blog', label: 'وبلاگ' },
          { href: '/admin/blog/categories', label: 'دسته‌ها' },
        ]}
      />
      <BlogNav />
      <CategoriesPanel />
    </>
  );
}
