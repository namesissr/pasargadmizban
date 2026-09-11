import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireAdmin, requireStaff, clientIp, assertSameOrigin } from '@/lib/auth';
import { normalizeCode } from '@/lib/promo';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** فهرست کدها با آمار مصرف */
export const GET = route(async () => {
  await requireStaff();

  const codes = await prisma.promoCode.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const totals = await prisma.promoRedemption.groupBy({
    by: ['codeId'],
    _sum: { amount: true },
    _count: true,
  });
  const byCode = Object.fromEntries(totals.map((t) => [t.codeId, { paid: Number(t._sum.amount ?? 0n), uses: t._count }]));

  return ok({
    codes: codes.map((c) => ({
      ...c,
      amount: Number(c.amount),
      maxBonus: Number(c.maxBonus),
      minTopup: Number(c.minTopup),
      totalPaid: byCode[c.id]?.paid ?? 0,
    })),
  });
});

const createSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, 'کد دست‌کم ۳ کاراکتر باشد.')
    .max(32)
    .regex(/^[A-Za-z0-9-]+$/, 'فقط حروف انگلیسی، رقم و خط تیره.'),
  kind: z.enum(['GIFT', 'TOPUP_BONUS']),
  amount: z.coerce.number().int().min(0).max(1_000_000_000).optional().default(0),
  percent: z.coerce.number().min(0).max(300).optional().default(0),
  maxBonus: z.coerce.number().int().min(0).optional().default(0),
  minTopup: z.coerce.number().int().min(0).optional().default(0),
  maxUses: z.coerce.number().int().min(0).max(1_000_000).optional().default(0),
  perUser: z.coerce.number().int().min(1).max(100).optional().default(1),
  firstTopupOnly: z.boolean().optional().default(false),
  expiresAt: z.coerce.date().optional().nullable(),
  note: z.string().trim().max(200).optional().or(z.literal('')),
});

export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const input = await parseBody(req, createSchema);

  const code = normalizeCode(input.code);

  if (input.kind === 'GIFT' && input.amount <= 0) {
    throw new ApiError('برای کد هدیه، مبلغ را وارد کنید.', 400, { fields: { amount: 'مبلغ لازم است.' } });
  }
  if (input.kind === 'TOPUP_BONUS' && input.percent <= 0) {
    throw new ApiError('برای کد شارژ بیشتر، درصد را وارد کنید.', 400, { fields: { percent: 'درصد لازم است.' } });
  }

  const existing = await prisma.promoCode.findUnique({ where: { code } });
  if (existing) throw new ApiError('کدی با همین نام وجود دارد.', 409, { fields: { code: 'تکراری است.' } });

  const promo = await prisma.promoCode.create({
    data: {
      code,
      kind: input.kind,
      amount: BigInt(input.amount),
      percent: input.percent,
      maxBonus: BigInt(input.maxBonus),
      minTopup: BigInt(input.minTopup),
      maxUses: input.maxUses,
      perUser: input.perUser,
      firstTopupOnly: input.firstTopupOnly,
      expiresAt: input.expiresAt ?? null,
      note: input.note || null,
    },
  });

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.promo_create',
    entity: 'promo_code',
    entityId: promo.id,
    ip: await clientIp(),
    meta: { code: promo.code, kind: promo.kind, amount: input.amount, percent: input.percent },
  });

  return ok({ promo: { ...promo, amount: Number(promo.amount), maxBonus: Number(promo.maxBonus), minTopup: Number(promo.minTopup) }, message: `کد «${promo.code}» ساخته شد.` }, { status: 201 });
});
