import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/shell';
import { BlogNav } from '../nav';
import { ImagesPanel } from './images-panel';

export const metadata: Metadata = { title: 'تصاویر وبلاگ' };
export const dynamic = 'force-dynamic';

export default function AdminBlogImagesPage() {
  return (
    <>
      <PageHeader
        title="تصاویر و رسانه"
        description="همه تصاویر وبلاگ در یک فهرست: تصویرهای بی‌alt، مقاله‌های بی‌تصویر شاخص و فایل‌هایی که روی سرور دیگری میزبانی می‌شوند."
        breadcrumb={[
          { href: '/admin', label: 'مدیریت' },
          { href: '/admin/blog', label: 'وبلاگ' },
          { href: '/admin/blog/images', label: 'تصاویر' },
        ]}
      />
      <BlogNav />
      <ImagesPanel />
    </>
  );
}
