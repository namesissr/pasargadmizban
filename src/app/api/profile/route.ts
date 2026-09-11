import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireUser, clientIp, assertSameOrigin } from '@/lib/auth';
import { profileSchema } from '@/lib/validation';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const user = await requireUser();
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      emailVerifiedAt: true,
      phone: true,
      phoneVerifiedAt: true,
      firstName: true,
      lastName: true,
      company: true,
      nationalId: true,
      address: true,
      city: true,
      province: true,
      postalCode: true,
      role: true,
      status: true,
      balance: true,
      creditLimit: true,
      discountPct: true,
      maxServers: true,
      referralCode: true,
      createdAt: true,
      lastLoginAt: true,
      lastLoginIp: true,
      _count: { select: { servers: true, tickets: true, referrals: true } },
    },
  });
  if (!profile) throw new ApiError('کاربر یافت نشد.', 404);
  return ok(profile);
});

export const PATCH = route(async (req: Request) => {
  await assertSameOrigin();
  const user = await requireUser();
  const input = await parseBody(req, profileSchema);

  if (input.phone) {
    const taken = await prisma.user.findFirst({
      where: { phone: input.phone, id: { not: user.id } },
      select: { id: true },
    });
    if (taken) {
      throw new ApiError('این شماره موبایل برای حساب دیگری ثبت شده است.', 409, {
        fields: { phone: 'شماره تکراری است.' },
      });
    }
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      ...(input.phone ? { phone: input.phone } : {}),
      company: input.company || null,
      nationalId: input.nationalId || null,
      address: input.address || null,
      city: input.city || null,
      province: input.province || null,
      postalCode: input.postalCode || null,
    },
    select: { id: true, firstName: true, lastName: true, phone: true },
  });

  await audit({
    userId: user.id,
    action: 'profile.update',
    entity: 'user',
    entityId: user.id,
    ip: await clientIp(),
  });

  return ok({ ...updated, message: 'اطلاعات حساب با موفقیت ذخیره شد.' });
});
