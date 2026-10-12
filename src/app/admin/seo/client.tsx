'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { LayoutDashboard, FileText, Settings, RefreshCw } from 'lucide-react';
import { Button, LoadingBlock, Tabs } from '@/components/ui';
import { fetcher } from '@/lib/client';
import { SeoDashboard } from './dashboard';
import { SeoPostsTable } from './posts-table';
import { SeoSettingsPanel } from './settings-panel';
import type { SeoResponse } from './types';

/** سه بخش: داشبورد سلامت و آمار، جدول سئوی مقاله‌ها، و تنظیمات */
export function SeoClient() {
  const [tab, setTab] = useState<'dashboard' | 'posts' | 'settings'>('dashboard');
  const { data, isLoading, mutate, isValidating } = useSWR<SeoResponse>('/api/admin/seo', fetcher, {
    revalidateOnFocus: false,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          tabs={[
            { id: 'dashboard', label: 'داشبورد سئو', icon: <LayoutDashboard size={14} /> },
            { id: 'posts', label: 'سئوی مقاله‌ها', icon: <FileText size={14} /> },
            { id: 'settings', label: 'تنظیمات سئو', icon: <Settings size={14} /> },
          ]}
          active={tab}
          onChange={(id) => setTab(id as 'dashboard' | 'posts' | 'settings')}
          className="flex-1"
        />
        {tab !== 'settings' ? (
          <Button variant="ghost" size="sm" icon={<RefreshCw size={14} />} loading={isValidating} onClick={() => mutate()}>
            تازه‌سازی
          </Button>
        ) : null}
      </div>

      {tab === 'settings' ? (
        <SeoSettingsPanel />
      ) : isLoading || !data ? (
        <LoadingBlock label="در حال خواندن داده‌های سئو…" />
      ) : tab === 'dashboard' ? (
        <SeoDashboard data={data} />
      ) : (
        <SeoPostsTable data={data} />
      )}
    </div>
  );
}
