import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireUser, clientIp, assertSameOrigin } from '@/lib/auth';
import { changePasswordSchema } from '@/lib/validation';
import { hashPassword, verifyPassword } from '@/lib/crypto';
import { enforceRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const user = await requireUser();
  await enforceRateLimit(`change-pass:${user.id}`, 8, 900, { persistent: true });

  const input = await parseBody(req, changePasswordSchema);

  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!row) throw new ApiError('کاربر یافت نشد.', 404);

  const valid = await verifyPassword(input.currentPassword, row.passwordHash);
  if (!valid) {
    throw new ApiError('رمز عبور فعلی اشتباه است.', 400, { fields: { currentPassword: 'رمز فعلی اشتباه است.' } });
  }

  if (input.currentPassword === input.newPassword) {
    throw new ApiError('رمز جدید نباید با رمز فعلی یکسان باشد.', 400, {
      fields: { newPassword: 'رمز جدید تکراری است.' },
    });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(input.newPassword) },
  });

  await audit({ userId: user.id, action: 'auth.password_reset', ip: await clientIp(), meta: { self: true } });

  await notify(user.id, {
    type: 'warning',
    title: 'رمز عبور شما تغییر کرد',
    body: 'اگر این تغییر توسط شما انجام نشده، فوراً با پشتیبانی تماس بگیرید.',
    email: true,
  });

  return ok({ message: 'رمز عبور با موفقیت تغییر کرد.' });
});
