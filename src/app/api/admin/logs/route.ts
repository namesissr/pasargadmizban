import prisma from '@/lib/prisma';
import { ok, paged, pagination, route } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { auditLabel, AUDIT_LABELS } from '@/lib/audit';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (req: Request) => {
  await requireAdmin();
  const { page, perPage, skip, take } = pagination(req);
  const url = new URL(req.url);

  const action = url.searchParams.get('action');
  const userId = url.searchParams.get('userId');
  const q = url.searchParams.get('q')?.trim();

  const where: Prisma.AuditLogWhereInput = {
    ...(action && action !== 'ALL' ? { action } : {}),
    ...(userId ? { userId } : {}),
    ...(q
      ? {
          OR: [
            { entityId: { contains: q } },
            { ip: { contains: q } },
            { user: { email: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [items, total, actions] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({ by: ['action'], _count: true, orderBy: { _count: { action: 'desc' } }, take: 40 }),
  ]);

  return ok({
    ...paged(
      items.map((i) => ({ ...i, label: auditLabel(i.action) })),
      total,
      page,
      perPage,
    ),
    actions: actions.map((a) => ({ action: a.action, label: auditLabel(a.action), count: a._count })),
    labels: AUDIT_LABELS,
  });
});
