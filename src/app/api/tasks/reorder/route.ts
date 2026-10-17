import prisma from '@/lib/prisma';
import { ok, parseBody, route } from '@/lib/api';
import { requireTaskManager, assertSameOrigin } from '@/lib/auth';
import { devTaskReorderSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ترتیب دستی کارت‌های یک ستون تخته — کارفرما با جابه‌جایی کارت‌ها اولویت اجرا را تعیین می‌کند */
export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  await requireTaskManager();
  const { ids } = await parseBody(req, devTaskReorderSchema);

  await prisma.$transaction(
    ids.map((id, i) => prisma.devTask.updateMany({ where: { id }, data: { sortOrder: i * 10 } })),
  );
  return ok({ updated: ids.length });
});
