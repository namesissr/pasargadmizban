import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireUser, clientIp, assertSameOrigin } from '@/lib/auth';
import { manualReceiptSchema } from '@/lib/validation';
import { getSettings } from '@/lib/settings';
import { txRef } from '@/lib/wallet';
import { enforceRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { notifyStaff } from '@/lib/notify';
import { formatToman } from '@/lib/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ثبت رسید واریز دستی — پس از تایید مدیر به کیف پول اضافه می‌شود */
export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const user = await requireUser();
  await enforceRateLimit(`manual-receipt:${user.id}`, 5, 3600, { persistent: true });

  const settings = await getSettings();
  if (!settings.gatewayManual) throw new ApiError('واریز دستی در حال حاضر فعال نیست.', 400);

  const input = await parseBody(req, manualReceiptSchema);
  const amount = BigInt(input.amount);

  if (amount < BigInt(settings.minTopup)) {
    throw new ApiError(`حداقل مبلغ واریز ${formatToman(settings.minTopup)} است.`, 400, {
      fields: { amount: 'مبلغ کمتر از حد مجاز است.' },
    });
  }

  const duplicate = await prisma.transaction.findFirst({
    where: { trackId: input.trackId, gateway: 'manual' },
    select: { id: true },
  });
  if (duplicate) {
    throw new ApiError('رسیدی با این شماره پیگیری قبلاً ثبت شده است.', 409, {
      fields: { trackId: 'این شماره پیگیری تکراری است.' },
    });
  }

  const trx = await prisma.transaction.create({
    data: {
      ref: txRef('MN'),
      userId: user.id,
      type: 'DEPOSIT',
      direction: 'CREDIT',
      amount,
      status: 'PENDING',
      gateway: 'manual',
      trackId: input.trackId,
      cardNumber: input.cardNumber || null,
      description: 'واریز دستی — در انتظار تایید پشتیبانی',
      meta: { paidAt: input.paidAt || null, note: input.note || null },
    },
  });

  await audit({
    userId: user.id,
    action: 'wallet.manual_receipt',
    entity: 'transaction',
    entityId: trx.id,
    ip: await clientIp(),
    meta: { amount: amount.toString(), trackId: input.trackId },
  });

  await notifyStaff({
    type: 'warning',
    title: 'رسید واریز دستی جدید',
    body: `${user.email} مبلغ ${formatToman(amount)} با شماره پیگیری ${input.trackId} ثبت کرد.`,
    link: '/admin/transactions?status=PENDING',
  });

  return ok({
    id: trx.id,
    message: 'رسید شما ثبت شد و پس از بررسی توسط پشتیبانی، کیف پول شارژ می‌شود.',
  });
});

/** لیست رسیدهای در انتظار کاربر */
export const GET = route(async () => {
  const user = await requireUser();
  const items = await prisma.transaction.findMany({
    where: { userId: user.id, gateway: 'manual', status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return ok({ items });
});
