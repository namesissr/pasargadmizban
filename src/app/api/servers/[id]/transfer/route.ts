import { ok, parseBody, route } from '@/lib/api';
import { requireUser, assertSameOrigin } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { createTransfer } from '@/lib/transfer';
import { createTransferSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** درخواست انتقال سرور به کاربر دیگر */
export const POST = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireUser();
  const { id } = await ctx.params;

  await enforceRateLimit(`server-transfer:${user.id}`, 10, 3600);

  const input = await parseBody(req, createTransferSchema);
  const res = await createTransfer({
    serverId: id,
    fromUser: user,
    toEmail: input.toEmail,
    note: input.note || undefined,
  });

  return ok({ id: res.id, toName: res.toName, message: `درخواست انتقال به ${res.toName} ارسال شد.` });
});
