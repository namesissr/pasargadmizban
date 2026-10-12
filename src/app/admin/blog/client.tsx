'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText, FolderTree, Bot, TrendingUp } from 'lucide-react';
import { Tabs } from '@/components/ui';
import { PostsList } from './posts-list';
import { CategoriesPanel } from './categories-panel';
import { ContentPanel } from './content-panel';

/**
 * سه بخش مدیریت وبلاگ: مقاله‌ها، دسته‌ها و تولید خودکار.
 * تنظیمات و آمار سئو جای خودش را دارد: /admin/seo
 */
export function BlogAdminClient() {
  const [tab, setTab] = useState<'posts' | 'categories' | 'content'>('posts');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          tabs={[
            { id: 'posts', label: 'مقاله‌ها', icon: <FileText size={14} /> },
            { id: 'categories', label: 'دسته‌ها', icon: <FolderTree size={14} /> },
            { id: 'content', label: 'تولید خودکار', icon: <Bot size={14} /> },
          ]}
          active={tab}
          onChange={(id) => setTab(id as 'posts' | 'categories' | 'content')}
          className="flex-1"
        />
        <Link href="/admin/seo" className="btn btn-ghost btn-sm">
          <TrendingUp size={14} /> سئو و آمار
        </Link>
      </div>

      {tab === 'posts' ? <PostsList /> : tab === 'categories' ? <CategoriesPanel /> : <ContentPanel />}
    </div>
  );
}
