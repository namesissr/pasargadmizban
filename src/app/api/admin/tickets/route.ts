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
  const priority = url.searchParams.get('priority');
  const q = url.searchParams.get('q')?.trim();

  const where: Prisma.TicketWhereInput = {
    ...(status && status !== 'ALL' ? { status: status as never } : {}),
    ...(priority && priority !== 'ALL' ? { priority: priority as never } : {}),
    ...(q
      ? {
          OR: [
            { subject: { contains: q, mode: 'insensitive' } },
            { user: { email: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [items, total, counts] = await Promise.all([
    prisma.ticket.findMany({
      where,
      orderBy: [{ unreadByStaff: 'desc' }, { lastReplyAt: 'desc' }],
      skip,
      take,
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        department: { select: { name: true } },
        server: { select: { id: true, name: true } },
        _count: { select: { messages: true } },
      },
    }),
    prisma.ticket.count({ where }),
    prisma.ticket.groupBy({ by: ['status'], _count: true }),
  ]);

  return ok({
    ...paged(items, total, page, perPage),
    counts: counts.map((c) => ({ status: c.status, count: c._count })),
    unread: await prisma.ticket.count({ where: { unreadByStaff: true, status: { not: 'CLOSED' } } }),
  });
});
