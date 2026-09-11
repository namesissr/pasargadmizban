import prisma from '@/lib/prisma';
import { ok, paged, pagination, route } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (req: Request) => {
  const user = await requireUser();
  const { page, perPage, skip, take } = pagination(req);
  const status = new URL(req.url).searchParams.get('status');

  const where: Prisma.InvoiceWhereInput = {
    userId: user.id,
    ...(status && status !== 'ALL' ? { status: status as never } : {}),
  };

  const [items, total, unpaid] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { items: true },
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.aggregate({
      where: { userId: user.id, status: 'UNPAID' },
      _sum: { total: true },
      _count: true,
    }),
  ]);

  return ok({
    ...paged(items, total, page, perPage),
    unpaid: { count: unpaid._count, total: Number(unpaid._sum.total ?? 0) },
  });
});
