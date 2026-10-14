import prisma from '@/lib/prisma';
import { ok, route, ApiError } from '@/lib/api';
import { requireAdmin, clientIp, assertSameOrigin } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** حذف یک خروجی بارگذاری‌شده */
export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  const row = await prisma.gscImport.findUnique({ where: { id }, select: { id: true, fileName: true, scope: true } });
  if (!row) throw new ApiError('این خروجی پیدا نشد.', 404);
  await prisma.gscImport.delete({ where: { id } });

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.gsc_import_delete',
    entity: 'gsc_import',
    entityId: id,
    ip: await clientIp(),
    meta: { fileName: row.fileName, scope: row.scope },
  });

  return ok({ message: 'خروجی حذف شد.' });
});
