import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, Server as ServerIcon } from 'lucide-react';
import prisma from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { Button, Card, EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/app/shell';
import { ServerList } from './server-list';

export const metadata: Metadata = { title: 'سرورهای من' };
export const dynamic = 'force-dynamic';

export default async function ServersPage() {
  const user = await requireUser();
  const count = await prisma.server.count({ where: { userId: user.id, status: { not: 'DELETED' } } });

  return (
    <>
      <PageHeader
        title="سرورهای من"
        description="مدیریت، روشن و خاموش کردن و مشاهده وضعیت تمام سرورهای شما."
        breadcrumb={[{ href: '/dashboard', label: 'داشبورد' }]}
        action={
          <Link href="/dashboard/servers/new" className="btn btn-primary">
            <Plus size={16} /> ساخت سرور
          </Link>
        }
      />

      {count === 0 ? (
        <Card>
          <EmptyState
            icon={<ServerIcon size={42} />}
            title="هنوز سروری ندارید"
            description="اولین سرور ابری خود را بسازید. تحویل خودکار است و در کمتر از یک دقیقه آماده می‌شود."
            action={
              <Link href="/dashboard/servers/new">
                <Button icon={<Plus size={16} />}>ساخت اولین سرور</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <ServerList />
      )}
    </>
  );
}
