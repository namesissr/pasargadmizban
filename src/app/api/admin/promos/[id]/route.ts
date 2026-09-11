import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireAdmin, clientIp, assertSameOrigin } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  active: z.boolean().optional(),
  maxUses: z.coerce.number().int().min(0).max(1_000_000).optional(),
  expiresAt: z.coerce.date().optional().nullable(),
  note: z.string().trim().max(200).optional().or(z.literal('')),
});

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const input = await parseBody(req, patchSchema);

  const promo = await prisma.promoCode.findUnique({ where: { id } });
  if (!promo) throw new ApiError('کد یافت نشد.', 404);

  const updated = await prisma.promoCode.update({
    where: { id },
    data: {
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.maxUses !== undefined ? { maxUses: input.maxUses } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
      ...(input.note !== undefined ? { note: input.note || null } : {}),
    },
  });

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.promo_update',
    entity: 'promo_code',
    entityId: id,
    ip: await clientIp(),
    meta: { active: input.active, maxUses: input.maxUses, note: input.note },
  });

  return ok({
    promo: { ...updated, amount: Number(updated.amount), maxBonus: Number(updated.maxBonus), minTopup: Number(updated.minTopup) },
    message: updated.active ? 'کد به‌روزرسانی شد.' : `کد «${updated.code}» غیرفعال شد.`,
  });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  const promo = await prisma.promoCode.findUnique({
    where: { id },
    include: { _count: { select: { redemptions: true } } },
  });
  if (!promo) throw new ApiError('کد یافت نشد.', 404);
  if (promo._count.redemptions > 0) {
    throw new ApiError('این کد استفاده شده و برای حفظ سابقه مالی حذف نمی‌شود؛ به جای حذف، غیرفعالش کنید.', 409);
  }

  await prisma.promoCode.delete({ where: { id } });

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.promo_delete',
    entity: 'promo_code',
    entityId: id,
    ip: await clientIp(),
    meta: { code: promo.code },
  });

  return ok({ deleted: true, message: `کد «${promo.code}» حذف شد.` });
});
