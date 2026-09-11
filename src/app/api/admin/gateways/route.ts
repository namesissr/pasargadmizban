import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, parseBody, route } from '@/lib/api';
import { requireAdmin, requireStaff, clientIp, assertSameOrigin } from '@/lib/auth';
import { getSettings, setSettings } from '@/lib/settings';
import { encrypt } from '@/lib/crypto';
import { env } from '@/lib/env';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const GATEWAYS = ['zibal', 'bitpay', 'manual'] as const;

/** آمار ۳۰ روز اخیر هر درگاه */
async function gatewayStats(gateway: string, since: Date) {
  const [success, pending, failed] = await Promise.all([
    prisma.transaction.aggregate({
      where: { type: 'DEPOSIT', gateway, status: 'SUCCESS', createdAt: { gte: since } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.transaction.count({ where: { type: 'DEPOSIT', gateway, status: 'PENDING' } }),
    prisma.transaction.count({ where: { type: 'DEPOSIT', gateway, status: 'FAILED', createdAt: { gte: since } } }),
  ]);
  return {
    successCount: success._count,
    successSum: Number(success._sum.amount ?? 0),
    pending,
    failed,
  };
}

/** وضعیت درگاه‌ها، آمار و گزارش تراکنش‌ها */
export const GET = route(async (req: Request) => {
  await requireStaff();
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
  const perPage = 15;
  const gatewayFilter = url.searchParams.get('gateway');

  const settings = await getSettings(true);
  const since = new Date(Date.now() - 30 * 24 * 3600_000);

  const [zibal, bitpay, manual] = await Promise.all(GATEWAYS.map((g) => gatewayStats(g, since)));

  const where = {
    type: 'DEPOSIT' as const,
    ...(gatewayFilter && gatewayFilter !== 'ALL' ? { gateway: gatewayFilter } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        gateway: true,
        amount: true,
        status: true,
        trackId: true,
        gatewayRefId: true,
        createdAt: true,
        paidAt: true,
        user: { select: { email: true } },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  const zibalMerchant = (settings.zibalMerchant || '').trim();
  const callbackUrl = `${env.appUrl}/api/wallet/callback`;

  return ok({
    callbackUrl,
    zibal: {
      enabled: settings.gatewayZibal,
      merchant: zibalMerchant,
      source: zibalMerchant ? 'db' : 'env',
      effectiveMerchant: zibalMerchant || env.zibal.merchant,
      sandbox: (zibalMerchant || env.zibal.merchant) === 'zibal',
      stats: zibal,
    },
    bitpay: {
      enabled: settings.gatewayBitpay,
      hasApi: Boolean(settings.bitpayApiEnc) || Boolean(env.bitpay.apiOptional),
      stats: bitpay,
    },
    manual: {
      enabled: settings.gatewayManual,
      bankInfo: settings.manualBankInfo,
      stats: manual,
    },
    logs: {
      items: items.map((t) => ({
        id: t.id,
        gateway: t.gateway,
        amount: Number(t.amount),
        status: t.status,
        trackId: t.trackId,
        refId: t.gatewayRefId,
        email: t.user?.email ?? null,
        createdAt: t.createdAt.toISOString(),
        paidAt: t.paidAt?.toISOString() ?? null,
      })),
      meta: { page, total, totalPages: Math.max(1, Math.ceil(total / perPage)) },
    },
  });
});

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save-zibal'),
    enabled: z.boolean(),
    merchant: z.string().trim().max(80).optional().or(z.literal('')),
  }),
  z.object({
    action: z.literal('save-bitpay'),
    enabled: z.boolean(),
    /** اگر خالی باشد کلید قبلی حفظ می‌شود */
    api: z.string().trim().max(200).optional().or(z.literal('')),
  }),
  z.object({
    action: z.literal('save-manual'),
    enabled: z.boolean(),
    bankInfo: z.string().trim().max(2000).optional().or(z.literal('')),
  }),
]);

export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const input = await parseBody(req, bodySchema);

  if (input.action === 'save-zibal') {
    await setSettings({ gatewayZibal: input.enabled, zibalMerchant: input.merchant?.trim() ?? '' });
    await audit({ userId: admin.id, action: 'gateway.save', entity: 'settings', entityId: 'zibal', ip: await clientIp(), meta: { enabled: input.enabled } });
    return ok({ message: 'تنظیمات درگاه زیبال ذخیره شد.' });
  }

  if (input.action === 'save-bitpay') {
    const patch: Record<string, unknown> = { gatewayBitpay: input.enabled };
    if (input.api && input.api.trim()) {
      patch.bitpayApiEnc = encrypt(input.api.trim());
    }
    await setSettings(patch);
    await audit({ userId: admin.id, action: 'gateway.save', entity: 'settings', entityId: 'bitpay', ip: await clientIp(), meta: { enabled: input.enabled, apiChanged: Boolean(input.api) } });
    return ok({ message: 'تنظیمات درگاه بیت‌پی ذخیره شد.' });
  }

  // save-manual
  await setSettings({ gatewayManual: input.enabled, manualBankInfo: input.bankInfo ?? '' });
  await audit({ userId: admin.id, action: 'gateway.save', entity: 'settings', entityId: 'manual', ip: await clientIp(), meta: { enabled: input.enabled } });
  return ok({ message: 'تنظیمات واریز کارت‌به‌کارت ذخیره شد.' });
});
