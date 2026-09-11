import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireUser, clientIp, assertSameOrigin } from '@/lib/auth';
import { replyTicketSchema } from '@/lib/validation';
import { enforceRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { notify, notifyStaff } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireUser();
  const { id } = await ctx.params;
  const staff = user.role === 'ADMIN' || user.role === 'SUPPORT';

  await enforceRateLimit(`ticket-reply:${user.id}`, 30, 600, { persistent: true });

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: { id: true, number: true, userId: true, status: true, subject: true },
  });
  if (!ticket) throw new ApiError('تیکت یافت نشد.', 404);
  if (!staff && ticket.userId !== user.id) throw new ApiError('به این تیکت دسترسی ندارید.', 403);
  if (ticket.status === 'CLOSED' && !staff) {
    throw new ApiError('این تیکت بسته شده است. لطفاً تیکت جدیدی باز کنید.', 400);
  }

  const input = await parseBody(req, replyTicketSchema);

  const message = await prisma.ticketMessage.create({
    data: { ticketId: ticket.id, userId: user.id, isStaff: staff, body: input.body },
  });

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      lastReplyAt: new Date(),
      status: input.closeTicket ? 'CLOSED' : staff ? 'ANSWERED' : 'CUSTOMER_REPLY',
      closedAt: input.closeTicket ? new Date() : null,
      unreadByUser: staff,
      unreadByStaff: !staff,
    },
  });

  await audit({
    userId: user.id,
    action: 'ticket.reply',
    entity: 'ticket',
    entityId: ticket.id,
    ip: await clientIp(),
    meta: { staff, closed: input.closeTicket },
  });

  if (staff) {
    await notify(ticket.userId, {
      type: 'info',
      title: `پاسخ جدید به تیکت #${ticket.number}`,
      body: ticket.subject,
      link: `/dashboard/tickets/${ticket.id}`,
      email: true,
    });
  } else {
    await notifyStaff({
      type: 'info',
      title: `پاسخ مشتری در تیکت #${ticket.number}`,
      body: ticket.subject,
      link: `/admin/tickets/${ticket.id}`,
    });
  }

  return ok({ id: message.id, createdAt: message.createdAt, closed: input.closeTicket });
});
