import prisma from './prisma';
import type { Prisma, PromoCode } from '@prisma/client';
import { credit } from './wallet';
import { ApiError } from './errors';
import { notify } from './notify';
import { formatToman } from './money';
import { audit } from './audit';

/**
 * کد هدیه و تخفیف.
 *
 * دو نوع کد وجود دارد:
 *   GIFT        — کاربر کد را در کیف پول وارد می‌کند و مبلغ فوراً شارژ می‌شود.
 *   TOPUP_BONUS — کاربر کد را هنگام شارژ می‌زند؛ پس از پرداخت موفق، درصدی از
 *                 مبلغ به عنوان هدیه اضافه می‌شود.
 *
 * برای بازاریابی ساخته شده: کدی می‌سازید، در کانال تلگرام یا کمپین پخش می‌کنید
 * و مصرفش را در پنل می‌بینید.
 */

const CODE_PATTERN = /^[A-Z0-9-]{3,32}$/;

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

type Rejection = { ok: false; reason: string };
type Acceptance = { ok: true; promo: PromoCode };

/** بررسی اینکه این کاربر همین حالا می‌تواند از این کد استفاده کند */
export async function checkCode(
  rawCode: string,
  userId: string,
  context: { kind?: 'GIFT' | 'TOPUP_BONUS'; topupAmount?: bigint } = {},
): Promise<Acceptance | Rejection> {
  const code = normalizeCode(rawCode);
  if (!CODE_PATTERN.test(code)) return { ok: false, reason: 'قالب کد معتبر نیست.' };

  const promo = await prisma.promoCode.findUnique({ where: { code } });
  if (!promo || !promo.active) return { ok: false, reason: 'چنین کدی وجود ندارد یا غیرفعال شده است.' };

  const now = Date.now();
  if (promo.startsAt && promo.startsAt.getTime() > now) {
    return { ok: false, reason: 'این کد هنوز فعال نشده است.' };
  }
  if (promo.expiresAt && promo.expiresAt.getTime() < now) {
    return { ok: false, reason: 'مهلت استفاده از این کد گذشته است.' };
  }
  if (context.kind && promo.kind !== context.kind) {
    return promo.kind === 'GIFT'
      ? { ok: false, reason: 'این کد هدیه است؛ آن را در بخش «کد هدیه» کیف پول وارد کنید.' }
      : { ok: false, reason: 'این کد مخصوص شارژ است؛ هنگام شارژ کیف پول واردش کنید.' };
  }
  if (promo.maxUses > 0 && promo.usedCount >= promo.maxUses) {
    return { ok: false, reason: 'ظرفیت استفاده از این کد تمام شده است.' };
  }

  const mine = await prisma.promoRedemption.count({ where: { codeId: promo.id, userId } });
  if (mine >= promo.perUser) {
    return { ok: false, reason: 'شما قبلاً از این کد استفاده کرده‌اید.' };
  }

  if (promo.kind === 'TOPUP_BONUS') {
    if (context.topupAmount !== undefined && promo.minTopup > 0n && context.topupAmount < promo.minTopup) {
      return {
        ok: false,
        reason: `این کد برای شارژ دست‌کم ${formatToman(promo.minTopup)} است.`,
      };
    }
    if (promo.firstTopupOnly) {
      const previous = await prisma.transaction.count({
        where: { userId, type: 'DEPOSIT', status: 'SUCCESS' },
      });
      if (previous > 0) return { ok: false, reason: 'این کد فقط برای نخستین شارژ حساب است.' };
    }
  }

  return { ok: true, promo };
}

/** مصرف اتمی یک استفاده از کد؛ اگر ظرفیت همان لحظه پر شده باشد false برمی‌گرداند */
async function consumeUse(promo: PromoCode, tx: Prisma.TransactionClient): Promise<boolean> {
  const updated = await tx.promoCode.updateMany({
    where: {
      id: promo.id,
      active: true,
      ...(promo.maxUses > 0 ? { usedCount: { lt: promo.maxUses } } : {}),
    },
    data: { usedCount: { increment: 1 } },
  });
  return updated.count === 1;
}

