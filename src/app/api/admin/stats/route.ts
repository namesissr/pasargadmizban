import prisma from '@/lib/prisma';
import { ok, route } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { revenueReport } from '@/lib/billing';
import { lastCatalogSync } from '@/lib/catalog';
import { hasAnyAccount } from '@/lib/hetzner-accounts';
import { getSettings } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  await requireStaff();
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);

  const [
    users,
    newUsers,
    activeServers,
    provisioningServers,
    suspendedServers,
    openTickets,
    pendingTx,
    totalBalance,
    revenue,
    revenueMonth,
    serversByLocation,
    serversByType,
    dailyRevenue,
    catalogSync,
    settings,
    lastJobs,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.server.count({ where: { status: { in: ['RUNNING', 'OFF'] } } }),
    prisma.server.count({ where: { status: 'PROVISIONING' } }),
    prisma.server.count({ where: { status: 'SUSPENDED' } }),
    prisma.ticket.count({ where: { status: { notIn: ['CLOSED'] } } }),
    prisma.transaction.count({ where: { status: 'PENDING', type: 'DEPOSIT' } }),
    prisma.user.aggregate({ _sum: { balance: true } }),
    revenueReport(1),
    revenueReport(30),
    prisma.server.groupBy({
      by: ['locationName'],
      where: { status: { notIn: ['DELETED'] } },
      _count: true,
    }),
    prisma.server.groupBy({
      by: ['serverTypeName'],
      where: { status: { notIn: ['DELETED'] } },
      _count: true,
    }),
    prisma.$queryRaw<{ day: Date; total: bigint }[]>`
      SELECT DATE_TRUNC('day', "paidAt") AS day, SUM("amount")::bigint AS total
      FROM "transactions"
      WHERE "type" = 'DEPOSIT' AND "status" = 'SUCCESS' AND "paidAt" >= ${monthAgo}
      GROUP BY 1 ORDER BY 1 ASC
    `,
    lastCatalogSync(),
    getSettings(),
    prisma.jobRun.findMany({ orderBy: { startedAt: 'desc' }, take: 12 }),
  ]);

  return ok({
    users: { total: users, new24h: newUsers },
    servers: {
      active: activeServers,
      provisioning: provisioningServers,
      suspended: suspendedServers,
      byLocation: serversByLocation.map((r) => ({ location: r.locationName, count: r._count })),
      byType: serversByType
        .map((r) => ({ type: r.serverTypeName, count: r._count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    },
    tickets: { open: openTickets },
    finance: {
      pendingDeposits: pendingTx,
      totalUserBalance: Number(totalBalance._sum.balance ?? 0),
      today: {
        deposits: Number(revenue.deposits.total),
        charges: Number(revenue.charges.total),
      },
      month: {
        deposits: Number(revenueMonth.deposits.total),
        charges: Number(revenueMonth.charges.total),
        refunds: Number(revenueMonth.refunds.total),
      },
      dailyRevenue: dailyRevenue.map((r) => ({
        day: r.day,
        total: Number(r.total),
      })),
    },
    system: {
      hetznerConfigured: await hasAnyAccount(),
      catalogSyncedAt: catalogSync,
      eurRate: settings.eurRate,
      markupPercent: settings.markupPercent,
      maintenanceMode: settings.maintenanceMode,
      jobs: lastJobs,
    },
  });
});
