import prisma from '@/lib/prisma';
import { verifyEmailSchema } from '@/lib/validation';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { sha256 } from '@/lib/crypto';
import { clientIp } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (req: Request) => {
  const { token } = await parseBody(req, verifyEmailSchema);
  const tokenHash = sha256(token);

  const record = await prisma.verificationToken.findFirst({
    where: { tokenHash, type: 'EMAIL_VERIFY', usedAt: null, expiresAt: { gt: new Date() } },
    include: { user: { select: { id: true, status: true, emailVerifiedAt: true } } },
  });

  if (!record || !record.user) {
    throw new ApiError('لینک تایید نامعتبر یا منقضی شده است.', 400, { code: 'invalid_token' });
  }

  if (record.user.emailVerifiedAt) {
    await prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    return ok({ message: 'ایمیل شما قبلاً تایید شده است.', alreadyVerified: true });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: {
        emailVerifiedAt: new Date(),
        status: record.user.status === 'PENDING' ? 'ACTIVE' : record.user.status,
      },
    }),
    prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  await audit({ userId: record.userId, action: 'auth.email_verified', ip: await clientIp() });
  await notify(record.userId, {
    type: 'success',
    title: 'حساب شما فعال شد',
    body: 'حالا می‌توانید کیف پول را شارژ کرده و اولین سرور خود را بسازید.',
    link: '/dashboard/wallet',
  });

  return ok({ message: 'ایمیل شما با موفقیت تایید شد.', alreadyVerified: false });
});
