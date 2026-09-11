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
  const location = url.searchParams.get('location');
  const q = url.searchParams.get('q')?.trim();

  const where: Prisma.ServerWhereInput = {
    ...(status && status !== 'ALL' ? { status: status as never } : { status: { not: 'DELETED' } }),
    ...(location && location !== 'ALL' ? { locationName: location } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { ipv4: { contains: q } },
            { user: { email: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [items, total, byStatus] = await Promise.all([
    prisma.server.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    }),
    prisma.server.count({ where }),
    prisma.server.groupBy({ by: ['status'], _count: true }),
  ]);

  return ok({
    ...paged(items, total, page, perPage),
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count })),
  });
});
