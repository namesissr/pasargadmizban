import prisma from '@/lib/prisma';
import { ok, route, ApiError } from '@/lib/api';
import { requireTaskMember, assertSameOrigin } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { sendSmsDetailed } from '@/lib/sms';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** وضعیت پیامک تسک‌ها برای کاربر جاری: سرویس تنظیم شده و شماره دارد یا نه */
export const GET = route(async () => {
  const user = await requireTaskMember();
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { phone: true } });
  return ok({ configured: env.sms.enabled, provider: env.sms.provider, phone: row?.phone ?? null });
});

/** پیامک آزمایشی به شماره خود کاربر — خطای دقیق کاوه‌نگار را برمی‌گرداند */
export const POST = route(async () => {
  await assertSameOrigin();
  const user = await requireTaskMember();
  await enforceRateLimit(`task-sms-test:${user.id}`, 5, 3600);
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { phone: true } });
  if (!row?.phone) throw new ApiError('اول شماره موبایل خود را در همین صفحه ثبت کنید.', 422);

  const result = await sendSmsDetailed(
    row.phone,
    `میز کار ${env.appName}\nپیامک آزمایشی: اعلان تسک‌ها از این پس با پیامک به این شماره می‌رسد.`,
  );
  if (!result.ok) throw new ApiError(result.error ?? 'ارسال پیامک ناموفق بود.', 502);
  return ok({ sent: true, phone: row.phone });
});
