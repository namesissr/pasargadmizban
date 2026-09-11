import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireStaff, clientIp, assertSameOrigin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  status: z.enum(['OPEN', 'ANSWERED', 'CUSTOMER_REPLY', 'ON_HOLD', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  departmentId: z.string().max(40).optional().nullable(),
});

export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const staff = await requireStaff();
  const { id } = await ctx.params;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: { id: true, number: true, userId: true, status: true, subject: true },
  });
  if (!ticket) throw new ApiError('تیکت یافت نشد.', 404);

  const input = await parseBody(req, updateSchema);

  const updated = await prisma.ticket.update({
    where: { id },
    data: {
      ...(input.status ? { status: input.status, closedAt: input.status === 'CLOSED' ? new Date() : null } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
      ...(input.departmentId !== undefined ? { departmentId: input.departmentId || null } : {}),
    },
    select: { id: true, status: true, priority: true, departmentId: true },
  });

  await audit({
    userId: staff.id,
    actorType: 'admin',
    action: 'admin.ticket_update',
    entity: 'ticket',
    entityId: id,
    ip: await clientIp(),
    meta: input,
  });

  if (input.status === 'CLOSED' && ticket.status !== 'CLOSED') {
    await notify(ticket.userId, {
      type: 'info',
      title: `تیکت #${ticket.number} بسته شد`,
      body: ticket.subject,
      link: `/dashboard/tickets/${ticket.id}`,
    });
  }

  return ok({ ...updated, message: 'تیکت به‌روزرسانی شد.' });
});
