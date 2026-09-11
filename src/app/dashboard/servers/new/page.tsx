import type { Metadata } from 'next';
import Link from 'next/link';
import prisma from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { catalogIsEmpty } from '@/lib/catalog';
import { getSettings } from '@/lib/settings';
import { Alert } from '@/components/ui';
import { PageHeader } from '@/components/app/shell';
import { CreateServerWizard } from './wizard';

export const metadata: Metadata = { title: 'ساخت سرور جدید' };
export const dynamic = 'force-dynamic';

export default async function NewServerPage() {
  const user = await requireUser();
  const [empty, settings, sshKeys, existing, balanceRow] = await Promise.all([
    catalogIsEmpty(),
    getSettings(),
    prisma.sshKey.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, fingerprint: true },
    }),
    prisma.server.findMany({
      where: { userId: user.id, status: { not: 'DELETED' } },
      select: { name: true },
    }),
    prisma.user.findUnique({ where: { id: user.id }, select: { balance: true, status: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="ساخت سرور جدید"
        description="پلن، لوکیشن و سیستم‌عامل را انتخاب کنید. سرور بلافاصله پس از تایید ساخته و تحویل داده می‌شود."
        breadcrumb={[
          { href: '/dashboard', label: 'داشبورد' },
          { href: '/dashboard/servers', label: 'سرورهای من' },
        ]}
      />

      {empty ? (
        <Alert tone="warning" title="کاتالوگ سرورها خالی است">
          هنوز اطلاعات پلن‌ها از هتزنر دریافت نشده است.{' '}
          {user.role === 'ADMIN' ? (
            <>
              از بخش{' '}
              <Link href="/admin/catalog" className="font-semibold underline">
                کاتالوگ هتزنر
              </Link>{' '}
              همگام‌سازی را انجام دهید.
            </>
          ) : (
            'لطفاً چند دقیقه دیگر تلاش کنید یا با پشتیبانی تماس بگیرید.'
          )}
        </Alert>
      ) : balanceRow?.status !== 'ACTIVE' ? (
        <Alert tone="warning" title="حساب شما هنوز فعال نیست">
          برای ساخت سرور ابتدا ایمیل خود را تایید کنید.{' '}
          <Link href="/dashboard/profile" className="font-semibold underline">
            رفتن به حساب کاربری
          </Link>
        </Alert>
      ) : (
        <CreateServerWizard
          sshKeys={sshKeys}
          existingNames={existing.map((s) => s.name)}
          balance={Number(balanceRow?.balance ?? 0)}
          prepayHours={settings.hourlyPrepayHours}
        />
      )}
    </>
  );
}
