'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { LayoutDashboard, FileText, Settings, RefreshCw, Target } from 'lucide-react';
import { Button, LoadingBlock, Tabs } from '@/components/ui';
import { fetcher } from '@/lib/client';
import { SeoDashboard } from './dashboard';
import { SeoPostsTable } from './posts-table';
import { SeoSettingsPanel } from './settings-panel';
import { SeoOpportunities } from './opportunities';
import type { SeoResponse } from './types';

type Tab = 'dashboard' | 'opportunities' | 'posts' | 'settings';
const TABS: Tab[] = ['dashboard', 'opportunities', 'posts', 'settings'];

/** چهار بخش: داشبورد سلامت و آمار، فرصت‌های صفحه اول، جدول سئوی مقاله‌ها، و تنظیمات */
export function SeoClient() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const { data, isLoading, mutate, isValidating } = useSWR<SeoResponse>('/api/admin/seo', fetcher, {
    revalidateOnFocus: false,
  });

  // لینک مستقیم به یک تب، مثل /admin/seo?tab=opportunities
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    if (wanted && TABS.includes(wanted)) setTab(wanted);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          tabs={[
            { id: 'dashboard', label: 'داشبورد سئو', icon: <LayoutDashboard size={14} /> },
            { id: 'opportunities', label: 'فرصت‌های صفحه اول', icon: <Target size={14} /> },
            { id: 'posts', label: 'سئوی مقاله‌ها', icon: <FileText size={14} /> },
            { id: 'settings', label: 'تنظیمات سئو', icon: <Settings size={14} /> },
          ]}
          active={tab}
          onChange={(id) => setTab(id as Tab)}
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
      ) : tab === 'opportunities' ? (
        <SeoOpportunities data={data} onRefresh={() => mutate()} />
      ) : (
        <SeoPostsTable data={data} onRefresh={() => mutate()} />
      )}
    </div>
  );
}
