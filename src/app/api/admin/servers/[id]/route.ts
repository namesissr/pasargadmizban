import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireAdmin, requireStaff, clientIp, assertSameOrigin } from '@/lib/auth';
import { destroyServer, suspendServer, unsuspendServer, syncServer } from '@/lib/provisioning';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, ctx: Ctx) => {
  await requireStaff();
  const { id } = await ctx.params;

  const server = await prisma.server.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true, balance: true } },
      actions: { orderBy: { createdAt: 'desc' }, take: 20 },
      transactions: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
  if (!server) throw new ApiError('سرور یافت نشد.', 404);

  return ok({ ...server, rootPasswordEnc: undefined });
});

const actionSchema = z.object({
  action: z.enum(['suspend', 'unsuspend', 'delete', 'sync']),
  reason: z.string().trim().max(300).optional(),
  refund: z.boolean().optional().default(false),
});

export const POST = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  const server = await prisma.server.findUnique({ where: { id }, select: { id: true, name: true, userId: true } });
  if (!server) throw new ApiError('سرور یافت نشد.', 404);

  const input = await parseBody(req, actionSchema);

  switch (input.action) {
    case 'suspend':
      await suspendServer(server.id, input.reason || 'تعلیق توسط مدیر سیستم.');
      break;
    case 'unsuspend': {
      const done = await unsuspendServer(server.id);
      if (!done) {
        throw new ApiError('رفع تعلیق ممکن نشد. موجودی کاربر برای ادامه سرویس کافی نیست.', 400);
      }
      break;
    }
    case 'delete':
      await destroyServer({
        serverId: server.id,
        userId: server.userId,
        actorIsAdmin: true,
        reason: input.reason || 'حذف توسط مدیر سیستم.',
        refundRemaining: input.refund,
        ip: await clientIp(),
      });
      break;
    case 'sync':
      await syncServer(server.id);
      break;
  }

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: `admin.server_${input.action}`,
    entity: 'server',
    entityId: server.id,
    ip: await clientIp(),
    meta: { reason: input.reason ?? null, serverName: server.name },
  });

  const labels: Record<string, string> = {
    suspend: 'سرور تعلیق شد.',
    unsuspend: 'سرور از تعلیق خارج شد.',
    delete: 'سرور حذف شد.',
    sync: 'وضعیت سرور با هتزنر همگام شد.',
  };

  return ok({ done: true, message: labels[input.action] });
});
