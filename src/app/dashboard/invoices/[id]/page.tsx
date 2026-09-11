import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { InvoiceView } from './invoice-view';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({ where: { id }, select: { number: true } }).catch(() => null);
  return { title: invoice ? `فاکتور ${invoice.number}` : 'فاکتور' };
}

export default async function InvoicePage({ params }: Props) {
  const user = await requireUser();
  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      items: { include: { server: { select: { id: true, name: true } } } },
      transactions: { where: { status: 'SUCCESS' } },
      user: {
        select: {
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

  if (!invoice) notFound();
  if (invoice.userId !== user.id && user.role === 'USER') notFound();

  const settings = await getSettings();
  const balance = await prisma.user.findUnique({ where: { id: user.id }, select: { balance: true } });

  return (
    <InvoiceView
      invoice={{
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        subtotal: Number(invoice.subtotal),
        discount: Number(invoice.discount),
        tax: Number(invoice.tax),
        total: Number(invoice.total),
        note: invoice.note,
        periodStart: invoice.periodStart?.toISOString() ?? null,
        periodEnd: invoice.periodEnd?.toISOString() ?? null,
        dueAt: invoice.dueAt?.toISOString() ?? null,
        paidAt: invoice.paidAt?.toISOString() ?? null,
        createdAt: invoice.createdAt.toISOString(),
        items: invoice.items.map((i) => ({
          id: i.id,
          description: i.description,
          quantity: i.quantity,
          unitPrice: Number(i.unitPrice),
          total: Number(i.total),
          serverName: i.server?.name ?? null,
        })),
        customer: {
          name: [invoice.user.firstName, invoice.user.lastName].filter(Boolean).join(' ') || invoice.user.email,
          email: invoice.user.email,
          phone: invoice.user.phone,
          company: invoice.user.company,
          address: invoice.user.address,
          nationalId: invoice.user.nationalId,
          postalCode: invoice.user.postalCode,
        },
      }}
      brand={{
        name: settings.brandName,
        email: settings.supportEmail,
        phone: settings.supportPhone,
        site: settings.siteUrl,
      }}
      balance={Number(balance?.balance ?? 0)}
    />
  );
}
