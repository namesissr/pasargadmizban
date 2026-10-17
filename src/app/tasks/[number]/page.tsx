import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { TaskDetailView } from './task-detail';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ number: string }> };

async function load(params: Props['params']) {
  const { number } = await params;
  const n = Number(number);
  if (!Number.isInteger(n) || n <= 0) return null;
  return prisma.devTask.findUnique({ where: { number: n }, select: { number: true, title: true } });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const task = await load(params);
  return { title: task ? `#${task.number} ${task.title}` : 'تسک' };
}

export default async function TaskPage({ params }: Props) {
  const task = await load(params);
  if (!task) notFound();
  return <TaskDetailView number={task.number} />;
}
