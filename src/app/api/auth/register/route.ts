import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { registerSchema } from '@/lib/validation';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { hashPassword, randomToken, sha256 } from '@/lib/crypto';
import { createSession, clientIp, clientUserAgent, assertSameOrigin } from '@/lib/auth';
import { enforceRateLimit, LIMITS } from '@/lib/rate-limit';
import { getSettings } from '@/lib/settings';
import { audit } from '@/lib/audit';
import { sendMail, verifyEmailTemplate } from '@/lib/mail';
import { notify, notifyStaff } from '@/lib/notify';
import { payWelcomeBonus } from '@/lib/referrals';
import { getPreferences } from '@/lib/preferences';
import { env } from '@/lib/env';
import { nanoid } from 'nanoid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async (req: Request): Promise<NextResponse> => {
  await assertSameOrigin();

  const ip = await clientIp();
  await enforceRateLimit(`register:${ip}`, LIMITS.register.limit, LIMITS.register.window, { persistent: true });

  const settings = await getSettings();
  if (!settings.registrationOpen) {
    throw new ApiError('ثبت‌نام در حال حاضر بسته است. برای اطلاعات بیشتر با پشتیبانی تماس بگیرید.', 403);
  }

  const input = await parseBody(req, registerSchema);

  const [existingEmail, existingPhone] = await Promise.all([
    prisma.user.findUnique({ where: { email: input.email }, select: { id: true } }),
    prisma.user.findUnique({ where: { phone: input.phone }, select: { id: true } }),
  ]);

  if (existingEmail) {
    throw new ApiError('این ایمیل قبلاً ثبت شده است.', 409, { fields: { email: 'این ایمیل قبلاً ثبت شده است.' } });
  }
  if (existingPhone) {
    throw new ApiError('این شماره موبایل قبلاً ثبت شده است.', 409, {
      fields: { phone: 'این شماره موبایل قبلاً ثبت شده است.' },
    });
  }

  let referredById: string | null = null;
  if (input.referralCode) {
    const referrer = await prisma.user.findUnique({
      where: { referralCode: input.referralCode.toUpperCase() },
      select: { id: true },
    });
    referredById = referrer?.id ?? null;
  }

  // اولین کاربر سیستم به صورت خودکار مدیر می‌شود
  const isFirstUser = (await prisma.user.count()) === 0;

  const user = await prisma.user.create({
    data: {
      email: input.email,
      phone: input.phone,
      passwordHash: await hashPassword(input.password),
      firstName: input.firstName,
      lastName: input.lastName,
      role: isFirstUser ? 'ADMIN' : 'USER',
      status: isFirstUser || !settings.requireEmailVerify ? 'ACTIVE' : 'PENDING',
      emailVerifiedAt: isFirstUser || !settings.requireEmailVerify ? new Date() : null,
      referralCode: nanoid(8).toUpperCase(),
      referredById,
    },
    select: { id: true, email: true, firstName: true, status: true, role: true },
  });

  // ارسال ایمیل تایید
  let verifyRequired = false;
  if (settings.requireEmailVerify && user.status === 'PENDING') {
    verifyRequired = true;
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
    const tpl = verifyEmailTemplate(input.firstName, url);
    void sendMail({ to: user.email, ...tpl }).catch(() => null);
  }

  // ترجیحات اطلاع‌رسانی با مقادیر پیش‌فرض سامانه ساخته می‌شود
  await getPreferences(user.id).catch(() => null);

  if (referredById) {
    void payWelcomeBonus(user.id).catch(() => null);
  }

  await createSession(user.id, { ip, userAgent: await clientUserAgent() });

  await audit({
    userId: user.id,
    action: 'auth.register',
    entity: 'user',
    entityId: user.id,
    ip,
    userAgent: await clientUserAgent(),
    meta: { firstUser: isFirstUser, referredById },
  });

  await notify(user.id, {
    type: 'success',
    title: 'به پاسارگاد میزبان خوش آمدید',
    body: verifyRequired
      ? 'برای فعال‌سازی حساب، ایمیل تایید ارسال‌شده را باز کنید.'
      : 'حساب شما فعال است. برای ساخت اولین سرور، کیف پول خود را شارژ کنید.',
    link: verifyRequired ? '/dashboard/profile' : '/dashboard/wallet',
  });

  if (!isFirstUser) {
    void notifyStaff({
      type: 'info',
      title: 'کاربر جدید ثبت‌نام کرد',
      body: `${input.firstName} ${input.lastName} — ${user.email}`,
      link: `/admin/users/${user.id}`,
    });
  }

  return ok({
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    verifyRequired,
    isFirstUser,
  });
});
