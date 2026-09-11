import 'dotenv/config';
import cron from 'node-cron';
import prisma from '../lib/prisma';
import {
  chargeHourlyServers,
  processMonthlyServers,
  deleteExpiredSuspended,
  syncAllServers,
  finalizeProvisioning,
  collectTraffic,
  chargeSnapshots,
  retryUnsuspend,
} from '../lib/billing';
import { syncCatalog } from '../lib/catalog';
import { purgeExpiredRateLimits } from '../lib/rate-limit';
import { runMonitors, purgeOldMonitorData } from '../lib/monitoring';
import { runLowBalanceAlerts, runTrafficAlerts, runBudgetAlerts } from '../lib/alerts';
import { pollOnce, telegramConfigured } from '../lib/telegram';
import { getSettings } from '../lib/settings';
import { refreshAllAccounts, importLegacyToken } from '../lib/hetzner-accounts';
import { runIpVerification } from '../lib/ip-reachability';
import { cleanupOrphanIps } from '../lib/ip-cleanup';
import { runEurRateUpdate } from '../lib/eur-rate';
import { refreshAllLoyalty } from '../lib/loyalty';
import { runWeeklyReports } from '../lib/weekly-report';

/**
 * ورکر پس‌زمینه — باید در کنار اپلیکیشن و به صورت دائمی اجرا شود:
 *   npm run worker
 *
 * فقط یک نمونه از این ورکر باید در کل سیستم اجرا شود؛ در غیر این صورت
 * ممکن است هزینه‌ها دو بار کسر شوند. برای اجرای چندنمونه‌ای از قفل دیتابیس
 * (jobLock) استفاده می‌شود.
 */

const LOCK_TTL_MS = 10 * 60_000;

async function acquireLock(job: string): Promise<string | null> {
  const cutoff = new Date(Date.now() - LOCK_TTL_MS);
  const running = await prisma.jobRun.findFirst({
    where: { job, status: 'running', startedAt: { gte: cutoff } },
  });
  if (running) return null;

  const run = await prisma.jobRun.create({ data: { job, status: 'running' } });
  return run.id;
}

async function releaseLock(id: string, status: 'done' | 'failed', processed = 0, error?: string, meta?: object) {
  await prisma.jobRun
    .update({
      where: { id },
      data: {
        status,
        finishedAt: new Date(),
        processed,
        error: error?.slice(0, 1000),
        meta: (meta ?? {}) as never,
      },
    })
    .catch(() => null);
}

type JobFn = () => Promise<{ processed?: number; meta?: object }>;

