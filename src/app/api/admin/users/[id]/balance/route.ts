import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireAdmin, clientIp, assertSameOrigin } from '@/lib/auth';
import { adminBalanceSchema } from '@/lib/validation';
import { credit, debit } from '@/lib/wallet';
import { retryUnsuspend } from '@/lib/billing';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notify';
import { formatToman } from '@/lib/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** تعدیل دستی موجودی کیف پول کاربر توسط مدیر */
export const POST = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, balance: true } });
  if (!target) throw new ApiError('کاربر یافت نشد.', 404);

  const input = await parseBody(req, adminBalanceSchema);
  const amount = BigInt(Math.abs(input.amount));
  const isCredit = input.amount > 0;

  if (isCredit) {
    await credit({
      userId: id,
      amount,
      type: 'ADJUSTMENT',
      description: `افزایش دستی توسط مدیر: ${input.description}`,
      meta: { adminId: admin.id, adminEmail: admin.email },
    });
  } else {
    await debit({
      userId: id,
      amount,
      type: 'ADJUSTMENT',
      description: `کاهش دستی توسط مدیر: ${input.description}`,
      allowCredit: true,
      meta: { adminId: admin.id, adminEmail: admin.email },
    });
  }

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.balance_adjust',
    entity: 'user',
    entityId: id,
    ip: await clientIp(),
    meta: { amount: input.amount, reason: input.description, targetEmail: target.email },
  });

  await notify(id, {
    type: isCredit ? 'success' : 'warning',
    title: isCredit ? 'کیف پول شما شارژ شد' : 'از کیف پول شما کسر شد',
    body: `${formatToman(amount)} — ${input.description}`,
    link: '/dashboard/wallet',
  });

  if (isCredit) void retryUnsuspend().catch(() => null);

  const updated = await prisma.user.findUnique({ where: { id }, select: { balance: true } });

  return ok({
    balance: Number(updated?.balance ?? 0),
    message: `موجودی کاربر ${isCredit ? 'افزایش' : 'کاهش'} یافت.`,
  });
});
