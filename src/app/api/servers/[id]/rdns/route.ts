import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireUser, assertSameOrigin } from '@/lib/auth';
import { clientForServer } from '@/lib/hetzner-accounts';
import { getOwnedServer, assertOperable } from '@/lib/server-access';
import { rdnsSchema } from '@/lib/validation';
import { enforceRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** تنظیم رکورد معکوس (rDNS / PTR) برای IP سرور */
export const POST = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireUser();
  const { id } = await ctx.params;

  await enforceRateLimit(`rdns:${user.id}`, 20, 3600, { persistent: true });

  const server = await getOwnedServer(id, user, { requireHetzner: true });
  assertOperable(server);

  const input = await parseBody(req, rdnsSchema);

  const ownIps = [server.ipv4, server.ipv6].filter(Boolean) as string[];
  if (!ownIps.includes(input.ip)) {
    throw new ApiError('این آدرس IP متعلق به سرور شما نیست.', 400, { fields: { ip: 'آدرس نامعتبر است.' } });
  }

  if (input.dnsPtr && !/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(input.dnsPtr)) {
    throw new ApiError('نام دامنه معتبر نیست.', 400, { fields: { dnsPtr: 'مثال درست: mail.example.com' } });
  }

  const res = await (await clientForServer(server)).changeDnsPtr(server.hetznerId!, input.ip, input.dnsPtr);

  await prisma.serverAction.create({
    data: {
      serverId: server.id,
      userId: user.id,
      action: 'change_dns_ptr',
      hetznerActionId: BigInt((res as { action: { id: number } }).action.id),
      status: 'RUNNING',
      meta: { ip: input.ip, dnsPtr: input.dnsPtr },
    },
  });

  return ok({
    ip: input.ip,
    dnsPtr: input.dnsPtr,
    message: input.dnsPtr
      ? 'رکورد معکوس ثبت شد. اعمال آن در شبکه جهانی ممکن است تا چند ساعت طول بکشد.'
      : 'رکورد معکوس حذف شد.',
  });
});

/** خواندن rDNS فعلی از هتزنر */
export const GET = route(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const server = await getOwnedServer(id, user, { requireHetzner: true });

  const h = await (await clientForServer(server)).getServer(server.hetznerId!);

  return ok({
    ipv4: h.public_net?.ipv4 ? { ip: h.public_net.ipv4.ip, dnsPtr: h.public_net.ipv4.dns_ptr } : null,
    ipv6: (h.public_net?.ipv6?.dns_ptr ?? []).map((r) => ({ ip: r.ip, dnsPtr: r.dns_ptr })),
  });
});
