import prisma from '@/lib/prisma';
import { ok, paged, pagination, parseBody, route } from '@/lib/api';
import { requireUser, requireActiveUser, clientIp, clientUserAgent, assertSameOrigin } from '@/lib/auth';
import { createServerSchema } from '@/lib/validation';
import { provisionServer } from '@/lib/provisioning';
import { enforceRateLimit, LIMITS } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (req: Request) => {
  const user = await requireUser();
  const { page, perPage, skip, take } = pagination(req);
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const search = url.searchParams.get('q')?.trim();

  const where = {
    userId: user.id,
    status: status && status !== 'ALL' ? (status as never) : { not: 'DELETED' as const },
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { label: { contains: search, mode: 'insensitive' as const } },
            { ipv4: { contains: search } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.server.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        name: true,
        label: true,
        status: true,
        hetznerStatus: true,
        serverTypeName: true,
        locationName: true,
        imageLabel: true,
        ipv4: true,
        ipv6: true,
        cores: true,
        memory: true,
        disk: true,
        billingCycle: true,
        priceHourly: true,
        priceMonthly: true,
        backupsEnabled: true,
        expiresAt: true,
        createdAt: true,
        suspendedAt: true,
      },
    }),
    prisma.server.count({ where }),
  ]);

  return ok(paged(items, total, page, perPage));
});

export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const user = await requireActiveUser();
  await enforceRateLimit(`server-create:${user.id}`, LIMITS.serverCreate.limit, LIMITS.serverCreate.window, {
    persistent: true,
  });

  const input = await parseBody(req, createServerSchema);

  const server = await provisionServer({
    userId: user.id,
    name: input.name,
    serverType: input.serverType,
    location: input.location,
    image: input.image,
    billingCycle: input.billingCycle,
    months: input.months,
    sshKeyIds: input.sshKeyIds,
    enableBackups: input.enableBackups,
    enableIpv4: input.enableIpv4,
    userData: input.userData || undefined,
    label: input.label || undefined,
    appTemplate: input.appTemplate || undefined,
    enableMonitoring: input.enableMonitoring,
    ip: await clientIp(),
    userAgent: await clientUserAgent(),
  });

  return ok(
    {
      id: server.id,
      name: server.name,
      status: server.status,
      ipv4: server.ipv4,
      ipv6: server.ipv6,
    },
    { status: 201 },
  );
});
