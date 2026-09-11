import prisma from '@/lib/prisma';
import { ok, route, ApiError } from '@/lib/api';
import { requireUser, assertSameOrigin } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const staff = user.role === 'ADMIN' || user.role === 'SUPPORT';

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      department: true,
      server: { select: { id: true, name: true, ipv4: true } },
      user: { select: { id: true, email: true, firstName: true, lastName: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
      },
    },
  });

  if (!ticket) throw new ApiError('تیکت یافت نشد.', 404);
  if (!staff && ticket.userId !== user.id) throw new ApiError('به این تیکت دسترسی ندارید.', 403);

  // علامت خوانده‌شدن
  if (staff && ticket.unreadByStaff) {
    await prisma.ticket.update({ where: { id: ticket.id }, data: { unreadByStaff: false } });
  } else if (!staff && ticket.unreadByUser) {
    await prisma.ticket.update({ where: { id: ticket.id }, data: { unreadByUser: false } });
  }

  return ok(ticket);
});

/** بستن تیکت توسط کاربر */
export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireUser();
  const { id } = await ctx.params;

  const ticket = await prisma.ticket.findUnique({ where: { id }, select: { id: true, userId: true, status: true } });
  if (!ticket) throw new ApiError('تیکت یافت نشد.', 404);
  if (ticket.userId !== user.id && user.role === 'USER') {
    throw new ApiError('به این تیکت دسترسی ندارید.', 403);
  }
  if (ticket.status === 'CLOSED') throw new ApiError('این تیکت قبلاً بسته شده است.', 400);

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: 'CLOSED', closedAt: new Date() },
  });

  await audit({ userId: user.id, action: 'ticket.close', entity: 'ticket', entityId: ticket.id });

  return ok({ closed: true, message: 'تیکت بسته شد. در صورت نیاز می‌توانید تیکت جدیدی باز کنید.' });
});
