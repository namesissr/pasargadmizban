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
  const q = url.searchParams.get('q')?.trim();
  const status = url.searchParams.get('status');
  const role = url.searchParams.get('role');

  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(status && status !== 'ALL' ? { status: status as never } : {}),
    ...(role && role !== 'ALL' ? { role: role as never } : {}),
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        balance: true,
        discountPct: true,
        createdAt: true,
        lastLoginAt: true,
        emailVerifiedAt: true,
        _count: { select: { servers: true, tickets: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return ok(paged(items, total, page, perPage));
});
