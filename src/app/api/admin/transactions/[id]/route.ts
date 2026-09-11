import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireAdmin, clientIp, assertSameOrigin } from '@/lib/auth';
import { settleDeposit, failDeposit } from '@/lib/wallet';
import { retryUnsuspend } from '@/lib/billing';
import { payReferralCommission } from '@/lib/referrals';
import { applyTopupBonus } from '@/lib/promo';
import { getGateway } from '@/lib/gateways';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notify';
import { formatToman } from '@/lib/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const actionSchema = z.object({
  action: z.enum(['approve', 'reject', 'reverify']),
  reason: z.string().trim().max(300).optional(),
});

/**
 * تایید یا رد دستی یک تراکنش در انتظار.
 * برای واریزهای کارت به کارت و همچنین تراکنش‌هایی که تایید خودکارشان ناموفق بوده.
 */
export const POST = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  const trx = await prisma.transaction.findUnique({
    where: { id },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!trx) throw new ApiError('تراکنش یافت نشد.', 404);
  if (trx.status !== 'PENDING') throw new ApiError('فقط تراکنش‌های در انتظار قابل تغییر هستند.', 400);
  if (trx.direction !== 'CREDIT') throw new ApiError('فقط تراکنش‌های واریز قابل تایید دستی هستند.', 400);

  const input = await parseBody(req, actionSchema);

  if (input.action === 'reverify') {
    if (!trx.gateway || trx.gateway === 'manual') {
      throw new ApiError('این تراکنش درگاه آنلاین ندارد.', 400);
    }
    const gateway = getGateway(trx.gateway);
    const result = await gateway.verify({ reference: trx.trackId ?? '', amount: trx.amount });
    if (!result.success) {
      return ok({ verified: false, message: `تایید مجدد ناموفق بود: ${result.message}` });
    }
    const settled = await settleDeposit({
      transactionId: trx.id,
      gatewayRefId: result.refNumber,
      trackId: trx.trackId ?? undefined,
      cardNumber: result.cardNumber,
      meta: { manualReverifyBy: admin.id },
    });
    if (!settled.alreadySettled) {
      await notify(trx.userId, {
        type: 'success',
        title: 'کیف پول شارژ شد',
        body: `${formatToman(trx.amount)} پس از بررسی مجدد به کیف پول شما اضافه شد.`,
        link: '/dashboard/wallet',
      });
      void applyTopupBonus(trx.id).catch(() => null);
      void payReferralCommission(trx.id).catch(() => null);
      void retryUnsuspend().catch(() => null);
    }
    await audit({
      userId: admin.id,
      actorType: 'admin',
      action: 'admin.transaction_reverify',
      entity: 'transaction',
      entityId: trx.id,
      ip: await clientIp(),
    });
    return ok({ verified: true, message: 'تراکنش تایید و کیف پول کاربر شارژ شد.' });
  }

  if (input.action === 'approve') {
    const settled = await settleDeposit({
      transactionId: trx.id,
      trackId: trx.trackId ?? undefined,
      meta: { approvedBy: admin.id, approvedByEmail: admin.email, reason: input.reason ?? null },
    });

    await audit({
      userId: admin.id,
      actorType: 'admin',
      action: 'admin.transaction_approve',
      entity: 'transaction',
      entityId: trx.id,
      ip: await clientIp(),
      meta: { amount: trx.amount.toString(), targetEmail: trx.user.email },
    });

    if (!settled.alreadySettled) {
      await notify(trx.userId, {
        type: 'success',
        title: 'واریز شما تایید شد',
        body: `${formatToman(trx.amount)} به کیف پول شما اضافه شد.`,
        link: '/dashboard/wallet',
        email: true,
      });
      void applyTopupBonus(trx.id).catch(() => null);
      void payReferralCommission(trx.id).catch(() => null);
      void retryUnsuspend().catch(() => null);
    }

    return ok({ approved: true, message: 'تراکنش تایید و کیف پول کاربر شارژ شد.' });
  }

  // رد کردن
  await failDeposit(trx.id, input.reason || 'رد شده توسط مدیر');

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.transaction_reject',
    entity: 'transaction',
    entityId: trx.id,
    ip: await clientIp(),
    meta: { reason: input.reason ?? null, targetEmail: trx.user.email },
  });

  await notify(trx.userId, {
    type: 'error',
    title: 'واریز شما تایید نشد',
    body: input.reason || 'رسید ارسالی قابل تایید نبود. برای پیگیری تیکت ارسال کنید.',
    link: '/dashboard/wallet',
    email: true,
  });

  return ok({ rejected: true, message: 'تراکنش رد شد.' });
});
