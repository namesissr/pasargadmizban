import { z } from 'zod';
import { ok, parseBody, route } from '@/lib/api';
import { requireUser, clientIp, assertSameOrigin } from '@/lib/auth';
import { redeemGiftCode, checkCode, describePromo } from '@/lib/promo';
import { enforceRateLimit } from '@/lib/rate-limit';
import { formatToman } from '@/lib/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  code: z.string().trim().min(3, 'کد را وارد کنید.').max(32),
});

/** استفاده از کد هدیه — اعتبار مستقیم به کیف پول */
export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const user = await requireUser();
  // حدس زدن کد نباید ارزان باشد
  await enforceRateLimit(`promo-redeem:${user.id}`, 10, 600, { persistent: true });

  const { code } = await parseBody(req, schema);
  const result = await redeemGiftCode(code, user.id, await clientIp());

  return ok({
    amount: Number(result.amount),
    message: `${formatToman(result.amount)} هدیه کد «${result.code}» به کیف پول شما اضافه شد.`,
  });
});

/** پیش‌بررسی یک کد (برای نمایش توضیح پیش از پرداخت) */
export const PUT = route(async (req: Request) => {
  await assertSameOrigin();
  const user = await requireUser();
  await enforceRateLimit(`promo-check:${user.id}`, 30, 600, { persistent: true });

  const { code } = await parseBody(req, schema);
  const result = await checkCode(code, user.id);
  if (!result.ok) return ok({ valid: false, message: result.reason });

  return ok({
    valid: true,
    kind: result.promo.kind,
    message: describePromo(result.promo),
  });
});
