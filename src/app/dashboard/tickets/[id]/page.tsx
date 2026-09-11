import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { TicketThread } from './thread';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const ticket = await prisma.ticket.findUnique({ where: { id }, select: { number: true, subject: true } }).catch(() => null);
  return { title: ticket ? `تیکت ${ticket.number} — ${ticket.subject}` : 'تیکت' };
}

export default async function TicketPage({ params }: Props) {
  const user = await requireUser();
  const { id } = await params;

  const ticket = await prisma.ticket.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!ticket) notFound();
  if (ticket.userId !== user.id && user.role === 'USER') notFound();

  return <TicketThread ticketId={ticket.id} isStaffView={false} />;
}
