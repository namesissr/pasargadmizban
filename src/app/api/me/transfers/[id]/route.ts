import { ok, parseBody, route } from '@/lib/api';
import { requireUser, assertSameOrigin } from '@/lib/auth';
import { acceptTransfer, rejectTransfer, cancelTransfer } from '@/lib/transfer';
import { transferActionSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** پاسخ به یک درخواست انتقال: پذیرش/رد (گیرنده) یا لغو (فرستنده) */
export const POST = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireUser();
  const { id } = await ctx.params;
  const { action } = await parseBody(req, transferActionSchema);

  if (action === 'accept') {
    const res = await acceptTransfer(id, user);
    return ok({ message: `سرور «${res.serverName}» به حساب شما منتقل شد.`, serverId: res.serverId });
  }
  if (action === 'reject') {
    await rejectTransfer(id, user);
    return ok({ message: 'درخواست انتقال رد شد.' });
  }
  await cancelTransfer(id, user);
  return ok({ message: 'درخواست انتقال لغو شد.' });
});
