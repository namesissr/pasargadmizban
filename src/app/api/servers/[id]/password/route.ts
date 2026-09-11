import prisma from '@/lib/prisma';
import { ok, route, ApiError } from '@/lib/api';
import { requireUser, clientIp, assertSameOrigin } from '@/lib/auth';
import { getOwnedServer } from '@/lib/server-access';
import { decrypt } from '@/lib/crypto';
import { enforceRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * بازیابی رمز روت ذخیره‌شده.
 * از POST استفاده می‌کنیم تا در تاریخچه مرورگر و لاگ‌های واسط ثبت نشود.
 */
export const POST = route(async (_req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireUser();
  const { id } = await ctx.params;

  await enforceRateLimit(`root-pass:${user.id}`, 20, 600, { persistent: true });

  const server = await getOwnedServer(id, user);

  const row = await prisma.server.findUnique({
    where: { id: server.id },
    select: { rootPasswordEnc: true },
  });

  const password = decrypt(row?.rootPasswordEnc);
  if (!password) {
    throw new ApiError(
      'رمز روتی برای این سرور ذخیره نشده است. اگر با کلید SSH ساخته شده، از کلید خود استفاده کنید یا رمز را بازنشانی کنید.',
      404,
      { code: 'no_password' },
    );
  }

  await audit({
    userId: user.id,
    action: 'server.action',
    entity: 'server',
    entityId: server.id,
    ip: await clientIp(),
    meta: { operation: 'view_root_password' },
  });

  return ok({ username: 'root', password });
});
