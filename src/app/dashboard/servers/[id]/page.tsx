import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { ServerDetail } from './detail';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const server = await prisma.server.findUnique({ where: { id }, select: { name: true } }).catch(() => null);
  return { title: server ? `سرور ${server.name}` : 'سرور' };
}

export default async function ServerPage({ params }: Props) {
  const user = await requireUser();
  const { id } = await params;

  const server = await prisma.server.findUnique({
    where: { id },
    select: { id: true, userId: true, name: true },
  });

  if (!server) notFound();
  if (server.userId !== user.id && user.role === 'USER') notFound();

  return <ServerDetail serverId={server.id} initialName={server.name} />;
}
