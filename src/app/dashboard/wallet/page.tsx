import type { Metadata } from 'next';
import prisma from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { activeGateways } from '@/lib/gateways';
import { burnRate } from '@/lib/billing';
import { PageHeader } from '@/components/app/shell';
import { WalletClient } from './wallet-client';

export const metadata: Metadata = { title: 'کیف پول' };
export const dynamic = 'force-dynamic';

export default async function WalletPage() {
  const user = await requireUser();

  const [row, settings, gateways, burn, recent, pendingManual] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { balance: true, creditLimit: true } }),
    getSettings(),
    activeGateways(),
    burnRate(user.id),
    prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: {
        id: true,
        ref: true,
        type: true,
        direction: true,
        amount: true,
        status: true,
        gateway: true,
        gatewayRefId: true,
        trackId: true,
        description: true,
        createdAt: true,
        paidAt: true,
      },
    }),
    prisma.transaction.count({ where: { userId: user.id, gateway: 'manual', status: 'PENDING' } }),
  ]);

  const balance = Number(row?.balance ?? 0);
  const hourly = Number(burn.hourly);

  return (
    <>
      <PageHeader
        title="کیف پول"
        description="شارژ اعتبار و مشاهده گردش حساب. تمام هزینه‌های سرویس از این کیف پول کسر می‌شود."
        breadcrumb={[{ href: '/dashboard', label: 'داشبورد' }]}
      />

      <WalletClient
        balance={balance}
        creditLimit={Number(row?.creditLimit ?? 0)}
        burn={{ hourly, daily: Number(burn.daily), monthly: Number(burn.monthly) }}
        gateways={gateways}
        limits={{ min: settings.minTopup, max: settings.maxTopup }}
        bankInfo={settings.manualBankInfo}
        pendingManual={pendingManual}
        recent={recent.map((t) => ({
          ...t,
          amount: Number(t.amount),
          createdAt: t.createdAt.toISOString(),
          paidAt: t.paidAt?.toISOString() ?? null,
        }))}
      />
    </>
  );
}
