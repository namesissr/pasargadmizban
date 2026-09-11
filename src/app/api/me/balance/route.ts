import { ok, route } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { getBalance } from '@/lib/wallet';
import { burnRate } from '@/lib/billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const user = await requireUser();
  const [balance, burn] = await Promise.all([getBalance(user.id), burnRate(user.id)]);

  const hoursLeft = burn.hourly > 0n ? Number(balance / burn.hourly) : null;

  return ok({
    balance: Number(balance),
    burn: { hourly: Number(burn.hourly), daily: Number(burn.daily), monthly: Number(burn.monthly) },
    hoursLeft,
    daysLeft: hoursLeft === null ? null : Math.floor(hoursLeft / 24),
  });
});
