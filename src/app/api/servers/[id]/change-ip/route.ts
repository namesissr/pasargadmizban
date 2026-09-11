import { z } from 'zod';
import { ok, parseBody, route } from '@/lib/api';
import { requireUser, clientIp, clientUserAgent, assertSameOrigin } from '@/lib/auth';
import { getOwnedServer } from '@/lib/server-access';
import { changeServerIp, ipChangeStatus } from '@/lib/ip-change';
import { enforceRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

/** وضعیت، هزینه و تاریخچه تعویض آدرس */
export const GET = route(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const server = await getOwnedServer(id, user, { allowDeleted: true });

  return ok(await ipChangeStatus(server));
});

const schema = z.object({
  confirm: z.literal(true, { errorMap: () => ({ message: 'برای ادامه باید تایید کنید.' }) }),
  reason: z.string().trim().max(200).optional().or(z.literal('')),
});

/** اجرای تعویض آدرس IPv4 */
export const POST = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireUser();
  const { id } = await ctx.params;

  // محافظ اضافه در کنار سقف ماهانه
  await enforceRateLimit(`ip-change:${user.id}`, 6, 3600, { persistent: true });

  const server = await getOwnedServer(id, user, { requireHetzner: true });
  const input = await parseBody(req, schema);

  const result = await changeServerIp({
    server,
    userId: user.id,
    reason: input.reason || undefined,
    ip: await clientIp(),
    userAgent: await clientUserAgent(),
  });

  return ok({
    ...result,
    fee: Number(result.fee),
    message: `آدرس سرور با موفقیت به ${result.newIp} تغییر کرد. تنظیمات DNS و اتصال‌های خود را به‌روز کنید.`,
  });
});
