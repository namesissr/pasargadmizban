import { ok, route } from '@/lib/api';
import { requireTaskManager } from '@/lib/auth';
import { teamWorkload } from '@/lib/dev-tasks-dash';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** بار کاری، کارکرد و کیفیت کار هر برنامه‌نویس — فقط برای کارفرما */
export const GET = route(async () => {
  await requireTaskManager();
  return ok({ items: await teamWorkload() });
});
