import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, parseBody, route } from '@/lib/api';
import { requireAdmin, requireStaff, clientIp, assertSameOrigin } from '@/lib/auth';
import { capacityOverview, createAccount, testToken } from '@/lib/hetzner-accounts';
import { enforceRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().trim().min(2, 'نام حساب را وارد کنید.').max(60),
  token: z.string().trim().min(20, 'توکن معتبر نیست.').max(200),
  maxServers: z.coerce.number().int().min(1).max(1000).optional().default(10),
  priority: z.coerce.number().int().min(0).max(1000).optional(),
  note: z.string().trim().max(300).optional().or(z.literal('')),
});

const testSchema = z.object({ token: z.string().trim().min(20).max(200) });

/** فهرست حساب‌ها با ظرفیت و وضعیت */
export const GET = route(async () => {
  await requireStaff();

  const overview = await capacityOverview();

  // تعداد سرور فعال هر حساب در پنل
  const grouped = await prisma.server.groupBy({
    by: ['hetznerAccountId'],
    where: { deletedAt: null, status: { notIn: ['DELETED'] } },
    _count: true,
  });
  const byAccount = Object.fromEntries(
    grouped.map((g) => [g.hetznerAccountId ?? 'unassigned', g._count]),
  );

  return ok({
    ...overview,
    accounts: overview.accounts.map((a) => ({
      ...a,
      activeServers: byAccount[a.id] ?? 0,
    })),
    unassignedServers: byAccount.unassigned ?? 0,
  });
});

/** افزودن حساب جدید */
export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  await enforceRateLimit(`hetzner-account:${admin.id}`, 20, 600, { persistent: true });

  const input = await parseBody(req, createSchema);
  const account = await createAccount({
    name: input.name,
    token: input.token,
    maxServers: input.maxServers,
    priority: input.priority,
    note: input.note || undefined,
  });

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.hetzner_account_add',
    entity: 'hetzner_account',
    entityId: account.id,
    ip: await clientIp(),
    meta: { name: account.name, maxServers: account.maxServers },
  });

  return ok(
    {
      account,
      message: `حساب «${account.name}» اضافه شد و ${account.serverCount} سرور موجود در آن شناسایی گردید.`,
    },
    { status: 201 },
  );
});

/** آزمایش توکن پیش از ثبت */
export const PUT = route(async (req: Request) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  await enforceRateLimit(`hetzner-test:${admin.id}`, 30, 600, { persistent: true });

  const { token } = await parseBody(req, testSchema);
  const result = await testToken(token);
  return ok(result);
});
