import prisma from '@/lib/prisma';
import { ok, route } from '@/lib/api';
import { requireUser, clientIp, assertSameOrigin } from '@/lib/auth';
import { clientForServer } from '@/lib/hetzner-accounts';
import { getOwnedServer, assertOperable } from '@/lib/server-access';
import { enforceRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * درخواست کنسول تحت وب (VNC over WebSocket).
 * خروجی شامل آدرس wss و رمز یک‌بارمصرف است که تا چند دقیقه اعتبار دارد.
 */
export const POST = route(async (_req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireUser();
  const { id } = await ctx.params;

  await enforceRateLimit(`console:${user.id}`, 10, 300, { persistent: true });

  const server = await getOwnedServer(id, user, { requireHetzner: true });
  assertOperable(server);

  const res = await (await clientForServer(server)).requestConsole(server.hetznerId!);

  await prisma.serverAction.create({
    data: {
      serverId: server.id,
      userId: user.id,
      action: 'request_console',
      hetznerActionId: BigInt(res.action.id),
      status: 'SUCCESS',
      finishedAt: new Date(),
    },
  });

  await audit({
    userId: user.id,
    action: 'server.action',
    entity: 'server',
    entityId: server.id,
    ip: await clientIp(),
    meta: { operation: 'request_console' },
  });

  return ok({
    wssUrl: res.wss_url,
    password: res.password,
    expiresInSeconds: 60,
    hint: 'این رمز یک‌بارمصرف است و فقط برای چند دقیقه اعتبار دارد.',
  });
});
