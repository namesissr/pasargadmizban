import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireAdmin, requireTaskManager, assertSameOrigin, clientIp } from '@/lib/auth';
import { env } from '@/lib/env';
import { audit } from '@/lib/audit';
import { emailSchema } from '@/lib/validation';
import { OPEN_STATUSES } from '@/lib/dev-tasks-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TEAM_ROLES = ['ADMIN', 'EMPLOYER', 'SUPPORT', 'DEVELOPER'] as const;

/**
 * اعضای تیم و نقش‌هایشان. در حالت «فقط سیستم تسک» همه کاربران (از جمله تازه‌واردهایی
 * که هنوز نقش ندارند) نشان داده می‌شوند؛ در حالت کامل فقط اعضای میز کار، تا
 * مشتری‌های سایت برای کارفرما قابل مشاهده نباشند.
 */
export const GET = route(async () => {
  const me = await requireTaskManager();
  const users = await prisma.user.findMany({
    where: { deletedAt: null, ...(env.tasksOnly ? {} : { role: { in: [...TEAM_ROLES] } }) },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      status: true,
      createdAt: true,
      lastLoginAt: true,
      phone: true,
      telegramLink: { select: { active: true } },
      notificationPreference: { select: { taskSms: true } },
    },
    orderBy: [{ createdAt: 'asc' }],
  });
  const load = await prisma.devTask.groupBy({
    by: ['assigneeId'],
    where: { archivedAt: null, status: { in: OPEN_STATUSES }, assigneeId: { not: null } },
    _count: { _all: true },
  });
  const open = new Map(load.map((l) => [l.assigneeId, l._count._all]));

  return ok({
    me: { id: me.id, role: me.role },
    tasksOnly: env.tasksOnly,
    canEdit: me.role === 'ADMIN',
    smsConfigured: env.sms.enabled,
    items: users.map(({ telegramLink, notificationPreference, phone, ...u }) => ({
      ...u,
      telegram: Boolean(telegramLink?.active),
      // پیامک فقط وقتی می‌رسد که شماره ثبت شده و کلید «پیامک تسک‌ها» خاموش نشده باشد
      sms: phone ? (notificationPreference?.taskSms === false ? 'off' : 'on') : 'none',
      openTasks: open.get(u.id) ?? 0,
    })),
  });
});

/** افزودن عضو با ایمیل: کسی که در سایت ثبت‌نام کرده نقش میز کار می‌گیرد — فقط مدیر */
export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const input = await parseBody(
    req,
    z.object({ email: emailSchema, role: z.enum(['EMPLOYER', 'DEVELOPER', 'SUPPORT']) }),
  );
  const user = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true, role: true, deletedAt: true } });
  if (!user || user.deletedAt) {
    throw new ApiError('کاربری با این ایمیل پیدا نشد؛ اول باید در سایت ثبت‌نام کند.', 404, {
      fields: { email: 'ثبت‌نام نکرده است.' },
    });
  }
  if (user.role === 'ADMIN') throw new ApiError('نقش مدیر سایت از اینجا تغییر نمی‌کند.', 400);

  await prisma.user.update({ where: { id: user.id }, data: { role: input.role } });
  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.user_update',
    entity: 'user',
    entityId: user.id,
    ip: await clientIp(),
    meta: { role: input.role, from: user.role, via: 'tasks.members' },
  });
  return ok({ id: user.id, role: input.role });
});
