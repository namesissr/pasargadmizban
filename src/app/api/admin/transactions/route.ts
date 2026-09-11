import prisma from '@/lib/prisma';
import { ok, paged, pagination, route } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (req: Request) => {
  await requireStaff();
  const { page, perPage, skip, take } = pagination(req);
  const url = new URL(req.url);

  const status = url.searchParams.get('status');
  const type = url.searchParams.get('type');
  const gateway = url.searchParams.get('gateway');
  const q = url.searchParams.get('q')?.trim();

  const where: Prisma.TransactionWhereInput = {
    ...(status && status !== 'ALL' ? { status: status as never } : {}),
    ...(type && type !== 'ALL' ? { type: type as never } : {}),
    ...(gateway && gateway !== 'ALL' ? { gateway } : {}),
    ...(q
      ? {
          OR: [
            { ref: { contains: q, mode: 'insensitive' } },
            { trackId: { contains: q } },
            { gatewayRefId: { contains: q } },
            { user: { email: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [items, total, sums] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        server: { select: { id: true, name: true } },
      },
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.groupBy({
      by: ['type'],
      where: { status: 'SUCCESS' },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  return ok({
    ...paged(items, total, page, perPage),
    summary: sums.map((s) => ({ type: s.type, total: Number(s._sum.amount ?? 0), count: s._count })),
  });
});
