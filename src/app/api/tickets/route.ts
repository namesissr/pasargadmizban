import prisma from '@/lib/prisma';
import { ok, paged, pagination, parseBody, route, ApiError } from '@/lib/api';
import { requireUser, clientIp, assertSameOrigin } from '@/lib/auth';
import { createTicketSchema } from '@/lib/validation';
import { enforceRateLimit, LIMITS } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { notifyStaff } from '@/lib/notify';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async (req: Request) => {
  const user = await requireUser();
  const { page, perPage, skip, take } = pagination(req);
  const status = new URL(req.url).searchParams.get('status');

  const where: Prisma.TicketWhereInput = {
    userId: user.id,
    ...(status && status !== 'ALL' ? { status: status as never } : {}),
  };

  const [items, total, departments, openCount] = await Promise.all([
    prisma.ticket.findMany({
      where,
      orderBy: { lastReplyAt: 'desc' },
      skip,
      take,
      include: {
        department: { select: { name: true } },
        server: { select: { id: true, name: true } },
        _count: { select: { messages: true } },
      },
    }),
    prisma.ticket.count({ where }),
    prisma.ticketDepartment.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.ticket.count({ where: { userId: user.id, status: { notIn: ['CLOSED'] } } }),
  ]);

  return ok({ ...paged(items, total, page, perPage), departments, openCount });
});

export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const user = await requireUser();
  await enforceRateLimit(`ticket:${user.id}`, LIMITS.ticket.limit, LIMITS.ticket.window, { persistent: true });

  const input = await parseBody(req, createTicketSchema);

  const openTickets = await prisma.ticket.count({
    where: { userId: user.id, status: { notIn: ['CLOSED'] } },
  });
  if (openTickets >= 15) {
    throw new ApiError('تعداد تیکت‌های باز شما زیاد است. ابتدا تیکت‌های قبلی را پیگیری کنید.', 429);
  }

  if (input.serverId) {
    const owns = await prisma.server.findFirst({
      where: { id: input.serverId, userId: user.id },
      select: { id: true },
    });
    if (!owns) throw new ApiError('سرور انتخابی متعلق به شما نیست.', 403);
  }

  const ticket = await prisma.ticket.create({
    data: {
      userId: user.id,
      subject: input.subject,
      priority: input.priority,
      departmentId: input.departmentId || null,
      serverId: input.serverId || null,
      status: 'OPEN',
      unreadByStaff: true,
      messages: {
        create: [{ userId: user.id, isStaff: false, body: input.body }],
      },
    },
    select: { id: true, number: true, subject: true },
  });

  await audit({
    userId: user.id,
    action: 'ticket.create',
    entity: 'ticket',
    entityId: ticket.id,
    ip: await clientIp(),
    meta: { subject: input.subject, priority: input.priority },
  });

  await notifyStaff({
    type: input.priority === 'URGENT' ? 'error' : 'info',
    title: `تیکت جدید #${ticket.number}`,
    body: `${input.subject} — از ${user.email}`,
    link: `/admin/tickets/${ticket.id}`,
  });

  return ok(ticket, { status: 201 });
});
