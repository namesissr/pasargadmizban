import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireAdmin, assertSameOrigin, clientIp, revokeAllSessions } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notify';
import { TASK_ROLE_FA } from '@/lib/dev-tasks-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ uid: string }> };

const schema = z.object({
  /** USER یعنی بدون دسترسی به میز کار */
  role: z.enum(['USER', 'EMPLOYER', 'DEVELOPER', 'SUPPORT']).optional(),
  /** غیرفعال کردن حساب کسی که از تیم رفته؛ همه نشست‌هایش هم بسته می‌شود */
  active: z.boolean().optional(),
});

/** تغییر نقش یا فعال/غیرفعال کردن عضو — فقط مدیر سایت */
export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { uid } = await ctx.params;
  const input = await parseBody(req, schema);

  const target = await prisma.user.findUnique({ where: { id: uid }, select: { id: true, role: true, status: true, deletedAt: true } });
  if (!target || target.deletedAt) throw new ApiError('کاربر پیدا نشد.', 404);
  if (target.id === admin.id) throw new ApiError('نقش یا وضعیت حساب خودتان را از اینجا نمی‌توانید تغییر دهید.', 400);
  if (target.role === 'ADMIN') throw new ApiError('حساب مدیر سایت از اینجا قابل تغییر نیست.', 400);

  const data: { role?: typeof input.role; status?: 'ACTIVE' | 'SUSPENDED' } = {};
  if (input.role && input.role !== target.role) data.role = input.role;
  if (input.active !== undefined) data.status = input.active ? 'ACTIVE' : 'SUSPENDED';
  if (!Object.keys(data).length) return ok({ id: target.id, changed: false });

  await prisma.user.update({ where: { id: target.id }, data });
  if (data.status === 'SUSPENDED') await revokeAllSessions(target.id);

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.user_update',
    entity: 'user',
    entityId: target.id,
    ip: await clientIp(),
    meta: { ...data, via: 'tasks.members' },
  });

  if (data.role && data.role !== 'USER') {
    await notify(target.id, {
      kind: 'security',
      type: 'success',
      title: `نقش شما «${TASK_ROLE_FA[data.role]}» شد`,
      body: 'اکنون به میز کار تسک‌ها دسترسی دارید.',
      link: data.role === 'DEVELOPER' ? '/dev' : '/tasks',
    });
  }
  return ok({ id: target.id, changed: true });
});
