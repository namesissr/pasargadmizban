import { z } from 'zod';
import { ok, parseBody, route } from '@/lib/api';
import { requireAdmin, requireStaff, clientIp, assertSameOrigin } from '@/lib/auth';
import { fetchEurRate, applyMargin, runEurRateUpdate, rateHistory } from '@/lib/eur-rate';
import { getSettings } from '@/lib/settings';
import { enforceRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** تاریخچه دریافت‌های اخیر نرخ */
export const GET = route(async () => {
  await requireStaff();
  const [history, settings] = await Promise.all([rateHistory(20), getSettings()]);
  return ok({
    history,
    current: settings.eurRate,
    enabled: settings.eurAutoEnabled,
    intervalHours: settings.eurAutoIntervalHours,
  });
});

const schema = z.object({
  // test: فقط دریافت و نمایش، بدون اعمال — apply: اجرای کامل همین حالا
  action: z.enum(['test', 'apply']),
});

export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  await enforceRateLimit(`eur-rate:${admin.id}`, 30, 600, { persistent: true });

  const { action } = await parseBody(req, schema);

  if (action === 'test') {
    const settings = await getSettings(true);
    const fetched = await fetchEurRate(settings);
    const finalRate = applyMargin(fetched.rate, settings);
    return ok({
      fetched: fetched.rate,
      finalRate,
      current: settings.eurRate,
      detail: fetched.detail,
      message:
        `منبع ${fetched.detail} نرخ ${fetched.rate.toLocaleString('fa-IR')} تومان داد؛ ` +
        `پس از حاشیه شما می‌شود ${finalRate.toLocaleString('fa-IR')} تومان. هنوز اعمال نشده است.`,
    });
  }

  const result = await runEurRateUpdate(true);

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.eur_rate_update',
    entity: 'settings',
    ip: await clientIp(),
    meta: { status: result.status, previous: result.previous, finalRate: result.finalRate },
  });

  return ok(result);
});
