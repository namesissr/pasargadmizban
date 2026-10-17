import prisma from '@/lib/prisma';
import { ok, route } from '@/lib/api';
import { requireTaskMember } from '@/lib/auth';
import { assignableUsers } from '@/lib/dev-tasks';
import { DEFAULT_AREAS } from '@/lib/dev-tasks-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** داده‌های کمکی فرم‌ها و فیلترها: اعضای تیم، بخش‌ها و برچسب‌های استفاده‌شده */
export const GET = route(async () => {
  const user = await requireTaskMember();

  const [members, areaRows, labelRows] = await Promise.all([
    assignableUsers(),
    prisma.devTask.findMany({ where: { area: { not: null } }, select: { area: true }, distinct: ['area'] }),
    prisma.$queryRaw<{ label: string }[]>`SELECT DISTINCT unnest(labels) AS label FROM dev_tasks ORDER BY 1 LIMIT 200`,
  ]);

  const used = areaRows.map((r) => r.area).filter((a): a is string => Boolean(a));
  const areas = [...new Set([...DEFAULT_AREAS, ...used])];

  return ok({
    me: { id: user.id, role: user.role },
    members,
    areas,
    labels: labelRows.map((r) => r.label),
  });
});
