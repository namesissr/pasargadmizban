import prisma from '@/lib/prisma';
import { ok, route, ApiError } from '@/lib/api';
import { requireUser, clientIp, assertSameOrigin } from '@/lib/auth';
import { removeKeyEverywhere } from '@/lib/ssh-sync';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireUser();
  const { id } = await ctx.params;

  const key = await prisma.sshKey.findUnique({ where: { id } });
  if (!key) throw new ApiError('کلید یافت نشد.', 404);
  if (key.userId !== user.id) throw new ApiError('به این کلید دسترسی ندارید.', 403);

  // اگر روی سروری در حال استفاده است، هشدار می‌دهیم ولی مانع حذف نمی‌شویم
  const servers = await prisma.server.findMany({
    where: { userId: user.id, status: { not: 'DELETED' } },
    select: { id: true, name: true, sshKeyIds: true },
  });
  const inUse = servers.filter((s) => Array.isArray(s.sshKeyIds) && (s.sshKeyIds as string[]).includes(key.id));

  // کلید ممکن است در چند حساب هتزنر آپلود شده باشد
  const result = await removeKeyEverywhere(key.id);

  await prisma.sshKey.delete({ where: { id: key.id } });

  await audit({
    userId: user.id,
    action: 'sshkey.delete',
    entity: 'ssh_key',
    entityId: key.id,
    ip: await clientIp(),
    meta: { removedFromAccounts: result.removed, failed: result.failed },
  });

  return ok({
    deleted: true,
    warning: inUse.length
      ? `این کلید روی ${inUse.length} سرور استفاده شده بود. دسترسی موجود روی آن سرورها تا زمانی که فایل authorized_keys را تغییر ندهید باقی می‌ماند.`
      : null,
  });
});
