import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, parseBody, route } from '@/lib/api';
import { requireAdmin, requireStaff, clientIp, assertSameOrigin } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createSchema = z.object({
  title: z.string().trim().min(3, 'عنوان را وارد کنید.').max(120),
  body: z.string().trim().min(5, 'متن اعلان را وارد کنید.').max(2000),
  level: z.enum(['info', 'success', 'warning', 'error']).default('info'),
  pinned: z.boolean().optional().default(false),
  active: z.boolean().optional().default(true),
});

/** فهرست اعلان‌های سایت */
export const GET = route(async () => {
  await requireStaff();
  const items = await prisma.announcement.findMany({
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  });
  return ok({ items });
});

/** ساخت اعلان تازه */
export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const input = await parseBody(req, createSchema);

  // فقط یک اعلان می‌تواند سنجاق شده باشد تا بالای داشبورد شلوغ نشود
  if (input.pinned) {
    await prisma.announcement.updateMany({ where: { pinned: true }, data: { pinned: false } });
  }

  const announcement = await prisma.announcement.create({ data: input });

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.announcement_create',
    entity: 'announcement',
    entityId: announcement.id,
    ip: await clientIp(),
    meta: { title: announcement.title, level: announcement.level, pinned: announcement.pinned },
  });

  return ok({ announcement, message: 'اعلان ساخته شد.' }, { status: 201 });
});
