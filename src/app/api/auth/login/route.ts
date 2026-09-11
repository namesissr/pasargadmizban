import { z } from 'zod';
import prisma from '@/lib/prisma';
import { loginSchema } from '@/lib/validation';
import { ok, route, ApiError } from '@/lib/api';
import { verifyPassword, randomToken, sha256, decrypt } from '@/lib/crypto';
import { createSession, clientIp, clientUserAgent, assertSameOrigin } from '@/lib/auth';
import { enforceRateLimit, clearRateLimit, LIMITS } from '@/lib/rate-limit';
import { verifyToken, verifyRecoveryCode } from '@/lib/totp';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** مرحله دوم ورود: کد اپلیکیشن احراز هویت یا کد بازیابی */
const challengeSchema = z.object({
  challenge: z.string().min(10),
  code: z.string().trim().min(6).max(20),
});

const CHALLENGE_TTL_MS = 5 * 60_000;

export const POST = route(async (req: Request) => {
  await assertSameOrigin();

  const ip = await clientIp();
  const userAgent = await clientUserAgent();

  const raw = await req.json().catch(() => {
    throw new ApiError('بدنه درخواست باید JSON معتبر باشد.', 400);
  });

  // ── مرحله دوم: تایید کد دو مرحله‌ای ──
  if (raw && typeof raw === 'object' && 'challenge' in raw) {
    return completeTwoFactor(raw, ip, userAgent);
  }

  // ── مرحله اول: ایمیل و رمز عبور ──
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError('اطلاعات ارسالی معتبر نیست.', 422, { code: 'validation' });
  }
  const input = parsed.data;

  await enforceRateLimit(`login:ip:${ip}`, LIMITS.login.limit * 3, LIMITS.login.window, { persistent: true });
  await enforceRateLimit(`login:email:${input.email}`, LIMITS.login.limit, LIMITS.login.window, { persistent: true });

  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      passwordHash: true,
      status: true,
      role: true,
      deletedAt: true,
      email: true,
      twoFactorEnabled: true,
    },
  });

  const invalid = new ApiError('ایمیل یا رمز عبور اشتباه است.', 401, { code: 'invalid_credentials' });

  if (!user || user.deletedAt) {
    // تاخیر مصنوعی تا زمان پاسخ برای کاربر موجود و ناموجود یکسان باشد
    await verifyPassword(input.password, '$2a$12$0000000000000000000000000000000000000000000000000000');
    await audit({ action: 'auth.login_failed', ip, userAgent, meta: { email: input.email, reason: 'not_found' } });
    throw invalid;
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    await audit({ userId: user.id, action: 'auth.login_failed', ip, userAgent, meta: { reason: 'bad_password' } });
    throw invalid;
  }

  if (user.status === 'BANNED') {
    throw new ApiError('این حساب مسدود شده است. برای پیگیری با پشتیبانی تماس بگیرید.', 403, { code: 'banned' });
  }

  // ── اگر ورود دو مرحله‌ای فعال است، نشست ساخته نمی‌شود ──
  if (user.twoFactorEnabled) {
    const challenge = randomToken(32);
    await prisma.verificationToken.deleteMany({ where: { userId: user.id, type: 'LOGIN_OTP' } });
    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        type: 'LOGIN_OTP',
        tokenHash: sha256(challenge),
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    });

    return ok({
      requiresTwoFactor: true,
      challenge,
      expiresInSeconds: CHALLENGE_TTL_MS / 1000,
      message: 'کد ۶ رقمی اپلیکیشن احراز هویت خود را وارد کنید.',
    });
  }

  await finishLogin(user.id, ip, userAgent);
  await clearRateLimit(`login:email:${input.email}`);

  return ok({
    id: user.id,
    role: user.role,
    status: user.status,
    redirect: user.role === 'ADMIN' || user.role === 'SUPPORT' ? '/admin' : '/dashboard',
  });
});

async function completeTwoFactor(raw: unknown, ip: string, userAgent: string) {
  const parsed = challengeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError('کد واردشده معتبر نیست.', 422, { fields: { code: 'کد را کامل وارد کنید.' } });
  }
  const { challenge, code } = parsed.data;

  await enforceRateLimit(`2fa-login:${sha256(challenge).slice(0, 24)}`, 8, 600, { persistent: true });

  const record = await prisma.verificationToken.findFirst({
    where: { tokenHash: sha256(challenge), type: 'LOGIN_OTP', usedAt: null, expiresAt: { gt: new Date() } },
    include: {
      user: {
        select: {
          id: true,
          role: true,
          status: true,
          email: true,
          deletedAt: true,
          twoFactorSecret: true,
          twoFactorRecovery: true,
        },
      },
    },
  });

  if (!record?.user || record.user.deletedAt) {
    throw new ApiError('مهلت ورود تمام شد. دوباره وارد شوید.', 401, { code: 'challenge_expired' });
  }

  const user = record.user;
  const secret = decrypt(user.twoFactorSecret);
  const recoveryHashes = Array.isArray(user.twoFactorRecovery) ? (user.twoFactorRecovery as string[]) : [];

  let accepted = false;
  let usedRecovery = false;

  if (secret && verifyToken(secret, code)) {
    accepted = true;
  } else {
    const recovery = verifyRecoveryCode(code, recoveryHashes);
    if (recovery.valid) {
      accepted = true;
      usedRecovery = true;
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorRecovery: recovery.remaining },
      });
    }
  }

  if (!accepted) {
    await prisma.verificationToken.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    // پس از ۵ تلاش ناموفق، چالش باطل می‌شود
    if (record.attempts + 1 >= 5) {
      await prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    }
    await audit({ userId: user.id, action: 'auth.login_failed', ip, userAgent, meta: { reason: 'bad_2fa' } });
    throw new ApiError('کد واردشده درست نیست.', 401, { fields: { code: 'کد نامعتبر است.' } });
  }

  await prisma.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  await finishLogin(user.id, ip, userAgent);

  if (usedRecovery) {
    await notify(user.id, {
      kind: 'security',
      type: 'warning',
      title: 'ورود با کد بازیابی انجام شد',
      body: `${recoveryHashes.length - 1} کد بازیابی باقی مانده است. اگر این ورود کار شما نبوده، فوراً رمز عبور را تغییر دهید.`,
      email: true,
      urgent: true,
    });
  }

  return ok({
    id: user.id,
    role: user.role,
    status: user.status,
    usedRecovery,
    redirect: user.role === 'ADMIN' || user.role === 'SUPPORT' ? '/admin' : '/dashboard',
  });
}

async function finishLogin(userId: string, ip: string, userAgent: string) {
  await createSession(userId, { ip, userAgent });
  await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date(), lastLoginIp: ip },
  });
  await audit({ userId, action: 'auth.login', ip, userAgent });
}
