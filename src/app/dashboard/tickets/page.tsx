import type { Metadata } from 'next';
import Link from 'next/link';
import { LifeBuoy, Plus } from 'lucide-react';
import prisma from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { Badge, Button, Card, EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/app/shell';
import { formatNumber } from '@/lib/money';
import { faRelative, TICKET_PRIORITY_FA, TICKET_STATUS_FA } from '@/lib/utils';

export const metadata: Metadata = { title: 'پشتیبانی' };
export const dynamic = 'force-dynamic';

export default async function TicketsPage() {
  const user = await requireUser();

  const tickets = await prisma.ticket.findMany({
    where: { userId: user.id },
    orderBy: { lastReplyAt: 'desc' },
    take: 100,
    include: {
      department: { select: { name: true } },
      server: { select: { name: true } },
      _count: { select: { messages: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="پشتیبانی"
        description="تیکت‌های شما و پاسخ کارشناسان. میانگین زمان پاسخ‌گویی کمتر از یک ساعت است."
        breadcrumb={[{ href: '/dashboard', label: 'داشبورد' }]}
        action={
          <Link href="/dashboard/tickets/new" className="btn btn-primary">
            <Plus size={16} /> تیکت جدید
          </Link>
        }
      />

      <Card bodyClassName={tickets.length ? 'p-0' : undefined}>
        {tickets.length === 0 ? (
          <EmptyState
            icon={<LifeBuoy size={40} />}
            title="تیکتی ثبت نکرده‌اید"
            description="برای هر سوال فنی، مالی یا درخواست خاص می‌توانید تیکت ثبت کنید."
            action={
              <Link href="/dashboard/tickets/new">
                <Button icon={<Plus size={16} />}>ثبت اولین تیکت</Button>
              </Link>
            }
          />
        ) : (
          <div className="scroll-x">
            <table className="table table-cards">
              <thead>
                <tr>
                  <th>شماره</th>
                  <th>موضوع</th>
                  <th>بخش</th>
                  <th>اولویت</th>
                  <th>وضعیت</th>
                  <th>آخرین فعالیت</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => {
                  const st = TICKET_STATUS_FA[t.status] ?? { label: t.status, tone: 'muted' as const };
                  const pr = TICKET_PRIORITY_FA[t.priority] ?? { label: t.priority, tone: 'muted' as const };
                  return (
                    <tr key={t.id}>
                      <td data-label="شماره" className="tabular text-xs font-bold">{formatNumber(t.number)}</td>
                      <td data-label="موضوع" className="max-w-sm">
                        <Link
                          href={`/dashboard/tickets/${t.id}`}
                          className="block truncate text-xs font-semibold hover:text-[var(--color-brand-600)]"
                        >
                          {t.subject}
                          {t.unreadByUser ? (
                            <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-red-500 align-middle" />
                          ) : null}
                        </Link>
                        <div className="mt-0.5 text-[10px] muted">
                          {formatNumber(t._count.messages)} پیام
                          {t.server ? ` · سرور ${t.server.name}` : ''}
                        </div>
                      </td>
                      <td data-label="بخش" className="whitespace-nowrap text-xs muted">{t.department?.name ?? '—'}</td>
                      <td data-label="اولویت">
                        <Badge tone={pr.tone}>{pr.label}</Badge>
                      </td>
                      <td data-label="وضعیت">
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </td>
                      <td data-label="آخرین فعالیت" className="whitespace-nowrap text-xs muted">{faRelative(t.lastReplyAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
