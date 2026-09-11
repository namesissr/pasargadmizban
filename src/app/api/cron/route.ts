import { NextResponse } from 'next/server';
import { ok, route, ApiError } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { env } from '@/lib/env';
import {
  chargeHourlyServers,
  processMonthlyServers,
  deleteExpiredSuspended,
  syncAllServers,
  finalizeProvisioning,
  collectTraffic,
  chargeSnapshots,
  retryUnsuspend,
} from '@/lib/billing';
import { reconcileServerActions } from '@/lib/provisioning';
import { syncCatalog } from '@/lib/catalog';
import { purgeExpiredRateLimits } from '@/lib/rate-limit';
import { runMonitors } from '@/lib/monitoring';
import { refreshAllAccounts } from '@/lib/hetzner-accounts';
import { runIpVerification } from '@/lib/ip-reachability';
import { cleanupOrphanIps } from '@/lib/ip-cleanup';
import { runEurRateUpdate } from '@/lib/eur-rate';
import { refreshAllLoyalty } from '@/lib/loyalty';
import { runWeeklyReports } from '@/lib/weekly-report';
import { runCatalogAutoSync } from '@/lib/catalog';
import { runLowBalanceAlerts, runTrafficAlerts, runBudgetAlerts } from '@/lib/alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * اجرای کارهای زمان‌بندی‌شده از طریق HTTP.
 *
 * راه اصلی اجرای این کارها ورکر جداگانه است (`npm run worker`).
 * این مسیر برای محیط‌هایی است که امکان اجرای پروسه دائمی ندارند
 * (مثلاً Vercel Cron) یا برای اجرای دستی توسط مدیر.
 *
 * احراز هویت: هدر Authorization: Bearer <CRON_SECRET> یا ورود به عنوان مدیر.
 */

const JOBS = {
  'hourly-billing': async () => {
    const r = await chargeHourlyServers();
    return { processed: r.processed, charged: r.charged.toString(), suspended: r.suspended, errors: r.errors };
  },
  'monthly-billing': async () => {
    const r = await processMonthlyServers();
    return { processed: r.processed, charged: r.charged.toString(), suspended: r.suspended, errors: r.errors };
  },
  'finalize-provisioning': async () => ({ done: await finalizeProvisioning() }),
  'reconcile-actions': async () => reconcileServerActions(),
  'sync-servers': async () => syncAllServers(),
  'retry-unsuspend': async () => ({ unsuspended: await retryUnsuspend() }),
  'cleanup-suspended': async () => deleteExpiredSuspended(),
  'collect-traffic': async () => ({ servers: await collectTraffic() }),
  'snapshot-billing': async () => {
    const r = await chargeSnapshots();
    return { count: r.count, charged: r.charged.toString() };
  },
  'sync-catalog': async () => syncCatalog(),
  'monitor-servers': async () => runMonitors(),
  'refresh-accounts': async () => refreshAllAccounts(),
  'verify-ip-reachability': async () => runIpVerification(),
  'cleanup-orphan-ips': async () => cleanupOrphanIps(),
  'update-eur-rate': async () => runEurRateUpdate(),
  'refresh-loyalty': async () => refreshAllLoyalty(),
  'weekly-reports': async () => runWeeklyReports(),
  'catalog-auto-sync': async () => runCatalogAutoSync(),
  'low-balance-alerts': async () => runLowBalanceAlerts(),
  'traffic-alerts': async () => runTrafficAlerts(),
  'budget-alerts': async () => runBudgetAlerts(),
  housekeeping: async () => ({ rateLimits: await purgeExpiredRateLimits() }),
} as const;

type JobName = keyof typeof JOBS;

async function authorize(req: Request): Promise<void> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (env.cronSecret && token && token === env.cronSecret) return;

  const user = await getCurrentUser();
  if (user?.role === 'ADMIN') return;

  throw new ApiError('دسترسی به این مسیر مجاز نیست.', 401, { code: 'unauthorized' });
}

async function handle(req: Request): Promise<NextResponse> {
  await authorize(req);

  const url = new URL(req.url);
  const jobParam = url.searchParams.get('job');

  if (!jobParam) {
    return ok({ available: Object.keys(JOBS), usage: 'برای اجرا، پارامتر job را مشخص کنید.' });
  }

  if (!(jobParam in JOBS)) {
    throw new ApiError(`کار «${jobParam}» تعریف نشده است. کارهای موجود: ${Object.keys(JOBS).join(', ')}`, 400);
  }

  const started = Date.now();
  const result = await JOBS[jobParam as JobName]();

  return ok({
    job: jobParam,
    durationMs: Date.now() - started,
    result,
  });
}

export const GET = route(handle);
export const POST = route(handle);
