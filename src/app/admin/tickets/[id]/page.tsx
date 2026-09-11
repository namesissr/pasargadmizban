import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { requireStaff } from '@/lib/auth';
import { TicketThread } from '@/app/dashboard/tickets/[id]/thread';

export const metadata: Metadata = { title: 'تیکت' };
export const dynamic = 'force-dynamic';

export default async function AdminTicketPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;

  const ticket = await prisma.ticket.findUnique({ where: { id }, select: { id: true } });
  if (!ticket) notFound();

  return <TicketThread ticketId={ticket.id} isStaffView />;
}
