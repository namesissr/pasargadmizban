import prisma from '@/lib/prisma';
import { forgotPasswordSchema } from '@/lib/validation';
import { ok, parseBody, route } from '@/lib/api';
import { randomToken, sha256 } from '@/lib/crypto';
import { clientIp, clientUserAgent, assertSameOrigin } from '@/lib/auth';
import { enforceRateLimit, LIMITS } from '@/lib/rate-limit';
import { sendMail, resetPasswordTemplate } from '@/lib/mail';
import { audit } from '@/lib/audit';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const ip = await clientIp();
  await enforceRateLimit(`forgot:${ip}`, LIMITS.passwordReset.limit, LIMITS.passwordReset.window, {
    persistent: true,
  });

  const { email } = await parseBody(req, forgotPasswordSchema);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, firstName: true, deletedAt: true },
  });

  // پاسخ همیشه یکسان است تا وجود/عدم وجود حساب فاش نشود
  if (user && !user.deletedAt) {
    await enforceRateLimit(`forgot:user:${user.id}`, 3, 3600, { persistent: true }).catch(() => null);

    // ابطال توکن‌های قبلی
    await prisma.verificationToken.updateMany({
      where: { userId: user.id, type: 'PASSWORD_RESET', usedAt: null },
      data: { usedAt: new Date() },
    });

    const raw = randomToken(32);
    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        type: 'PASSWORD_RESET',
        tokenHash: sha256(raw),
        target: user.email,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });

    const url = `${env.appUrl}/reset-password?token=${raw}`;
    const tpl = resetPasswordTemplate(user.firstName ?? 'کاربر', url);
    void sendMail({ to: user.email, ...tpl }).catch(() => null);

    await audit({
      userId: user.id,
      action: 'auth.password_reset_request',
      ip,
      userAgent: await clientUserAgent(),
    });
  }

  return ok({
    message: 'اگر این ایمیل در سیستم ثبت شده باشد، لینک بازیابی برای آن ارسال شد.',
  });
});
