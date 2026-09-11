import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireUser, clientIp, clientUserAgent, assertSameOrigin } from '@/lib/auth';
import { clientForServer } from '@/lib/hetzner-accounts';
import { getOwnedServer } from '@/lib/server-access';
import { syncServer, destroyServer } from '@/lib/provisioning';
import { renameServerSchema, deleteServerSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const url = new URL(req.url);

  let server = await getOwnedServer(id, user, { allowDeleted: true });

  // اگر تازه ساخته شده یا کاربر رفرش خواست، وضعیت را از هتزنر بگیر
  const wantsFresh = url.searchParams.get('sync') === '1' || server.status === 'PROVISIONING';
  if (wantsFresh && server.hetznerId && server.status !== 'DELETED') {
    server = (await syncServer(server.id)) ?? server;
  }

  const [actions, traffic] = await Promise.all([
    prisma.serverAction.findMany({
      where: { serverId: server.id },
      orderBy: { createdAt: 'desc' },
      take: 15,
    }),
    prisma.trafficUsage.findMany({
      where: { serverId: server.id },
      orderBy: { date: 'desc' },
      take: 30,
    }),
  ]);

  const sshKeys = Array.isArray(server.sshKeyIds) && (server.sshKeyIds as string[]).length
    ? await prisma.sshKey.findMany({
        where: { id: { in: server.sshKeyIds as string[] } },
        select: { id: true, name: true, fingerprint: true },
      })
    : [];

  return ok({
    ...server,
    rootPasswordEnc: undefined,
    hasRootPassword: Boolean(server.rootPasswordEnc),
    sshKeys,
    actions,
    traffic: traffic.map((t) => ({
      date: t.date,
      outgoing: Number(t.outgoingBytes),
      incoming: Number(t.incomingBytes),
    })),
  });
});

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireUser();
  const { id } = await ctx.params;
  const server = await getOwnedServer(id, user);
  const input = await parseBody(req, renameServerSchema);

  if (input.name && input.name !== server.name) {
    const duplicate = await prisma.server.findFirst({
      where: {
        userId: server.userId,
        name: input.name,
        deletedAt: null,
        status: { not: 'DELETED' },
        id: { not: server.id },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ApiError('سرور دیگری با این نام دارید.', 409, { fields: { name: 'این نام تکراری است.' } });
    }
    if (server.hetznerId) {
      const client = await clientForServer(server);
      await client
        .updateServer(server.hetznerId, {
          name: `${input.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-${server.id.slice(-6)}`.slice(0, 63),
        })
        .catch(() => null);
    }
  }

  const updated = await prisma.server.update({
    where: { id: server.id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.label !== undefined ? { label: input.label || null } : {}),
    },
  });

  return ok({ id: updated.id, name: updated.name, label: updated.label });
});

export const DELETE = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireUser();
  const { id } = await ctx.params;
  const server = await getOwnedServer(id, user);

  const input = await parseBody(req, deleteServerSchema);
  if (input.confirmName.trim() !== server.name) {
    throw new ApiError('نام واردشده با نام سرور مطابقت ندارد.', 400, {
      fields: { confirmName: 'نام سرور را دقیقاً وارد کنید.' },
    });
  }

  await destroyServer({
    serverId: server.id,
    userId: user.id,
    actorIsAdmin: user.role === 'ADMIN',
    reason: 'حذف توسط کاربر از طریق پنل.',
    refundRemaining: server.billingCycle === 'MONTHLY',
    ip: await clientIp(),
    userAgent: await clientUserAgent(),
  });

  return ok({ deleted: true });
});
