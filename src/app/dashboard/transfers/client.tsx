'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Check, X, Send, Inbox, Server as ServerIcon } from 'lucide-react';
import { Alert, Badge, Button, Card, LoadingBlock } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiPost, errorMessage, fetcher } from '@/lib/client';
import { faDateTime, cn } from '@/lib/utils';

type Incoming = {
  id: string;
  note: string | null;
  createdAt: string;
  expiresAt: string;
  server: { id: string; name: string; serverTypeName: string; locationName: string };
  from: string;
  fromEmail: string;
};

type Outgoing = {
  id: string;
  status: string;
  note: string | null;
  createdAt: string;
  expiresAt: string;
  server: { id: string; name: string };
  to: string;
  toEmail: string;
};

type Data = { incoming: Incoming[]; outgoing: Outgoing[] };

const STATUS_FA: Record<string, { label: string; tone: 'ok' | 'bad' | 'warn' | 'muted' }> = {
  PENDING: { label: 'در انتظار پاسخ گیرنده', tone: 'warn' },
  ACCEPTED: { label: 'پذیرفته شد', tone: 'ok' },
  REJECTED: { label: 'رد شد', tone: 'bad' },
  CANCELED: { label: 'لغو شد', tone: 'muted' },
  EXPIRED: { label: 'منقضی شد', tone: 'muted' },
};

export function TransfersClient() {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<Data>('/api/me/transfers', fetcher, { refreshInterval: 30_000 });
  const [busy, setBusy] = useState<string | null>(null);

  async function respond(id: string, action: 'accept' | 'reject' | 'cancel') {
    setBusy(`${action}:${id}`);
    try {
      const res = await apiPost<{ message: string }>(`/api/me/transfers/${id}`, { action });
      toast.success(res.message);
      mutate();
    } catch (err) {
      toast.error('عملیات انجام نشد', errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (isLoading && !data) return <LoadingBlock label="در حال دریافت درخواست‌های انتقال…" />;

  const incoming = data?.incoming ?? [];
  const outgoing = data?.outgoing ?? [];

  return (
    <div className="space-y-6">
      {/* ورودی — نیازمند تصمیم کاربر */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <Inbox size={15} /> درخواست‌های دریافتی
            {incoming.length ? <Badge tone="warn">{incoming.length}</Badge> : null}
          </span>
        }
        bodyClassName="p-0"
      >
        {incoming.length === 0 ? (
          <p className="px-5 py-10 text-center text-xs muted">درخواست انتقال جدیدی برای شما وجود ندارد.</p>
        ) : (
          <ul className="divide-y">
            {incoming.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <ServerIcon size={14} className="shrink-0 muted" />
                    <span className="mono">{t.server.name}</span>
                    <span className="text-[11px] muted">
                      ({t.server.serverTypeName} · {t.server.locationName})
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-6 muted">
                    از طرف <span className="ltr">{t.fromEmail}</span> — تا {faDateTime(t.expiresAt)} فرصت پاسخ دارید.
                  </p>
                  {t.note ? <p className="mt-1 text-[11px] leading-6">یادداشت: {t.note}</p> : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    onClick={() => respond(t.id, 'accept')}
                    loading={busy === `accept:${t.id}`}
                    disabled={Boolean(busy)}
                    icon={<Check size={14} />}
                  >
                    پذیرش
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => respond(t.id, 'reject')}
                    loading={busy === `reject:${t.id}`}
                    disabled={Boolean(busy)}
                    icon={<X size={14} />}
                  >
                    رد
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {incoming.length > 0 ? (
        <Alert tone="info">
          با پذیرش هر درخواست، مالکیت کامل سرور به شما منتقل می‌شود و هزینه‌های بعدی آن از کیف پول شما کسر می‌گردد.
          دقت کنید که سقف تعداد سرور شما پر نباشد.
        </Alert>
      ) : null}

      {/* خروجی — درخواست‌هایی که کاربر فرستاده */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <Send size={15} /> درخواست‌های ارسالی
          </span>
        }
        bodyClassName="p-0"
      >
        {outgoing.length === 0 ? (
          <p className="px-5 py-10 text-center text-xs muted">
            هنوز درخواست انتقالی نفرستاده‌اید. برای انتقال یک سرور، از صفحه همان سرور بخش «تنظیمات ← انتقال مالکیت»
            اقدام کنید.
          </p>
        ) : (
          <ul className="divide-y">
            {outgoing.map((t) => {
              const st = STATUS_FA[t.status] ?? { label: t.status, tone: 'muted' as const };
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <ServerIcon size={14} className="shrink-0 muted" />
                      <span className="mono">{t.server.name}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-6 muted">
                      به <span className="ltr">{t.toEmail}</span> — {faDateTime(t.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Badge tone={st.tone}>{st.label}</Badge>
                    {t.status === 'PENDING' ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => respond(t.id, 'cancel')}
                        loading={busy === `cancel:${t.id}`}
                        disabled={Boolean(busy)}
                      >
                        لغو
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <p className={cn('text-center text-[11px] muted')}>
        برای شروع یک انتقال جدید، به{' '}
        <Link href="/dashboard/servers" className="text-[var(--color-brand-600)] hover:underline">
          سرورهای من
        </Link>{' '}
        بروید، سرور موردنظر را باز کنید و از تب «تنظیمات» گزینه «انتقال مالکیت» را بزنید.
      </p>
    </div>
  );
}
