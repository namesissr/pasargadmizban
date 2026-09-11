import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireUser, assertSameOrigin, clientIp } from '@/lib/auth';
import { clientForServer } from '@/lib/hetzner-accounts';
import { getOwnedServer, assertOperable } from '@/lib/server-access';
import { snapshotSchema } from '@/lib/validation';
import { HetznerError } from '@/lib/hetzner';
import { snapshotPricePerGb } from '@/lib/pricing';
import { canAfford } from '@/lib/wallet';
import { enforceRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** لیست اسنپ‌شات‌ها و نسخه‌های پشتیبان این سرور */
export const GET = route(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const server = await getOwnedServer(id, user);

  const snapshots = await prisma.snapshot.findMany({
    where: { serverId: server.id },
    orderBy: { createdAt: 'desc' },
  });

  let backups: { id: number; description: string; created: string; sizeGb: number }[] = [];
  if (server.hetznerId && server.backupsEnabled) {
    try {
      const list = await (await clientForServer(server)).listBackups(server.hetznerId);
      backups = list.map((b) => ({
        id: b.id,
        description: b.description,
        created: b.created,
        sizeGb: b.image_size ?? 0,
      }));
    } catch {
      backups = [];
    }
  }

  const perGb = await snapshotPricePerGb();

  return ok({
    snapshots: snapshots.map((s) => ({
      id: s.id,
      hetznerImageId: Number(s.hetznerImageId),
      description: s.description,
      sizeGb: s.sizeGb,
      priceMonthly: Number(s.priceMonthly),
      createdAt: s.createdAt,
    })),
    backups,
    pricePerGbMonth: Number(perGb),
    backupsEnabled: server.backupsEnabled,
  });
});

/** ساخت اسنپ‌شات جدید */
export const POST = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireUser();
  const { id } = await ctx.params;

  await enforceRateLimit(`snapshot:${user.id}`, 10, 3600, { persistent: true });

  const server = await getOwnedServer(id, user, { requireHetzner: true });
  assertOperable(server);

  const { description } = await parseBody(req, snapshotSchema);

  const perGb = await snapshotPricePerGb();
  const estimate = perGb * BigInt(Math.max(1, server.disk));
  if (!(await canAfford(user.id, estimate))) {
    throw new ApiError(
      'برای ساخت اسنپ‌شات باید حداقل معادل هزینه یک ماه نگهداری آن موجودی داشته باشید.',
      402,
      { code: 'insufficient_funds' },
    );
  }

  const res = await (await clientForServer(server)).createImage(server.hetznerId!, description, 'snapshot');

  const snapshot = await prisma.snapshot.create({
    data: {
      userId: user.id,
      serverId: server.id,
      accountId: server.hetznerAccountId,
      hetznerImageId: BigInt(res.image.id),
      description,
      sizeGb: res.image.image_size ?? 0,
      priceMonthly: perGb * BigInt(Math.ceil(res.image.image_size ?? server.disk)),
    },
  });

  await prisma.serverAction.create({
    data: {
      serverId: server.id,
      userId: user.id,
      action: 'create_image',
      hetznerActionId: BigInt(res.action.id),
      status: 'RUNNING',
      meta: { description },
    },
  });

  await audit({
    userId: user.id,
    action: 'server.action',
    entity: 'snapshot',
    entityId: snapshot.id,
    ip: await clientIp(),
    meta: { operation: 'create_image', serverId: server.id },
  });

  return ok({
    id: snapshot.id,
    message: 'ساخت اسنپ‌شات آغاز شد. هزینه نگهداری آن ماهانه بر اساس حجم محاسبه می‌شود.',
  });
});

const deleteSchema = z.object({ snapshotId: z.string().min(1) });

export const DELETE = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireUser();
  const { id } = await ctx.params;
  const server = await getOwnedServer(id, user, { allowDeleted: true });

  const { snapshotId } = await parseBody(req, deleteSchema);

  const snapshot = await prisma.snapshot.findUnique({ where: { id: snapshotId } });
  if (!snapshot) throw new ApiError('اسنپ‌شات یافت نشد.', 404);
  if (snapshot.userId !== user.id && user.role !== 'ADMIN') {
    throw new ApiError('به این اسنپ‌شات دسترسی ندارید.', 403);
  }

  try {
    const { clientForAccount } = await import('@/lib/hetzner-accounts');
    const client = snapshot.accountId
      ? await clientForAccount(snapshot.accountId)
      : await clientForServer(server);
    await client.deleteImage(snapshot.hetznerImageId);
  } catch (err) {
    if (!(err instanceof HetznerError && err.code === 'not_found')) throw err;
  }

  await prisma.snapshot.delete({ where: { id: snapshot.id } });

  return ok({ deleted: true, message: 'اسنپ‌شات حذف شد و هزینه نگهداری آن متوقف گردید.' });
});
