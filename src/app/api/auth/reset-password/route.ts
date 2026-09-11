import prisma from '@/lib/prisma';
import { resetPasswordSchema } from '@/lib/validation';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { hashPassword, sha256 } from '@/lib/crypto';
import { clientIp, clientUserAgent, assertSameOrigin, revokeAllSessions } from '@/lib/auth';
import { enforceRateLimit, LIMITS } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const ip = await clientIp();
  await enforceRateLimit(`reset:${ip}`, LIMITS.passwordReset.limit, LIMITS.passwordReset.window, {
    persistent: true,
  });

  const input = await parseBody(req, resetPasswordSchema);
  const tokenHash = sha256(input.token);

  const record = await prisma.verificationToken.findFirst({
    where: { tokenHash, type: 'PASSWORD_RESET', usedAt: null, expiresAt: { gt: new Date() } },
    include: { user: { select: { id: true, email: true, deletedAt: true } } },
  });

  if (!record || !record.user || record.user.deletedAt) {
    throw new ApiError('لینک بازیابی نامعتبر یا منقضی شده است. دوباره درخواست دهید.', 400, {
      code: 'invalid_token',
    });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(input.password) },
    }),
    prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  // همه نشست‌های قبلی باطل می‌شوند
  await revokeAllSessions(record.userId);

  await audit({
    userId: record.userId,
    action: 'auth.password_reset',
    ip,
    userAgent: await clientUserAgent(),
  });

  await notify(record.userId, {
    type: 'warning',
    title: 'رمز عبور حساب شما تغییر کرد',
    body: 'اگر این کار توسط شما انجام نشده، فوراً با پشتیبانی تماس بگیرید.',
    email: true,
  });

  return ok({ message: 'رمز عبور با موفقیت تغییر کرد. حالا می‌توانید وارد شوید.' });
});
