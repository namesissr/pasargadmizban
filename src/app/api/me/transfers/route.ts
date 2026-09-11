import { ok, route } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { listTransfers } from '@/lib/transfer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** فهرست درخواست‌های انتقال ورودی و خروجی کاربر */
export const GET = route(async () => {
  const user = await requireUser();
  const { incoming, outgoing } = await listTransfers(user.id);

  return ok({
    incoming: incoming.map((t) => ({
      id: t.id,
      note: t.note,
      createdAt: t.createdAt.toISOString(),
      expiresAt: t.expiresAt.toISOString(),
      server: t.server,
      from: [t.fromUser.firstName, t.fromUser.lastName].filter(Boolean).join(' ') || t.fromUser.email,
      fromEmail: t.fromUser.email,
    })),
    outgoing: outgoing.map((t) => ({
      id: t.id,
      status: t.status,
      note: t.note,
      createdAt: t.createdAt.toISOString(),
      expiresAt: t.expiresAt.toISOString(),
      server: t.server,
      to: [t.toUser.firstName, t.toUser.lastName].filter(Boolean).join(' ') || t.toUser.email,
      toEmail: t.toUser.email,
    })),
  });
});
