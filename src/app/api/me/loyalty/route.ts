import { ok, route } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { loyaltyStatus } from '@/lib/loyalty';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** وضعیت باشگاه مشتریان کاربر جاری */
export const GET = route(async () => {
  const user = await requireUser();
  return ok(await loyaltyStatus(user.id));
});
