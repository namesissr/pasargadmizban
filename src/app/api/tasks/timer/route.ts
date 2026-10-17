import { ok, route } from '@/lib/api';
import { requireTaskMember } from '@/lib/auth';
import { activeTimer } from '@/lib/dev-tasks-time';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** زمان‌سنج روشن کاربر جاری — برای نوار بالای پنل */
export const GET = route(async () => {
  const user = await requireTaskMember();
  const running = await activeTimer(user.id);
  return ok({
    running: running
      ? { startedAt: running.startedAt, task: running.task }
      : null,
  });
});
