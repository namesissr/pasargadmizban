import prisma from '@/lib/prisma';
import { ok, paged, pagination, route } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (req: Request) => {
  const user = await requireUser();
  const { page, perPage, skip, take } = pagination(req);
  const url = new URL(req.url);

  const type = url.searchParams.get('type');
  const status = url.searchParams.get('status');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  const where: Prisma.TransactionWhereInput = {
    userId: user.id,
    ...(type && type !== 'ALL' ? { type: type as never } : {}),
    ...(status && status !== 'ALL' ? { status: status as never } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(new Date(to).getTime() + 86_400_000) } : {}),
          },
        }
      : {}),
  };

  const [items, total, summary] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { server: { select: { id: true, name: true } } },
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.groupBy({
      by: ['direction'],
      where: { userId: user.id, status: 'SUCCESS' },
      _sum: { amount: true },
    }),
  ]);

  const totals = {
    credit: Number(summary.find((s) => s.direction === 'CREDIT')?._sum.amount ?? 0),
    debit: Number(summary.find((s) => s.direction === 'DEBIT')?._sum.amount ?? 0),
  };

  return ok({ ...paged(items, total, page, perPage), totals });
});
