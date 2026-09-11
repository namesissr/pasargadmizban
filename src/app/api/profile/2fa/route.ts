import { z } from 'zod';
import QRCode from 'qrcode';
import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireUser, clientIp, assertSameOrigin } from '@/lib/auth';
import { verifyPassword, encrypt, decrypt } from '@/lib/crypto';
import {
  generateSecret,
  otpauthUrl,
  verifyToken,
  generateRecoveryCodes,
  hashRecoveryCode,
} from '@/lib/totp';
import { getSettings } from '@/lib/settings';
import { enforceRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** وضعیت فعلی ورود دو مرحله‌ای */
export const GET = route(async () => {
  const user = await requireUser();
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { twoFactorEnabled: true, twoFactorRecovery: true },
  });

  const codes = Array.isArray(row?.twoFactorRecovery) ? (row.twoFactorRecovery as string[]) : [];

  return ok({
    enabled: Boolean(row?.twoFactorEnabled),
    recoveryCodesLeft: codes.length,
  });
});

/** مرحله ۱: ساخت کلید مخفی و QR برای اسکن */
export const PUT = route(async () => {
  await assertSameOrigin();
  const user = await requireUser();
  await enforceRateLimit(`2fa-setup:${user.id}`, 10, 900, { persistent: true });

  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { twoFactorEnabled: true } });
  if (row?.twoFactorEnabled) {
    throw new ApiError('ورود دو مرحله‌ای از قبل فعال است.', 400, { code: 'already_enabled' });
  }

  const settings = await getSettings();
  const secret = generateSecret();
  const url = otpauthUrl({ secret, account: user.email, issuer: settings.brandName || 'Pasargad Mizban' });

  // کلید تا زمان تایید، رمزنگاری‌شده و غیرفعال ذخیره می‌شود
  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorSecret: encrypt(secret), twoFactorEnabled: false },
  });

  const qrDataUrl = await QRCode.toDataURL(url, {
    margin: 1,
    width: 240,
    errorCorrectionLevel: 'M',
    color: { dark: '#0f766e', light: '#ffffff' },
  });

  return ok({
    secret,
    otpauthUrl: url,
    qrDataUrl,
    message: 'کد QR را با اپلیکیشن احراز هویت اسکن کنید، سپس کد ۶ رقمی را وارد نمایید.',
  });
});

const enableSchema = z.object({ token: z.string().trim().min(6).max(10) });

/** مرحله ۲: تایید کد و فعال‌سازی */
export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const user = await requireUser();
  await enforceRateLimit(`2fa-enable:${user.id}`, 10, 600, { persistent: true });

  const { token } = await parseBody(req, enableSchema);

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { twoFactorSecret: true, twoFactorEnabled: true },
  });
  if (row?.twoFactorEnabled) throw new ApiError('ورود دو مرحله‌ای از قبل فعال است.', 400);

  const secret = decrypt(row?.twoFactorSecret);
  if (!secret) {
    throw new ApiError('ابتدا مرحله ساخت کلید را انجام دهید.', 400, { code: 'no_secret' });
  }

  if (!verifyToken(secret, token)) {
    throw new ApiError('کد واردشده درست نیست. ساعت دستگاه خود را بررسی و دوباره تلاش کنید.', 400, {
      fields: { token: 'کد نامعتبر است.' },
    });
  }

  const recoveryCodes = generateRecoveryCodes();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorEnabled: true,
      twoFactorRecovery: recoveryCodes.map(hashRecoveryCode),
    },
  });

  await audit({
    userId: user.id,
    action: 'auth.2fa_enabled',
    entity: 'user',
    entityId: user.id,
    ip: await clientIp(),
  });

  await notify(user.id, {
    kind: 'security',
    type: 'success',
    title: 'ورود دو مرحله‌ای فعال شد',
    body: 'از این پس برای ورود، علاوه بر رمز عبور، کد اپلیکیشن احراز هویت هم لازم است.',
    email: true,
  });

  return ok({
    enabled: true,
    recoveryCodes,
    message: 'ورود دو مرحله‌ای فعال شد. کدهای بازیابی را چاپ یا در جای امنی ذخیره کنید.',
  });
});

const disableSchema = z.object({
  password: z.string().min(1, 'رمز عبور را وارد کنید.'),
  token: z.string().trim().max(10).optional(),
});

/** غیرفعال‌سازی — نیازمند رمز عبور */
export const DELETE = route(async (req: Request) => {
  await assertSameOrigin();
  const user = await requireUser();
  await enforceRateLimit(`2fa-disable:${user.id}`, 8, 900, { persistent: true });

  const input = await parseBody(req, disableSchema);

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true, twoFactorEnabled: true },
  });
  if (!row?.twoFactorEnabled) throw new ApiError('ورود دو مرحله‌ای فعال نیست.', 400);

  if (!(await verifyPassword(input.password, row.passwordHash))) {
    throw new ApiError('رمز عبور اشتباه است.', 400, { fields: { password: 'رمز عبور اشتباه است.' } });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorRecovery: [] },
  });

  await audit({
    userId: user.id,
    action: 'auth.2fa_disabled',
    entity: 'user',
    entityId: user.id,
    ip: await clientIp(),
  });

  await notify(user.id, {
    kind: 'security',
    type: 'warning',
    title: 'ورود دو مرحله‌ای غیرفعال شد',
    body: 'اگر این کار توسط شما انجام نشده، فوراً رمز عبور خود را تغییر دهید و با پشتیبانی تماس بگیرید.',
    email: true,
    urgent: true,
  });

  return ok({ enabled: false, message: 'ورود دو مرحله‌ای غیرفعال شد.' });
});
