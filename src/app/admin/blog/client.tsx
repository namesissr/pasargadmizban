'use client';

import { useState } from 'react';
import { FileText, FolderTree, Settings } from 'lucide-react';
import { Tabs } from '@/components/ui';
import { PostsList } from './posts-list';
import { CategoriesPanel } from './categories-panel';
import { SeoSettings } from './seo-settings';

/** سه بخش مدیریت وبلاگ: مقاله‌ها، دسته‌ها و تنظیمات سئو */
export function BlogAdminClient() {
  const [tab, setTab] = useState<'posts' | 'categories' | 'seo'>('posts');

  return (
    <div className="space-y-4">
      <Tabs
        tabs={[
          { id: 'posts', label: 'مقاله‌ها', icon: <FileText size={14} /> },
          { id: 'categories', label: 'دسته‌ها', icon: <FolderTree size={14} /> },
          { id: 'seo', label: 'تنظیمات سئو', icon: <Settings size={14} /> },
        ]}
        active={tab}
        onChange={(id) => setTab(id as 'posts' | 'categories' | 'seo')}
      />

      {tab === 'posts' ? <PostsList /> : tab === 'categories' ? <CategoriesPanel /> : <SeoSettings />}
    </div>
  );
}
