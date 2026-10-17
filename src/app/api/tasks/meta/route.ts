import prisma from '@/lib/prisma';
import { ok, route } from '@/lib/api';
import { requireTaskMember } from '@/lib/auth';
import { assignableUsers, userBrief } from '@/lib/dev-tasks';
import { DEFAULT_AREAS, OPEN_STATUSES } from '@/lib/dev-tasks-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** داده‌های کمکی فرم‌ها و فیلترها: اعضای تیم، بخش‌ها و برچسب‌های استفاده‌شده */
export const GET = route(async () => {
  const user = await requireTaskMember();

  const [members, people, areaRows, labelRows] = await Promise.all([
    assignableUsers(),
    // همه اعضای میز کار — برای صدا زدن در نظرها و انتخاب دنبال‌کننده
    prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'EMPLOYER', 'SUPPORT', 'DEVELOPER'] }, deletedAt: null, status: { not: 'BANNED' } },
      select: userBrief,
      orderBy: { createdAt: 'asc' },
    }),
    prisma.devTask.findMany({ where: { area: { not: null } }, select: { area: true }, distinct: ['area'] }),
    prisma.$queryRaw<{ label: string }[]>`SELECT DISTINCT unnest(labels) AS label FROM dev_tasks ORDER BY 1 LIMIT 200`,
  ]);

  // تعداد کار باز هر نفر تا هنگام سپردن تسک، کم‌کارترین برنامه‌نویس دیده شود
  const load = await prisma.devTask.groupBy({
    by: ['assigneeId'],
    where: { archivedAt: null, status: { in: OPEN_STATUSES }, assigneeId: { not: null } },
    _count: { _all: true },
  });
  const openCount = new Map(load.map((l) => [l.assigneeId, l._count._all]));

  const used = areaRows.map((r) => r.area).filter((a): a is string => Boolean(a));
  const areas = [...new Set([...DEFAULT_AREAS, ...used])];

  return ok({
    me: { id: user.id, role: user.role },
    members: members.map((m) => ({ ...m, openCount: openCount.get(m.id) ?? 0 })),
    people,
    areas,
    labels: labelRows.map((r) => r.label),
  });
});
