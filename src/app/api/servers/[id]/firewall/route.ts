import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireUser, assertSameOrigin } from '@/lib/auth';
import { clientForServer } from '@/lib/hetzner-accounts';
import { getOwnedServer } from '@/lib/server-access';
import { firewallSchema } from '@/lib/validation';
import { HetznerError, type HFirewallRule } from '@/lib/hetzner';
import { enforceRateLimit } from '@/lib/rate-limit';
import { FIREWALL_PRESETS } from '@/lib/firewall-presets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };


export const GET = route(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const server = await getOwnedServer(id, user);

  const local = await prisma.firewall.findMany({
    where: { userId: server.userId, accountId: server.hetznerAccountId },
  });

  let applied: { id: number; name: string; status: string }[] = [];
  if (server.hetznerId) {
    try {
      const h = await (await clientForServer(server)).getServer(server.hetznerId);
      const ids = (h.public_net?.firewalls ?? []).map((f) => f.id);
      if (ids.length) {
        const all = await (await clientForServer(server)).listFirewalls();
        applied = all
          .filter((f) => ids.includes(f.id))
          .map((f) => ({
            id: f.id,
            name: f.name,
            status: h.public_net.firewalls?.find((x) => x.id === f.id)?.status ?? 'applied',
          }));
      }
    } catch {
      applied = [];
    }
  }

  return ok({
    firewalls: local.map((f) => ({
      id: f.id,
      hetznerId: Number(f.hetznerId),
      name: f.name,
      rules: f.rules,
      appliedTo: f.appliedTo,
    })),
    applied,
    presets: FIREWALL_PRESETS,
  });
});

/** ساخت یا بروزرسانی فایروال و اعمال آن روی سرور */
export const POST = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireUser();
  const { id } = await ctx.params;

  await enforceRateLimit(`firewall:${user.id}`, 20, 600, { persistent: true });

  const server = await getOwnedServer(id, user, { requireHetzner: true });
  const input = await parseBody(req, firewallSchema);

  const rules: HFirewallRule[] = input.rules.map((r) => {
    const ips = r.ips?.length ? r.ips : ['0.0.0.0/0', '::/0'];
    const base: HFirewallRule = {
      direction: r.direction,
      protocol: r.protocol,
      description: r.description || null,
    };
    if (r.protocol === 'tcp' || r.protocol === 'udp') {
      base.port = r.port && r.port !== '' ? r.port : 'any';
    }
    if (r.direction === 'in') base.source_ips = ips;
    else base.destination_ips = ips;
    return base;
  });

  const client = await clientForServer(server);

  // اگر فایروالی با همین نام برای کاربر وجود دارد، به‌روزرسانی کن
  const existing = await prisma.firewall.findFirst({
    where: { userId: user.id, name: input.name, accountId: server.hetznerAccountId },
  });

  let hetznerFirewallId: number;
  if (existing) {
    hetznerFirewallId = Number(existing.hetznerId);
    await client.setFirewallRules(hetznerFirewallId, rules);
    await prisma.firewall.update({
      where: { id: existing.id },
      data: { rules: rules as never },
    });
  } else {
    const created = await client.createFirewall({
      name: `${input.name}-${user.id.slice(0, 6)}`.slice(0, 60),
      rules,
      apply_to: [{ type: 'server', server: { id: Number(server.hetznerId) } }],
    });
    hetznerFirewallId = created.firewall.id;
    await prisma.firewall.create({
      data: {
        userId: user.id,
        accountId: server.hetznerAccountId,
        hetznerId: BigInt(created.firewall.id),
        name: input.name,
        rules: rules as never,
        appliedTo: [server.id] as never,
      },
    });
  }

  // اطمینان از اعمال روی این سرور
  try {
    await client.applyFirewall(hetznerFirewallId, [Number(server.hetznerId)]);
  } catch (err) {
    if (!(err instanceof HetznerError && err.code === 'invalid_input')) throw err;
  }

  return ok({
    firewallId: hetznerFirewallId,
    rules: rules.length,
    message: 'قوانین فایروال ذخیره و روی سرور اعمال شد.',
  });
});

export const DELETE = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireUser();
  const { id } = await ctx.params;
  const server = await getOwnedServer(id, user, { requireHetzner: true });

  const url = new URL(req.url);
  const firewallId = url.searchParams.get('firewallId');
  if (!firewallId) throw new ApiError('شناسه فایروال مشخص نشده است.', 400);

  const firewall = await prisma.firewall.findFirst({ where: { id: firewallId, userId: user.id } });
  if (!firewall) throw new ApiError('فایروال یافت نشد.', 404);

  try {
    await (await clientForServer(server)).removeFirewall(firewall.hetznerId, [Number(server.hetznerId)]);
    await (await clientForServer(server)).deleteFirewall(firewall.hetznerId);
  } catch (err) {
    if (!(err instanceof HetznerError && err.code === 'not_found')) throw err;
  }

  await prisma.firewall.delete({ where: { id: firewall.id } });

  return ok({ deleted: true, message: 'فایروال حذف شد و محدودیت‌های آن برداشته شد.' });
});
