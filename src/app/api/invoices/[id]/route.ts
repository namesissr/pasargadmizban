import prisma from '@/lib/prisma';
import { ok, route, ApiError } from '@/lib/api';
import { requireUser, assertSameOrigin } from '@/lib/auth';
import { debit } from '@/lib/wallet';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

async function loadInvoice(id: string, userId: string, isStaff: boolean) {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      items: { include: { server: { select: { id: true, name: true } } } },
      transactions: true,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          company: true,
          address: true,
          phone: true,
          nationalId: true,
          postalCode: true,
        },
      },
    },
  });
  if (!invoice) throw new ApiError('فاکتور یافت نشد.', 404);
  if (!isStaff && invoice.userId !== userId) throw new ApiError('به این فاکتور دسترسی ندارید.', 403);
  return invoice;
}

export const GET = route(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const invoice = await loadInvoice(id, user.id, user.role !== 'USER');
  return ok(invoice);
});

/** پرداخت فاکتور از موجودی کیف پول */
export const POST = route(async (_req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireUser();
  const { id } = await ctx.params;
  const invoice = await loadInvoice(id, user.id, false);

  if (invoice.status === 'PAID') throw new ApiError('این فاکتور قبلاً پرداخت شده است.', 400);
  if (invoice.status === 'CANCELED') throw new ApiError('این فاکتور لغو شده است.', 400);

  await debit({
    userId: user.id,
    amount: invoice.total,
    type: 'CHARGE',
    invoiceId: invoice.id,
    description: `پرداخت فاکتور شماره ${invoice.number}`,
  });

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: 'PAID', paidAt: new Date() },
  });

  await audit({
    userId: user.id,
    action: 'billing.invoice_paid',
    entity: 'invoice',
    entityId: invoice.id,
    meta: { amount: invoice.total.toString() },
  });

  return ok({ paid: true, message: 'فاکتور با موفقیت از کیف پول پرداخت شد.' });
});
