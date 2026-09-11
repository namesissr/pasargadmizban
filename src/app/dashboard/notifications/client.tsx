'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { Bell, CheckCheck } from 'lucide-react';
import { Button, Card, EmptyState, LoadingBlock } from '@/components/ui';
import { apiPost } from '@/lib/client';
import { fetcher } from '@/lib/client';
import { faDateTime, faRelative, cn } from '@/lib/utils';

type Row = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

const DOT: Record<string, string> = {
  error: 'bg-red-500',
  warning: 'bg-amber-500',
  success: 'bg-emerald-500',
  info: 'bg-sky-500',
};

export function NotificationList() {
  const { data, isLoading, mutate } = useSWR<{ items: Row[]; unread: number }>(
    '/api/notifications?limit=50',
    fetcher,
  );

  async function markAll() {
    await apiPost('/api/notifications/read').catch(() => null);
    mutate();
  }

  if (isLoading && !data) return <LoadingBlock />;

  return (
    <Card
      title={data?.unread ? `${data.unread} اعلان خوانده‌نشده` : 'همه اعلان‌ها'}
      action={
        data?.unread ? (
          <Button variant="secondary" size="sm" onClick={markAll} icon={<CheckCheck size={14} />}>
            علامت‌گذاری همه به عنوان خوانده‌شده
          </Button>
        ) : null
      }
      bodyClassName={data?.items.length ? 'p-0' : undefined}
    >
      {!data?.items.length ? (
        <EmptyState icon={<Bell size={38} />} title="اعلانی ندارید" description="رویدادهای مهم اینجا نمایش داده می‌شود." />
      ) : (
        <ul>
          {data.items.map((n) => {
            const content = (
              <div
                className={cn(
                  'flex items-start gap-3 border-b px-4 py-3.5 transition last:border-b-0',
                  !n.readAt && 'bg-[var(--surface-2)]',
                  n.link && 'hover:bg-[color-mix(in_srgb,var(--color-brand-500)_6%,transparent)]',
                )}
              >
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', DOT[n.type] ?? DOT.info)} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold">{n.title}</div>
                  {n.body ? <p className="mt-1 text-[11px] leading-6 muted">{n.body}</p> : null}
                  <div className="mt-1.5 text-[10px] muted" title={faDateTime(n.createdAt)}>
                    {faRelative(n.createdAt)}
                  </div>
                </div>
              </div>
            );
            return (
              <li key={n.id}>{n.link ? <Link href={n.link}>{content}</Link> : content}</li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
