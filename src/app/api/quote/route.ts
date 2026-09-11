import { z } from 'zod';
import { ok, parseQuery, route } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { quoteServer } from '@/lib/provisioning';
import { getBalance } from '@/lib/wallet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  serverType: z.string().min(1),
  location: z.string().min(1),
  billingCycle: z.enum(['HOURLY', 'MONTHLY']),
  months: z.coerce.number().int().min(1).max(12).optional().default(1),
  backups: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
});

/** پیش‌فاکتور لحظه‌ای قبل از ساخت سرور */
export const GET = route(async (req: Request) => {
  const user = await requireUser();
  const q = parseQuery(req, querySchema);

  const quote = await quoteServer({
    userId: user.id,
    serverType: q.serverType,
    location: q.location,
    billingCycle: q.billingCycle,
    months: q.months,
    enableBackups: q.backups,
    userDiscountPct: user.discountPct,
  });

  const balance = await getBalance(user.id);
  const enough = balance >= quote.minBalance;

  return ok({
    hourly: Number(quote.hourly),
    monthly: Number(quote.monthly),
    dueNow: Number(quote.dueNow),
    minBalance: Number(quote.minBalance),
    months: quote.months,
    prepayHours: quote.prepayHours,
    balance: Number(balance),
    enough,
    shortfall: enough ? 0 : Number(quote.minBalance - balance),
    backup: { hourly: Number(quote.backup.hourly), monthly: Number(quote.backup.monthly) },
    basePrice: { hourly: Number(quote.price.hourly), monthly: Number(quote.price.monthly) },
    includedTraffic: Number(quote.price.includedTraffic),
    discountPct: user.discountPct,
  });
});
