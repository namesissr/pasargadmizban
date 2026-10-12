'use client';

import { useState } from 'react';
import { FileText, FolderTree, Settings, Bot } from 'lucide-react';
import { Tabs } from '@/components/ui';
import { PostsList } from './posts-list';
import { CategoriesPanel } from './categories-panel';
import { SeoSettings } from './seo-settings';
import { ContentPanel } from './content-panel';

/** چهار بخش مدیریت وبلاگ: مقاله‌ها، دسته‌ها، تولید خودکار و تنظیمات سئو */
export function BlogAdminClient() {
  const [tab, setTab] = useState<'posts' | 'categories' | 'content' | 'seo'>('posts');

  return (
    <div className="space-y-4">
      <Tabs
        tabs={[
          { id: 'posts', label: 'مقاله‌ها', icon: <FileText size={14} /> },
          { id: 'categories', label: 'دسته‌ها', icon: <FolderTree size={14} /> },
          { id: 'content', label: 'تولید خودکار', icon: <Bot size={14} /> },
          { id: 'seo', label: 'تنظیمات سئو', icon: <Settings size={14} /> },
        ]}
        active={tab}
        onChange={(id) => setTab(id as 'posts' | 'categories' | 'content' | 'seo')}
      />

      {tab === 'posts' ? (
        <PostsList />
      ) : tab === 'categories' ? (
        <CategoriesPanel />
      ) : tab === 'content' ? (
        <ContentPanel />
      ) : (
        <SeoSettings />
      )}
    </div>
  );
}
