import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireUser, clientIp, clientUserAgent, assertSameOrigin } from '@/lib/auth';
import { topupSchema } from '@/lib/validation';
import { getSettings } from '@/lib/settings';
import { createPendingDeposit } from '@/lib/wallet';
import { getGateway, GatewayError } from '@/lib/gateways';
import { enforceRateLimit, LIMITS } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { checkCode, describePromo, normalizeCode } from '@/lib/promo';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** شروع فرآیند شارژ کیف پول */
export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const user = await requireUser();
  await enforceRateLimit(`topup:${user.id}`, LIMITS.topup.limit, LIMITS.topup.window, { persistent: true });

  const settings = await getSettings();
  const input = await parseBody(req, topupSchema);
  const amount = BigInt(input.amount);

  if (amount < BigInt(settings.minTopup)) {
    throw new ApiError(
      `حداقل مبلغ شارژ ${new Intl.NumberFormat('fa-IR').format(settings.minTopup)} تومان است.`,
      400,
      { fields: { amount: 'مبلغ کمتر از حد مجاز است.' } },
    );
  }
  if (amount > BigInt(settings.maxTopup)) {
    throw new ApiError(
      `حداکثر مبلغ شارژ در هر تراکنش ${new Intl.NumberFormat('fa-IR').format(settings.maxTopup)} تومان است.`,
      400,
      { fields: { amount: 'مبلغ بیش از حد مجاز است.' } },
    );
  }

  // کد شارژ بیشتر: همین ابتدا بررسی می‌شود تا کاربر پیش از پرداخت بفهمد
  // کدش معتبر است؛ اعمال واقعی پاداش پس از موفق شدن پرداخت انجام می‌شود.
  let promoNote: string | null = null;
  let promoMeta: Record<string, string> = {};
  if (input.couponCode) {
    const promoCheck = await checkCode(input.couponCode, user.id, {
      kind: 'TOPUP_BONUS',
      topupAmount: amount,
    });
    if (!promoCheck.ok) {
      throw new ApiError(promoCheck.reason, 400, { fields: { couponCode: promoCheck.reason } });
    }
    promoNote = describePromo(promoCheck.promo);
    promoMeta = { promoCode: normalizeCode(input.couponCode) };
  }

  if (input.gateway === 'manual') {
    if (!settings.gatewayManual) throw new ApiError('واریز دستی در حال حاضر فعال نیست.', 400);
    const trx = await createPendingDeposit({
      userId: user.id,
      amount,
      gateway: 'manual',
      description: 'شارژ کیف پول — واریز دستی (در انتظار تایید)',
      meta: promoMeta,
    });
    return ok({
      mode: 'manual',
      transactionId: trx.id,
      bankInfo: settings.manualBankInfo,
      message: 'پس از واریز، رسید را در همین صفحه ثبت کنید تا توسط پشتیبانی بررسی شود.',
    });
  }

  if (input.gateway === 'zibal' && !settings.gatewayZibal) {
    throw new ApiError('درگاه پرداخت آنلاین در حال حاضر فعال نیست.', 400);
  }

  const trx = await createPendingDeposit({
    userId: user.id,
    amount,
    gateway: input.gateway,
    description: 'شارژ کیف پول',
    meta: promoMeta,
  });

  try {
    const gateway = getGateway(input.gateway);
    const result = await gateway.start({
      amount,
      orderId: trx.id,
      callbackUrl: `${env.appUrl}/api/wallet/callback`,
      description: `شارژ کیف پول ${settings.brandName}`,
      mobile: undefined,
      email: user.email,
    });

    await prisma.transaction.update({
      where: { id: trx.id },
      data: { trackId: result.reference, authority: result.reference },
    });

    await audit({
      userId: user.id,
      action: 'wallet.topup_start',
      entity: 'transaction',
      entityId: trx.id,
      ip: await clientIp(),
      userAgent: await clientUserAgent(),
      meta: { amount: amount.toString(), gateway: input.gateway, reference: result.reference },
    });

    return ok({
      mode: 'redirect',
      transactionId: trx.id,
      redirectUrl: result.redirectUrl,
      reference: result.reference,
      promoNote,
    });
  } catch (err) {
    await prisma.transaction.update({
      where: { id: trx.id },
      data: { status: 'FAILED', description: err instanceof Error ? err.message.slice(0, 300) : 'خطای درگاه' },
    });
    if (err instanceof GatewayError) throw new ApiError(err.message, 502, { code: 'gateway' });
    throw err;
  }
});
