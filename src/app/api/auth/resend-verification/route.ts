import prisma from '@/lib/prisma';
import { ok, route, ApiError } from '@/lib/api';
import { randomToken, sha256 } from '@/lib/crypto';
import { requireUser, clientIp, assertSameOrigin } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { sendMail, verifyEmailTemplate } from '@/lib/mail';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async () => {
  await assertSameOrigin();
  const user = await requireUser();

  if (user.emailVerifiedAt) {
    throw new ApiError('ایمیل شما قبلاً تایید شده است.', 400);
  }

  await enforceRateLimit(`resend-verify:${user.id}`, 3, 900, { persistent: true });

  await prisma.verificationToken.updateMany({
    where: { userId: user.id, type: 'EMAIL_VERIFY', usedAt: null },
    data: { usedAt: new Date() },
  });

  const raw = randomToken(32);
  await prisma.verificationToken.create({
    data: {
      userId: user.id,
      type: 'EMAIL_VERIFY',
      tokenHash: sha256(raw),
      target: user.email,
      expiresAt: new Date(Date.now() + 24 * 3600_000),
    },
  });

  const url = `${env.appUrl}/verify-email?token=${raw}`;
  const tpl = verifyEmailTemplate(user.firstName ?? 'کاربر', url);
  const sent = await sendMail({ to: user.email, ...tpl });

  await clientIp();

  return ok({
    message: sent
      ? 'ایمیل تایید دوباره ارسال شد. صندوق ورودی و پوشه اسپم را بررسی کنید.'
      : 'ایمیل تایید ساخته شد، اما سرویس ایمیل پیکربندی نشده است. با پشتیبانی تماس بگیرید.',
    sent,
  });
});
