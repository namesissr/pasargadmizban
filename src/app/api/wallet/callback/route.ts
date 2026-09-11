import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { route } from '@/lib/api';
import { getGateway } from '@/lib/gateways';
import { settleDeposit, failDeposit } from '@/lib/wallet';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notify';
import { retryUnsuspend } from '@/lib/billing';
import { payReferralCommission } from '@/lib/referrals';
import { applyTopupBonus } from '@/lib/promo';
import { formatToman } from '@/lib/money';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * بازگشت کاربر از درگاه پرداخت.
 * زیبال با متد GET و پارامترهای trackId, success, status و orderId برمی‌گردد.
 *
 * این مسیر نباید هرگز خطای خام نمایش دهد؛ همیشه کاربر را به صفحه کیف پول
 * با پیام مناسب هدایت می‌کند.
 */

function redirectTo(path: string, params: Record<string, string>): NextResponse {
  const url = new URL(path, env.appUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, { status: 303 });
}

async function handle(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  let params = new URLSearchParams(url.search);

  // برخی درگاه‌ها با POST برمی‌گردند
  if (req.method === 'POST') {
    try {
      const form = await req.formData();
      const merged = new URLSearchParams(params);
      form.forEach((value, key) => merged.set(key, String(value)));
      params = merged;
    } catch {
      /* بدنه خالی بود */
    }
  }

  const trackId = params.get('trackId') ?? params.get('authority') ?? '';
  const orderId = params.get('orderId') ?? '';
  const successFlag = params.get('success');

  if (!trackId && !orderId) {
    return redirectTo('/dashboard/wallet', { error: 'اطلاعات بازگشت از درگاه ناقص بود.' });
  }

  // تراکنش را پیدا کن
  const trx = orderId
    ? await prisma.transaction.findUnique({ where: { id: orderId } })
    : await prisma.transaction.findFirst({ where: { trackId }, orderBy: { createdAt: 'desc' } });

  if (!trx) {
    return redirectTo('/dashboard/wallet', { error: 'تراکنش مربوط به این پرداخت پیدا نشد.' });
  }

  if (trx.status === 'SUCCESS') {
    return redirectTo('/dashboard/wallet', {
      success: `این پرداخت قبلاً ثبت شده است. مبلغ ${formatToman(trx.amount)} به کیف پول شما اضافه شده بود.`,
    });
  }

  // کاربر پرداخت را لغو کرده
  if (successFlag === '0') {
    await failDeposit(trx.id, 'پرداخت توسط کاربر لغو شد.');
    await audit({
      userId: trx.userId,
      actorType: 'gateway',
      action: 'wallet.topup_failed',
      entity: 'transaction',
      entityId: trx.id,
      meta: { reason: 'canceled' },
    });
    return redirectTo('/dashboard/wallet', { error: 'پرداخت لغو شد. مبلغی از حساب شما کسر نشده است.' });
  }

  try {
    const gateway = getGateway(trx.gateway ?? 'zibal');
    const verification = await gateway.verify({
      reference: trackId || trx.trackId || '',
      amount: trx.amount,
    });

    if (!verification.success) {
      await failDeposit(trx.id, verification.message);
      await audit({
        userId: trx.userId,
        actorType: 'gateway',
        action: 'wallet.topup_failed',
        entity: 'transaction',
        entityId: trx.id,
        meta: { message: verification.message, trackId },
      });
      return redirectTo('/dashboard/wallet', { error: verification.message });
    }

    const settled = await settleDeposit({
      transactionId: trx.id,
      gatewayRefId: verification.refNumber,
      trackId: trackId || trx.trackId || undefined,
      cardNumber: verification.cardNumber,
      meta: { verifiedAt: new Date().toISOString(), gateway: trx.gateway },
    });

    if (!settled.alreadySettled) {
      await audit({
        userId: trx.userId,
        actorType: 'gateway',
        action: 'wallet.topup_success',
        entity: 'transaction',
        entityId: trx.id,
        meta: { amount: trx.amount.toString(), refNumber: verification.refNumber, trackId },
      });

      await notify(trx.userId, {
        kind: 'billing',
        type: 'success',
        title: 'کیف پول شارژ شد',
        body: `مبلغ ${formatToman(trx.amount)} با موفقیت به کیف پول شما اضافه شد.`,
        link: '/dashboard/wallet',
      });

      // پاداش کد شارژ بیشتر، پورسانت معرف و رفع تعلیق سرورها
      await applyTopupBonus(trx.id);
      void payReferralCommission(trx.id).catch(() => null);
      void retryUnsuspend().catch(() => null);
    }

    return redirectTo('/dashboard/wallet', {
      success: `پرداخت موفق بود. ${formatToman(trx.amount)} به کیف پول شما اضافه شد.`,
    });
  } catch (err) {
    console.error('[wallet/callback] خطا در تایید پرداخت:', err);
    // تراکنش را در حالت PENDING نگه می‌داریم تا مدیر بتواند دستی بررسی کند
    await audit({
      userId: trx.userId,
      actorType: 'gateway',
      action: 'wallet.topup_failed',
      entity: 'transaction',
      entityId: trx.id,
      meta: { error: err instanceof Error ? err.message : 'unknown', trackId },
    });
    return redirectTo('/dashboard/wallet', {
      error:
        'پرداخت شما انجام شد اما تایید نهایی با خطا مواجه شد. تراکنش در حال بررسی است؛ اگر تا ۳۰ دقیقه شارژ نشد با پشتیبانی تماس بگیرید.',
    });
  }
}

export const GET = route(handle);
export const POST = route(handle);