async function runJob(name: string, fn: JobFn) {
  const lockId = await acquireLock(name);
  if (!lockId) {
    log(`⏭  ${name}: نمونه دیگری در حال اجراست، رد شد.`);
    return;
  }
  const started = Date.now();
  try {
    const result = await fn();
    await releaseLock(lockId, 'done', result.processed ?? 0, undefined, result.meta);
    log(`✅ ${name} در ${Date.now() - started}ms — ${JSON.stringify(result.meta ?? {})}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await releaseLock(lockId, 'failed', 0, message);
    log(`❌ ${name} با خطا مواجه شد: ${message}`);
  }
}

function log(msg: string) {
  const ts = new Date().toLocaleString('fa-IR', { hour12: false });
  console.log(`[${ts}] ${msg}`);
}

function bigintToStr(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === 'bigint' ? v.toString() : v;
  }
  return out;
}

// ───────────────  تعریف کارها  ───────────────

export const jobs = {
  /** هر ساعت: کسر هزینه سرورهای ساعتی */
  hourlyBilling: () =>
    runJob('hourly-billing', async () => {
      const res = await chargeHourlyServers();
      return {
        processed: res.processed,
        meta: bigintToStr({ charged: res.charged, suspended: res.suspended, errors: res.errors.length }),
      };
    }),

  /** هر ساعت: بررسی سررسید سرورهای ماهانه */
  monthlyBilling: () =>
    runJob('monthly-billing', async () => {
      const res = await processMonthlyServers();
      return {
        processed: res.processed,
        meta: bigintToStr({ charged: res.charged, suspended: res.suspended, errors: res.errors.length }),
      };
    }),

  /** هر ۲ دقیقه: تکمیل سرورهای در حال ساخت */
  finalizeProvisioning: () =>
    runJob('finalize-provisioning', async () => {
      const done = await finalizeProvisioning();
      return { processed: done, meta: { done } };
    }),

  /** هر ۲ دقیقه: بررسی اینکه آدرس سرورهای تازه از ایران باز می‌شود */
  verifyIpReachability: () =>
    runJob('verify-ip-reachability', async () => {
      const res = await runIpVerification();
      return {
        processed: res.checked,
        meta: { ok: res.ok, blocked: res.blocked, inconclusive: res.inconclusive, swapped: res.swapped },
      };
    }),

  /** هر ساعت: حذف آدرس‌های بلااستفاده از همه حساب‌های هتزنر */
  cleanupOrphanIps: () =>
    runJob('cleanup-orphan-ips', async () => {
      const res = await cleanupOrphanIps();
      return {
        processed: res.deleted,
        meta: { found: res.found, deleted: res.deleted, failed: res.failed.length, errors: res.errors.length },
      };
    }),

  /** هر ۳۰ دقیقه: نرخ خودکار یورو (خود کار، بازه تنظیم‌شده مدیر را رعایت می‌کند) */
  updateEurRate: () =>
    runJob('update-eur-rate', async () => {
      const res = await runEurRateUpdate();
      return {
        processed: res.status === 'applied' ? 1 : 0,
        meta: { status: res.status, previous: res.previous ?? null, finalRate: res.finalRate ?? null },
      };
    }),

  /** روزانه: بازمحاسبه سطح باشگاه مشتریان */
  refreshLoyalty: () =>
    runJob('refresh-loyalty', async () => {
      const res = await refreshAllLoyalty();
      return { processed: res.checked, meta: { checked: res.checked, upgraded: res.upgraded } };
    }),

  /** هفتگی: گزارش ایمیلی مصرف و هزینه */
  weeklyReports: () =>
    runJob('weekly-reports', async () => {
      const res = await runWeeklyReports();
      return { processed: res.sent, meta: res };
    }),

  /** هر ۱۰ دقیقه: همگام‌سازی وضعیت همه سرورها */
  syncServers: () =>
    runJob('sync-servers', async () => {
      const res = await syncAllServers();
      return { processed: res.synced, meta: { synced: res.synced, orphans: res.orphans, errors: res.errors.length } };
    }),

  /** هر ۱۵ دقیقه: تلاش برای رفع تعلیق پس از شارژ */
  retryUnsuspend: () =>
    runJob('retry-unsuspend', async () => {
      const count = await retryUnsuspend();
      return { processed: count, meta: { unsuspended: count } };
    }),

  /** روزانه: حذف سرورهای تعلیق‌شده منقضی */
  cleanupSuspended: () =>
    runJob('cleanup-suspended', async () => {
      const res = await deleteExpiredSuspended();
      return { processed: res.deleted, meta: { deleted: res.deleted, errors: res.errors.length } };
    }),

  /** روزانه: ثبت مصرف ترافیک */
  collectTraffic: () =>
    runJob('collect-traffic', async () => {
      const count = await collectTraffic();
      return { processed: count, meta: { servers: count } };
    }),

  /** روزانه: صورتحساب اسنپ‌شات‌ها */
  snapshotBilling: () =>
    runJob('snapshot-billing', async () => {
      const res = await chargeSnapshots();
      return { processed: res.count, meta: bigintToStr({ charged: res.charged, count: res.count }) };
    }),

  /** روزانه: به‌روزرسانی کاتالوگ و قیمت‌های هتزنر */
  syncCatalog: () =>
    runJob('sync-catalog', async () => {
      const res = await syncCatalog();
      return { processed: res.serverTypes, meta: res };
    }),

  /** هر ۲ دقیقه: پایش در دسترس بودن سرورها */
  monitorServers: () =>
    runJob('monitor-servers', async () => {
      const res = await runMonitors();
      return {
        processed: res.checked,
        meta: { checked: res.checked, down: res.down, recovered: res.recovered, errors: res.errors.length },
      };
    }),

  /** هر ساعت: هشدار اعتبار رو به اتمام بر اساس تنظیم هر کاربر */
  lowBalanceAlerts: () =>
    runJob('low-balance-alerts', async () => {
      const res = await runLowBalanceAlerts();
      return { processed: res.sent, meta: { checked: res.checked, sent: res.sent, errors: res.errors.length } };
    }),

  /** روزانه: هشدار مصرف ترافیک */
  trafficAlerts: () =>
    runJob('traffic-alerts', async () => {
      const res = await runTrafficAlerts();
      return { processed: res.sent, meta: { checked: res.checked, sent: res.sent } };
    }),

  /** روزانه: هشدار سقف هزینه ماهانه */
  budgetAlerts: () =>
    runJob('budget-alerts', async () => {
      const res = await runBudgetAlerts();
      return { processed: res.sent, meta: { checked: res.checked, sent: res.sent } };
    }),

  /** هر ۱۰ دقیقه: به‌روزرسانی ظرفیت حساب‌های هتزنر */
  refreshAccounts: () =>
    runJob('refresh-accounts', async () => {
      const res = await refreshAllAccounts();
      return { processed: res.checked, meta: res };
    }),

  /** روزانه: پاکسازی */
  housekeeping: () =>
    runJob('housekeeping', async () => {
      const rateLimits = await purgeExpiredRateLimits();
      const sessions = await prisma.session.deleteMany({
        where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: new Date(Date.now() - 30 * 86_400_000) } }] },
      });
      const tokens = await prisma.verificationToken.deleteMany({
        where: { expiresAt: { lt: new Date(Date.now() - 7 * 86_400_000) } },
      });
      const notifications = await prisma.notification.deleteMany({
        where: { readAt: { not: null }, createdAt: { lt: new Date(Date.now() - 60 * 86_400_000) } },
      });
      const jobRuns = await prisma.jobRun.deleteMany({
        where: { startedAt: { lt: new Date(Date.now() - 30 * 86_400_000) } },
      });
      const linkCodes = await prisma.telegramLinkCode.deleteMany({
        where: { expiresAt: { lt: new Date(Date.now() - 86_400_000) } },
      });
      const monitorData = await purgeOldMonitorData(90);
      return {
        processed: rateLimits + sessions.count + tokens.count,
        meta: {
          rateLimits,
          sessions: sessions.count,
          tokens: tokens.count,
          notifications: notifications.count,
          jobRuns: jobRuns.count,
          telegramCodes: linkCodes.count,
          monitorData,
        },
      };
    }),
};

// ───────────────  زمان‌بندی  ───────────────

function schedule() {
  const tz = 'Asia/Tehran';

  // هر ساعت، دقیقه ۵
  cron.schedule('5 * * * *', jobs.hourlyBilling, { timezone: tz });
  // هر ساعت، دقیقه ۱۰
  cron.schedule('10 * * * *', jobs.monthlyBilling, { timezone: tz });
  // هر ۲ دقیقه
  cron.schedule('*/2 * * * *', jobs.finalizeProvisioning, { timezone: tz });
  // بررسی دسترسی آدرس سرورهای تازه، هر ۲ دقیقه
  cron.schedule('*/2 * * * *', jobs.verifyIpReachability, { timezone: tz });
  // جاروب آدرس‌های بلااستفاده، هر ساعت دقیقه ۲۵
  cron.schedule('25 * * * *', jobs.cleanupOrphanIps, { timezone: tz });
  // نرخ خودکار یورو، هر ۳۰ دقیقه (بازه واقعی در تنظیمات است)
  cron.schedule('*/30 * * * *', jobs.updateEurRate, { timezone: tz });
  // باشگاه مشتریان، روزانه ساعت ۴:۳۰ بامداد
  cron.schedule('30 4 * * *', jobs.refreshLoyalty, { timezone: tz });
  // گزارش هفتگی، جمعه‌ها ساعت ۱۰ صبح
  cron.schedule('0 10 * * 5', jobs.weeklyReports, { timezone: tz });
  // هر ۱۰ دقیقه
  cron.schedule('*/10 * * * *', jobs.syncServers, { timezone: tz });
  // هر ۱۵ دقیقه
  cron.schedule('*/15 * * * *', jobs.retryUnsuspend, { timezone: tz });
  // پایش سرورها هر ۲ دقیقه (خود پایش فاصله هر سرور را رعایت می‌کند)
  cron.schedule('*/2 * * * *', jobs.monitorServers, { timezone: tz });
  // هشدار اعتبار: هر ساعت، دقیقه ۲۰
  cron.schedule('20 * * * *', jobs.lowBalanceAlerts, { timezone: tz });
  // ظرفیت حساب‌های هتزنر هر ۱۰ دقیقه
  cron.schedule('*/10 * * * *', jobs.refreshAccounts, { timezone: tz });
  // روزانه ساعت ۳ بامداد
  cron.schedule('0 3 * * *', jobs.cleanupSuspended, { timezone: tz });
  cron.schedule('15 3 * * *', jobs.collectTraffic, { timezone: tz });
  cron.schedule('30 3 * * *', jobs.snapshotBilling, { timezone: tz });
  cron.schedule('45 3 * * *', jobs.syncCatalog, { timezone: tz });
  cron.schedule('0 4 * * *', jobs.housekeeping, { timezone: tz });
  // هشدارهای روزانه، ساعت ۱۰ صبح (زمان مناسب برای دیده شدن)
  cron.schedule('0 10 * * *', jobs.trafficAlerts, { timezone: tz });
  cron.schedule('10 10 * * *', jobs.budgetAlerts, { timezone: tz });

  log('🚀 ورکر پاسارگاد میزبان راه‌اندازی شد.');
  log('   • صورتحساب ساعتی: هر ساعت، دقیقه ۵');
  log('   • صورتحساب ماهانه: هر ساعت، دقیقه ۱۰');
  log('   • تکمیل ساخت سرور: هر ۲ دقیقه');
  log('   • بررسی دسترسی آدرس از ایران: هر ۲ دقیقه');
  log('   • جاروب آدرس‌های بلااستفاده: هر ساعت');
  log('   • نرخ خودکار یورو: طبق بازه تنظیمات');
  log('   • باشگاه مشتریان: روزانه ۴:۳۰');
  log('   • گزارش هفتگی: جمعه‌ها ۱۰ صبح');
  log('   • همگام‌سازی وضعیت: هر ۱۰ دقیقه');
  log('   • پایش سرورها: هر ۲ دقیقه');
  log('   • هشدار اعتبار: هر ساعت، دقیقه ۲۰');
  log('   • نگهداری و کاتالوگ: هر شب');
}

/**
 * حلقه دریافت پیام‌های تلگرام (long polling).
 * اگر webhook تنظیم کرده باشید، telegramPolling را در تنظیمات خاموش کنید.
 */
async function startTelegramLoop(): Promise<void> {
  if (!telegramConfigured()) {
    log('ℹ️  ربات تلگرام تنظیم نشده است (TELEGRAM_BOT_TOKEN خالی).');
    return;
  }

  const settings = await getSettings();
  if (!settings.telegramEnabled || !settings.telegramPolling) {
    log('ℹ️  دریافت پیام تلگرام غیرفعال است (احتمالاً از webhook استفاده می‌کنید).');
    return;
  }

  log('🤖 ربات تلگرام در حال دریافت پیام است.');
  let failures = 0;

  for (;;) {
    try {
      await pollOnce(25);
      failures = 0;
    } catch (err) {
      failures++;
      const wait = Math.min(60_000, 2000 * 2 ** Math.min(failures, 5));
      log(`⚠️  خطا در دریافت پیام تلگرام (${failures}): ${err instanceof Error ? err.message : err}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// اجرای دستی یک کار: npm run worker -- --job=hourlyBilling
async function main() {
  const arg = process.argv.find((a) => a.startsWith('--job='));
  if (arg) {
    const name = arg.split('=')[1] as keyof typeof jobs;
    if (!(name in jobs)) {
      console.error(`کار «${name}» وجود ندارد. کارهای موجود: ${Object.keys(jobs).join(', ')}`);
      process.exit(1);
    }
    await jobs[name]();
    await prisma.$disconnect();
    process.exit(0);
  }

  // انتقال توکن قدیمی .env به جدول حساب‌ها (فقط بار اول)
  await importLegacyToken().catch(() => null);

  schedule();
  void startTelegramLoop();

  // اجرای اولیه چند کار سبک هنگام شروع
  await jobs.finalizeProvisioning();
  await jobs.verifyIpReachability();
  await jobs.updateEurRate();

  const shutdown = async (signal: string) => {
    log(`دریافت ${signal} — در حال خاموش شدن…`);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main();
