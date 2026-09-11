import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { requireStaff } from '@/lib/auth';
import { UserDetail } from './detail';

export const metadata: Metadata = { title: 'مدیریت کاربر' };
export const dynamic = 'force-dynamic';

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;

  const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!exists) notFound();

  return <UserDetail userId={id} isAdmin={staff.role === 'ADMIN'} />;
}
