'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Send, CheckCircle2, Server as ServerIcon, Headset } from 'lucide-react';
import { Alert, Badge, Button, Card, LoadingBlock, Select, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/app/shell';
import { api, apiDelete, apiPost, errorMessage, fetcher } from '@/lib/client';
import { formatNumber } from '@/lib/money';
import { faDateTime, faRelative, TICKET_PRIORITY_FA, TICKET_STATUS_FA, cn, initials } from '@/lib/utils';

type Ticket = {
  id: string;
  number: number;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  closedAt: string | null;
  department: { id: string; name: string } | null;
  server: { id: string; name: string; ipv4: string | null } | null;
  user: { id: string; email: string; firstName: string | null; lastName: string | null };
  messages: {
    id: string;
    body: string;
    isStaff: boolean;
    createdAt: string;
    user: { id: string; firstName: string | null; lastName: string | null; role: string } | null;
  }[];
};

export function TicketThread({ ticketId, isStaffView }: { ticketId: string; isStaffView: boolean }) {
  const toast = useToast();
  const base = isStaffView ? '/admin/tickets' : '/dashboard/tickets';

  const { data: ticket, isLoading, mutate } = useSWR<Ticket>(`/api/tickets/${ticketId}`, fetcher, {
    refreshInterval: 30_000,
  });

  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [closeAfter, setCloseAfter] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  async function send() {
    if (reply.trim().length < 1) return;
    setSending(true);
    try {
      await apiPost(`/api/tickets/${ticketId}/reply`, { body: reply, closeTicket: closeAfter });
      setReply('');
      setCloseAfter(false);
      toast.success('پاسخ شما ثبت شد.');
      mutate();
    } catch (err) {
      toast.error('ارسال پاسخ انجام نشد', errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function closeTicket() {
    if (!window.confirm('این تیکت بسته شود؟')) return;
    try {
      await apiDelete(`/api/tickets/${ticketId}`);
      toast.success('تیکت بسته شد.');
      mutate();
    } catch (err) {
      toast.error('بستن تیکت انجام نشد', errorMessage(err));
    }
  }

  async function changeStatus(status: string) {
    setStatusBusy(true);
    try {
      await api(`/api/admin/tickets/${ticketId}`, { method: 'PATCH', body: { status } });
      toast.success('وضعیت تیکت تغییر کرد.');
      mutate();
    } catch (err) {
      toast.error('تغییر وضعیت انجام نشد', errorMessage(err));
    } finally {
      setStatusBusy(false);
    }
  }

  if (isLoading && !ticket) return <LoadingBlock />;
  if (!ticket) {
    return (
      <Alert tone="error" title="تیکت یافت نشد">
        <Link href={base} className="font-semibold underline">
          بازگشت به لیست تیکت‌ها
        </Link>
      </Alert>
    );
  }

  const st = TICKET_STATUS_FA[ticket.status] ?? { label: ticket.status, tone: 'muted' as const };
  const pr = TICKET_PRIORITY_FA[ticket.priority] ?? { label: ticket.priority, tone: 'muted' as const };
  const closed = ticket.status === 'CLOSED';

  return (
    <>
      <PageHeader
        title={ticket.subject}
        description={`تیکت شماره ${formatNumber(ticket.number)} · ایجاد ${faRelative(ticket.createdAt)}`}
        breadcrumb={[
          { href: isStaffView ? '/admin' : '/dashboard', label: isStaffView ? 'پنل مدیریت' : 'داشبورد' },
          { href: base, label: 'تیکت‌ها' },
        ]}
        action={
          <>
            <Badge tone={pr.tone}>اولویت {pr.label}</Badge>
            <Badge tone={st.tone}>{st.label}</Badge>
            {isStaffView ? (
              <Select
                value={ticket.status}
                onChange={(e) => changeStatus(e.target.value)}
                disabled={statusBusy}
                className="w-36 text-xs"
              >
                {Object.entries(TICKET_STATUS_FA).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </Select>
            ) : !closed ? (
              <Button variant="secondary" size="sm" onClick={closeTicket} icon={<CheckCircle2 size={14} />}>
                بستن تیکت
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_16rem] lg:items-start">
        <div className="space-y-4">
          {ticket.messages.map((m) => {
            const authorName = m.isStaff
              ? 'کارشناس پشتیبانی'
              : [m.user?.firstName, m.user?.lastName].filter(Boolean).join(' ') || 'کاربر';
            return (
              <div
                key={m.id}
                className={cn(
                  'card overflow-hidden',
                  m.isStaff && 'border-[color-mix(in_srgb,var(--color-brand-500)_40%,var(--border))]',
                )}
              >
                <header
                  className={cn(
                    'flex items-center justify-between gap-3 border-b px-4 py-2.5',
                    m.isStaff && 'bg-[color-mix(in_srgb,var(--color-brand-500)_7%,transparent)]',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold',
                        m.isStaff ? 'bg-[var(--color-brand-600)] text-white' : 'surface-2',
                      )}
                    >
                      {m.isStaff ? <Headset size={13} /> : initials(authorName)}
                    </span>
                    <span>
                      <span className="block text-xs font-bold">{authorName}</span>
                      <span className="block text-[10px] muted">{faDateTime(m.createdAt)}</span>
                    </span>
                  </div>
                  {m.isStaff ? <Badge tone="ok">پشتیبانی</Badge> : null}
                </header>
                <div className="whitespace-pre-wrap px-4 py-4 text-xs leading-7">{m.body}</div>
              </div>
            );
          })}

          {/* فرم پاسخ */}
          {closed && !isStaffView ? (
            <Alert tone="info" title="این تیکت بسته شده است">
              اگر همچنان به کمک نیاز دارید،{' '}
              <Link href="/dashboard/tickets/new" className="font-semibold underline">
                تیکت جدیدی ثبت کنید
              </Link>
              .
            </Alert>
          ) : (
            <Card title="پاسخ شما">
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                className="min-h-32"
                placeholder="پاسخ خود را بنویسید…"
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs muted">
                  <input
                    type="checkbox"
                    checked={closeAfter}
                    onChange={(e) => setCloseAfter(e.target.checked)}
                    className="h-3.5 w-3.5 accent-[var(--color-brand-600)]"
                  />
                  پس از ارسال، تیکت بسته شود
                </label>
                <Button
                  onClick={send}
                  loading={sending}
                  disabled={reply.trim().length === 0}
                  icon={<Send size={15} />}
                >
                  ارسال پاسخ
                </Button>
              </div>
            </Card>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20">
          <Card title="اطلاعات تیکت">
            <dl className="space-y-2.5 text-xs">
              <Row label="شماره" value={formatNumber(ticket.number)} />
              <Row label="بخش" value={ticket.department?.name ?? '—'} />
              <Row label="وضعیت" value={st.label} />
              <Row label="اولویت" value={pr.label} />
              <Row label="ایجاد" value={faDateTime(ticket.createdAt)} />
              {ticket.closedAt ? <Row label="بسته شد" value={faDateTime(ticket.closedAt)} /> : null}
              {isStaffView ? (
                <Row label="کاربر" value={ticket.user.email} />
              ) : null}
            </dl>
          </Card>

          {ticket.server ? (
            <Card title="سرور مرتبط">
              <Link
                href={`${isStaffView ? '/admin/servers' : '/dashboard/servers'}/${ticket.server.id}`}
                className="flex items-center gap-2 text-xs font-semibold hover:text-[var(--color-brand-600)]"
              >
                <ServerIcon size={15} className="muted" />
                {ticket.server.name}
              </Link>
              {ticket.server.ipv4 ? (
                <div className="mono ltr mt-1.5 text-[11px] muted">{ticket.server.ipv4}</div>
              ) : null}
            </Card>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2 border-b pb-2 last:border-b-0 last:pb-0">
      <dt className="muted">{label}</dt>
      <dd className="text-left">{value}</dd>
    </div>
  );
}
