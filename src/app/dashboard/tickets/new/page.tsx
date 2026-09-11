import type { Metadata } from 'next';
import prisma from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { PageHeader } from '@/components/app/shell';
import { NewTicketForm } from './form';

export const metadata: Metadata = { title: 'تیکت جدید' };
export const dynamic = 'force-dynamic';

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ serverId?: string }>;
}) {
  const user = await requireUser();
  const { serverId } = await searchParams;

  const [departments, servers] = await Promise.all([
    prisma.ticketDepartment.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.server.findMany({
      where: { userId: user.id, status: { not: 'DELETED' } },
      select: { id: true, name: true, ipv4: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="ثبت تیکت جدید"
        description="مشکل یا سوال خود را با جزئیات کامل شرح دهید تا سریع‌تر پاسخ بگیرید."
        breadcrumb={[
          { href: '/dashboard', label: 'داشبورد' },
          { href: '/dashboard/tickets', label: 'پشتیبانی' },
        ]}
      />
      <NewTicketForm
        departments={departments.map((d) => ({ id: d.id, name: d.name }))}
        servers={servers}
        defaultServerId={serverId ?? ''}
      />
    </>
  );
}