/** استفاده از کد هدیه — اعتبار فوری */
export async function redeemGiftCode(rawCode: string, userId: string, ip?: string) {
  const result = await checkCode(rawCode, userId, { kind: 'GIFT' });
  if (!result.ok) throw new ApiError(result.reason, 400, { code: 'promo_invalid' });
  const { promo } = result;

  if (promo.amount <= 0n) throw new ApiError('این کد مبلغی برای هدیه ندارد.', 400);

  // ثبت مصرف و اعتبار در یک تراکنش تا با استفاده همزمان، کد بیش از ظرفیت خرج نشود
  const redemption = await prisma.$transaction(async (tx) => {
    if (!(await consumeUse(promo, tx))) {
      throw new ApiError('ظرفیت استفاده از این کد همین حالا تمام شد.', 409, { code: 'promo_exhausted' });
    }
    const row = await tx.promoRedemption.create({
      data: { codeId: promo.id, userId, amount: promo.amount },
    });
    await credit(
      {
        userId,
        amount: promo.amount,
        type: 'BONUS',
        description: `هدیه کد «${promo.code}»`,
        meta: { promoCode: promo.code, redemptionId: row.id },
      },
      tx,
    );
    return row;
  });

  await audit({
    userId,
    action: 'wallet.promo_redeem',
    entity: 'promo_code',
    entityId: promo.id,
    ip,
    meta: { code: promo.code, amount: promo.amount.toString() },
  });

  await notify(userId, {
    kind: 'billing',
    type: 'success',
    title: 'کد هدیه اعمال شد 🎁',
    body: `مبلغ ${formatToman(promo.amount)} بابت کد «${promo.code}» به کیف پول شما اضافه شد.`,
    link: '/dashboard/wallet',
  });

  return { amount: promo.amount, code: promo.code, redemptionId: redemption.id };
}

/**
 * اعمال پاداش شارژ پس از پرداخت موفق.
 * کد هنگام شروع شارژ در متای تراکنش ذخیره شده؛ اینجا دوباره بررسی و اعمال می‌شود.
 * خطا هرگز به بیرون نمی‌رود تا شارژ اصلی کاربر قربانی مشکل کد نشود.
 */
export async function applyTopupBonus(transactionId: string): Promise<void> {
  try {
    const trx = await prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!trx || trx.status !== 'SUCCESS' || trx.type !== 'DEPOSIT') return;

    const meta = (trx.meta ?? {}) as Record<string, unknown>;
    const rawCode = typeof meta.promoCode === 'string' ? meta.promoCode : '';
    if (!rawCode) return;

    // جلوگیری از اعمال دوباره در فراخوانی تکراری callback
    const existing = await prisma.promoRedemption.findFirst({ where: { transactionId: trx.id } });
    if (existing) return;

    const result = await checkCode(rawCode, trx.userId, { kind: 'TOPUP_BONUS', topupAmount: trx.amount });
    if (!result.ok) {
      console.warn(`[promo] پاداش شارژ «${rawCode}» برای تراکنش ${trx.ref} اعمال نشد: ${result.reason}`);
      return;
    }
    const { promo } = result;

    let bonus = BigInt(Math.floor((Number(trx.amount) * promo.percent) / 100));
    if (promo.maxBonus > 0n && bonus > promo.maxBonus) bonus = promo.maxBonus;
    if (bonus <= 0n) return;

    await prisma.$transaction(async (tx) => {
      if (!(await consumeUse(promo, tx))) return;
      const row = await tx.promoRedemption.create({
        data: { codeId: promo.id, userId: trx.userId, amount: bonus, transactionId: trx.id },
      });
      await credit(
        {
          userId: trx.userId,
          amount: bonus,
          type: 'BONUS',
          description: `${promo.percent}٪ شارژ بیشتر با کد «${promo.code}»`,
          meta: { promoCode: promo.code, redemptionId: row.id, depositRef: trx.ref },
        },
        tx,
      );
    });

    await notify(trx.userId, {
      kind: 'billing',
      type: 'success',
      title: 'شارژ بیشتر هدیه گرفتید 🎁',
      body: `بابت کد «${promo.code}»، ${formatToman(bonus)} اضافه بر شارژتان به کیف پول شما اضافه شد.`,
      link: '/dashboard/wallet',
    });
  } catch (err) {
    console.error('[promo] خطا در اعمال پاداش شارژ:', err);
  }
}

/** خلاصه یک کد برای نمایش پیش از استفاده (بدون افشای آمار داخلی) */
export function describePromo(promo: PromoCode): string {
  if (promo.kind === 'GIFT') return `${formatToman(promo.amount)} اعتبار هدیه`;
  const cap = promo.maxBonus > 0n ? ` تا سقف ${formatToman(promo.maxBonus)}` : '';
  const min = promo.minTopup > 0n ? ` برای شارژ دست‌کم ${formatToman(promo.minTopup)}` : '';
  return `${promo.percent}٪ شارژ بیشتر${cap}${min}`;
}
