import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, parseBody, route } from '@/lib/api';
import { requireAdmin, requireStaff, clientIp, assertSameOrigin } from '@/lib/auth';
import { deleteAccount, getAccount, refreshAccount, updateAccount } from '@/lib/hetzner-accounts';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  token: z.string().trim().min(20).max(200).optional().or(z.literal('')),
  maxServers: z.coerce.number().int().min(1).max(1000).optional(),
  priority: z.coerce.number().int().min(0).max(1000).optional(),
  enabled: z.boolean().optional(),
  note: z.string().trim().max(300).optional(),
});

/** جزئیات یک حساب به همراه سرورهای روی آن */
export const GET = route(async (_req: Request, ctx: Ctx) => {
  await requireStaff();
  const { id } = await ctx.params;
  const account = await getAccount(id);

  const servers = await prisma.server.findMany({
    where: { hetznerAccountId: id, deletedAt: null, status: { notIn: ['DELETED'] } },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      name: true,
      status: true,
      ipv4: true,
      serverTypeName: true,
      locationName: true,
      createdAt: true,
      user: { select: { id: true, email: true } },
    },
  });

  return ok({
    account: { ...account, tokenEnc: undefined },
    servers,
  });
});

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  const input = await parseBody(req, patchSchema);
  const account = await updateAccount(id, {
    ...input,
    token: input.token || undefined,
  });

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.hetzner_account_update',
    entity: 'hetzner_account',
    entityId: id,
    ip: await clientIp(),
    meta: { ...input, token: input.token ? '[تغییر کرد]' : undefined },
  });

  return ok({ account, message: 'حساب به‌روزرسانی شد.' });
});

/** به‌روزرسانی ظرفیت و سلامت از روی هتزنر */
export const POST = route(async (_req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  await requireStaff();
  const { id } = await ctx.params;

  const account = await refreshAccount(id);
  return ok({
    account,
    message:
      account.status === 'ERROR'
        ? `بررسی ناموفق بود: ${account.lastError}`
        : `${account.serverCount} سرور از ${account.maxServers} ظرفیت استفاده شده است.`,
  });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  const account = await getAccount(id);
  await deleteAccount(id);

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.hetzner_account_delete',
    entity: 'hetzner_account',
    entityId: id,
    ip: await clientIp(),
    meta: { name: account.name },
  });

  return ok({ deleted: true, message: `حساب «${account.name}» حذف شد.` });
});
