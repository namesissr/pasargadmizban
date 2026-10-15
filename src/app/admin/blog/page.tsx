import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/app/shell';
import { BlogNav } from './nav';
import { PostsList } from './posts-list';

export const metadata: Metadata = { title: 'مقاله‌ها' };
export const dynamic = 'force-dynamic';

export default function AdminBlogPage() {
  return (
    <>
      <PageHeader
        title="مقاله‌ها"
        description="مقاله بنویسید، امتیاز سئوی هر مقاله را پیش از انتشار ببینید و با عملیات گروهی چند مقاله را یک‌جا جابه‌جا کنید."
        breadcrumb={[
          { href: '/admin', label: 'مدیریت' },
          { href: '/admin/blog', label: 'وبلاگ' },
        ]}
        action={
          <Link href="/admin/blog/new" className="btn btn-primary btn-sm">
            <Plus size={14} /> مقاله جدید
          </Link>
        }
      />
      <BlogNav />
      <PostsList />
    </>
  );
}
