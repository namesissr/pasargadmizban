import prisma from '@/lib/prisma';
import { ok, route, ApiError } from '@/lib/api';
import { requireUser, clientIp, assertSameOrigin } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSettings } from '@/lib/settings';
import { telegramConfigured, getBotInfo, sendToUser } from '@/lib/telegram';
import { audit } from '@/lib/audit';
import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CODE_TTL_MINUTES = 15;

function makeCode(): string {
  // بدون کاراکترهای مشابه (O/0 و I/1) تا خواندن و تایپ آسان باشد
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(8))
    .map((b) => alphabet[b % alphabet.length])
    .join('');
}

export const GET = route(async () => {
  const user = await requireUser();
  const settings = await getSettings();

  const link = await prisma.telegramLink.findUnique({
    where: { userId: user.id },
    select: { chatId: true, username: true, firstName: true, active: true, linkedAt: true, lastSeenAt: true },
  });

  let botUsername = settings.telegramBotUsername;
  if (!botUsername && telegramConfigured()) {
    const info = await getBotInfo();
    if (info?.username) {
      botUsername = info.username;
      const { setSettings } = await import('@/lib/settings');
      await setSettings({ telegramBotUsername: info.username }).catch(() => null);
    }
  }

  return ok({
    available: settings.telegramEnabled && telegramConfigured(),
    botUsername,
    botLink: botUsername ? `https://t.me/${botUsername}` : null,
    linked: Boolean(link),
    link,
  });
});

/** ساخت کد یک‌بارمصرف برای اتصال حساب به ربات */
export const POST = route(async () => {
  await assertSameOrigin();
  const user = await requireUser();
  await enforceRateLimit(`tg-link:${user.id}`, 10, 900, { persistent: true });

  const settings = await getSettings();
  if (!settings.telegramEnabled || !telegramConfigured()) {
    throw new ApiError('ربات تلگرام در حال حاضر فعال نیست. با پشتیبانی تماس بگیرید.', 400, { code: 'disabled' });
  }

  // کدهای قبلی این کاربر باطل می‌شوند
  await prisma.telegramLinkCode.deleteMany({ where: { userId: user.id, usedAt: null } });

  const code = makeCode();
  await prisma.telegramLinkCode.create({
    data: {
      code,
      userId: user.id,
      expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
    },
  });

  let botUsername = settings.telegramBotUsername;
  if (!botUsername) {
    const info = await getBotInfo();
    botUsername = info?.username ?? '';
  }

  return ok({
    code,
    expiresInMinutes: CODE_TTL_MINUTES,
    botUsername,
    // با این لینک، تلگرام کد را خودکار برای ربات می‌فرستد
    deepLink: botUsername ? `https://t.me/${botUsername}?start=${code}` : null,
    message: 'کد ساخته شد. آن را در ربات بفرستید یا روی دکمه اتصال بزنید.',
  });
});

/** ارسال پیام آزمایشی برای اطمینان از کارکرد اتصال */
export const PUT = route(async () => {
  await assertSameOrigin();
  const user = await requireUser();
  await enforceRateLimit(`tg-test:${user.id}`, 5, 300, { persistent: true });

  const link = await prisma.telegramLink.findUnique({ where: { userId: user.id } });
  if (!link) throw new ApiError('حساب تلگرام شما متصل نیست.', 400, { code: 'not_linked' });

  if (!link.active) {
    await prisma.telegramLink.update({ where: { userId: user.id }, data: { active: true } });
  }

  const sent = await sendToUser(
    user.id,
    '🔔 <b>پیام آزمایشی</b>\n\nاتصال شما درست کار می‌کند. از این پس اعلان‌های مهم را همین‌جا دریافت می‌کنید.',
  );

  if (!sent) {
    throw new ApiError(
      'ارسال پیام ناموفق بود. احتمالاً ربات را بلاک کرده‌اید؛ در تلگرام آن را آنبلاک و دوباره تلاش کنید.',
      502,
      { code: 'send_failed' },
    );
  }

  return ok({ sent: true, message: 'پیام آزمایشی ارسال شد. تلگرام خود را بررسی کنید.' });
});

export const DELETE = route(async () => {
  await assertSameOrigin();
  const user = await requireUser();

  await prisma.telegramLink.deleteMany({ where: { userId: user.id } });
  await prisma.telegramLinkCode.deleteMany({ where: { userId: user.id } });

  await audit({
    userId: user.id,
    action: 'telegram.unlink',
    entity: 'user',
    entityId: user.id,
    ip: await clientIp(),
  });

  return ok({ unlinked: true, message: 'اتصال تلگرام قطع شد.' });
});
