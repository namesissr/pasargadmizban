import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireAdmin, clientIp, assertSameOrigin } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  body: z.string().trim().min(5).max(2000).optional(),
  level: z.enum(['info', 'success', 'warning', 'error']).optional(),
  pinned: z.boolean().optional(),
  active: z.boolean().optional(),
});

async function find(id: string) {
  const announcement = await prisma.announcement.findUnique({ where: { id } });
  if (!announcement) throw new ApiError('اعلان یافت نشد.', 404);
  return announcement;
}

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  await find(id);

  const input = await parseBody(req, patchSchema);

  if (input.pinned) {
    await prisma.announcement.updateMany({ where: { pinned: true, id: { not: id } }, data: { pinned: false } });
  }

  const announcement = await prisma.announcement.update({ where: { id }, data: input });

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.announcement_update',
    entity: 'announcement',
    entityId: id,
    ip: await clientIp(),
    meta: input,
  });

  return ok({ announcement, message: 'اعلان به‌روزرسانی شد.' });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { id } = await ctx.params;
  const announcement = await find(id);

  await prisma.announcement.delete({ where: { id } });

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.announcement_delete',
    entity: 'announcement',
    entityId: id,
    ip: await clientIp(),
    meta: { title: announcement.title },
  });

  return ok({ deleted: true, message: 'اعلان حذف شد.' });
});
