import { ok, route } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { referralReport } from '@/lib/referrals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const user = await requireUser();
  return ok(await referralReport(user.id));
});
