import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireAdmin, requireStaff, clientIp, assertSameOrigin, revokeAllSessions } from '@/lib/auth';
import { adminUserUpdateSchema } from '@/lib/validation';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, ctx: Ctx) => {
  await requireStaff();
  const { id } = await ctx.params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      emailVerifiedAt: true,
      phone: true,
      firstName: true,
      lastName: true,
      company: true,
      nationalId: true,
      address: true,
      city: true,
      province: true,
      postalCode: true,
      role: true,
      status: true,
      balance: true,
      creditLimit: true,
      discountPct: true,
      maxServers: true,
      notes: true,
      referralCode: true,
      createdAt: true,
      lastLoginAt: true,
      lastLoginIp: true,
      servers: {
        where: { status: { not: 'DELETED' } },
        select: {
          id: true,
          name: true,
          status: true,
          serverTypeName: true,
          locationName: true,
          ipv4: true,
          billingCycle: true,
          priceMonthly: true,
          expiresAt: true,
        },
      },
      _count: { select: { servers: true, tickets: true, transactions: true, referrals: true } },
    },
  });

  if (!user) throw new ApiError('کاربر یافت نشد.', 404);

  const [transactions, tickets] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.ticket.findMany({
      where: { userId: id },
      orderBy: { lastReplyAt: 'desc' },
      take: 10,
      select: { id: true, number: true, subject: true, status: true, priority: true, lastReplyAt: true },
    }),
  ]);

  return ok({ ...user, transactions, tickets });
});

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true, status: true },
  });
  if (!target) throw new ApiError('کاربر یافت نشد.', 404);

  const input = await parseBody(req, adminUserUpdateSchema);

  // مدیر نمی‌تواند نقش خودش را پایین بیاورد (جلوگیری از قفل شدن سیستم)
  if (target.id === admin.id && input.role && input.role !== 'ADMIN') {
    throw new ApiError('نمی‌توانید نقش مدیریتی خودتان را تغییر دهید.', 400);
  }
  if (target.id === admin.id && input.status && input.status !== 'ACTIVE') {
    throw new ApiError('نمی‌توانید حساب خودتان را غیرفعال کنید.', 400);
  }
  if (input.role && input.role !== 'ADMIN' && target.role === 'ADMIN') {
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN', deletedAt: null } });
    if (adminCount <= 1) throw new ApiError('حداقل یک مدیر باید در سیستم باقی بماند.', 400);
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(input.role ? { role: input.role } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.discountPct !== undefined ? { discountPct: input.discountPct } : {}),
      ...(input.maxServers !== undefined ? { maxServers: input.maxServers } : {}),
      ...(input.creditLimit !== undefined ? { creditLimit: BigInt(input.creditLimit) } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.emailVerified !== undefined
        ? { emailVerifiedAt: input.emailVerified ? new Date() : null }
        : {}),
    },
    select: { id: true, role: true, status: true, discountPct: true, maxServers: true, creditLimit: true },
  });

  // کاربر مسدود یا معلق → ابطال نشست‌ها
  if (input.status === 'BANNED' || input.status === 'SUSPENDED') {
    await revokeAllSessions(id);
  }

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.user_update',
    entity: 'user',
    entityId: id,
    ip: await clientIp(),
    meta: { changes: input, targetEmail: target.email },
  });

  if (input.status && input.status !== target.status) {
    const messages: Record<string, string> = {
      ACTIVE: 'حساب کاربری شما فعال شد.',
      SUSPENDED: 'حساب کاربری شما تعلیق شد. برای پیگیری با پشتیبانی تماس بگیرید.',
      BANNED: 'حساب کاربری شما مسدود شد.',
      PENDING: 'حساب کاربری شما در انتظار تایید است.',
    };
    await notify(id, {
      type: input.status === 'ACTIVE' ? 'success' : 'error',
      title: 'وضعیت حساب کاربری تغییر کرد',
      body: messages[input.status],
      email: true,
    });
  }

  return ok({ ...updated, message: 'اطلاعات کاربر به‌روزرسانی شد.' });
});

/** حذف نرم کاربر */
export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  if (id === admin.id) throw new ApiError('نمی‌توانید حساب خودتان را حذف کنید.', 400);

  const activeServers = await prisma.server.count({
    where: { userId: id, status: { notIn: ['DELETED'] } },
  });
  if (activeServers > 0) {
    throw new ApiError(`این کاربر ${activeServers} سرور فعال دارد. ابتدا سرورها را حذف کنید.`, 400);
  }

  await prisma.user.update({
    where: { id },
    data: { deletedAt: new Date(), status: 'BANNED' },
  });
  await revokeAllSessions(id);

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.user_delete',
    entity: 'user',
    entityId: id,
    ip: await clientIp(),
  });

  return ok({ deleted: true, message: 'حساب کاربر غیرفعال شد.' });
});
