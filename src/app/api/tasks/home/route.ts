import { ok, route } from '@/lib/api';
import { requireTaskMember } from '@/lib/auth';
import { developerHome, employerHome } from '@/lib/dev-tasks-dash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** داده‌های صفحه نخست هر پنل: برنامه‌نویس یا کارفرما */
export const GET = route(async () => {
  const user = await requireTaskMember();
  if (user.role === 'DEVELOPER') return ok({ kind: 'developer', ...(await developerHome(user.id)) });
  return ok({ kind: 'employer', ...(await employerHome(user.id)) });
});
