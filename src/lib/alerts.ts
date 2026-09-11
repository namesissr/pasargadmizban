import prisma from './prisma';
import { notify } from './notify';
import { getPreferences } from './preferences';
import { burnRate } from './billing';
import { formatToman, formatTraffic } from './money';

/**
 * هشدارهای پیشگیرانه.
 *
 * برخلاف اعلان‌های واکنشی (که بعد از اتفاق فرستاده می‌شوند)، این‌ها قبل از
 * بروز مشکل به کاربر خبر می‌دهند: قبل از تمام شدن اعتبار، قبل از پر شدن
 * ترافیک و قبل از عبور از سقف بودجه ماهانه.
 */

type AlertResult = { checked: number; sent: number; errors: string[] };

/**
 * هشدار اعتبار رو به اتمام.
 * هر کاربر خودش تعیین می‌کند چند ساعت قبل از اتمام اعتبار خبردار شود.
 */
export async function runLowBalanceAlerts(): Promise<AlertResult> {
  const out: AlertResult = { checked: 0, sent: 0, errors: [] };

  // فقط کاربرانی که سرویس فعال دارند
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      status: { in: ['ACTIVE', 'PENDING'] },
      servers: { some: { status: { in: ['RUNNING', 'OFF', 'REBUILDING'] }, deletedAt: null } },
    },
    select: { id: true, balance: true },
    take: 5000,
  });

  for (const user of users) {
    try {
      out.checked++;
      const prefs = await getPreferences(user.id);
      if (!prefs.lowBalanceEnabled) continue;

      const burn = await burnRate(user.id);
      if (burn.hourly <= 0n) continue;

      const hoursLeft = Number(user.balance / burn.hourly);
      const thresholdByHours = hoursLeft <= prefs.lowBalanceHours;
      const thresholdByAmount = prefs.lowBalanceAmount > 0n && user.balance <= prefs.lowBalanceAmount;

      if (!thresholdByHours && !thresholdByAmount) continue;
      if (user.balance <= 0n) continue; // اتمام کامل، اعلان جداگانه‌ای در موتور صورتحساب دارد

      // هر چه به اتمام نزدیک‌تر، فاصله یادآوری کوتاه‌تر
      const dedupeHours = hoursLeft <= 6 ? 3 : hoursLeft <= 24 ? 8 : 24;
      const urgent = hoursLeft <= 12;

      const created = await notify(user.id, {
        kind: 'billing',
        type: hoursLeft <= 12 ? 'error' : 'warning',
        title: 'اعتبار شما رو به اتمام است',
        body: [
          `موجودی فعلی: ${formatToman(user.balance)}`,
          `با مصرف فعلی، حدود ${faHours(hoursLeft)} دیگر اعتبار شما تمام می‌شود.`,
          `برای جلوگیری از تعلیق سرورها، کیف پول را شارژ کنید.`,
        ].join('\n'),
        link: '/dashboard/wallet',
        dedupeHours,
        email: true,
        urgent,
        wait: true,
      });

      if (created) out.sent++;
    } catch (err) {
      out.errors.push(err instanceof Error ? err.message : 'خطای نامشخص');
    }
  }

  return out;
}

/** هشدار نزدیک شدن مصرف ترافیک به سهمیه ماهانه */
export async function runTrafficAlerts(): Promise<AlertResult> {
  const out: AlertResult = { checked: 0, sent: 0, errors: [] };

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const servers = await prisma.server.findMany({
    where: { status: { in: ['RUNNING', 'OFF'] }, deletedAt: null, includedTraffic: { gt: 0 } },
    select: { id: true, name: true, userId: true, includedTraffic: true },
    take: 2000,
  });

  // ترجیحات هر کاربر یک بار خوانده می‌شود
  const prefsCache = new Map<string, Awaited<ReturnType<typeof getPreferences>>>();

  for (const server of servers) {
    try {
      out.checked++;

      let prefs = prefsCache.get(server.userId);
      if (!prefs) {
        prefs = await getPreferences(server.userId);
        prefsCache.set(server.userId, prefs);
      }
      if (!prefs.trafficAlertEnabled) continue;

      const usage = await prisma.trafficUsage.aggregate({
        where: { serverId: server.id, date: { gte: monthStart } },
        _max: { outgoingBytes: true },
      });

      // هتزنر مصرف را تجمعی گزارش می‌کند، پس بیشترین مقدار ماه معیار است
      const used = usage._max.outgoingBytes ?? 0n;
      if (used <= 0n) continue;

      const percent = Number((used * 100n) / server.includedTraffic);
      if (percent < prefs.trafficAlertPercent) continue;

      const created = await notify(server.userId, {
        kind: 'billing',
        type: percent >= 100 ? 'error' : 'warning',
        title:
          percent >= 100
            ? `سهمیه ترافیک سرور ${server.name} تمام شد`
            : `مصرف ترافیک سرور ${server.name} به ${faNum(percent)}٪ رسید`,
        body: [
          `مصرف این ماه: ${formatTraffic(used)} از ${formatTraffic(server.includedTraffic)}`,
          percent >= 100
            ? 'ترافیک اضافه بر اساس تعرفه محاسبه و از کیف پول کسر می‌شود.'
            : 'اگر مصرف با همین روند ادامه یابد، ترافیک اضافه محاسبه خواهد شد.',
        ].join('\n'),
        link: `/dashboard/servers/${server.id}`,
        dedupeHours: 48,
        email: percent >= 100,
        wait: true,
      });

      if (created) out.sent++;
    } catch (err) {
      out.errors.push(`${server.name}: ${err instanceof Error ? err.message : 'خطای نامشخص'}`);
    }
  }

  return out;
}

/** هشدار عبور هزینه ماهانه از سقفی که کاربر تعیین کرده */
export async function runBudgetAlerts(): Promise<AlertResult> {
  const out: AlertResult = { checked: 0, sent: 0, errors: [] };

  const withBudget = await prisma.notificationPreference.findMany({
    where: { monthlyBudget: { gt: 0 } },
    select: { userId: true, monthlyBudget: true, budgetAlertPercent: true },
    take: 5000,
  });

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  for (const row of withBudget) {
    try {
      out.checked++;

      const spent = await prisma.transaction.aggregate({
        where: {
          userId: row.userId,
          direction: 'DEBIT',
          type: 'CHARGE',
          status: 'SUCCESS',
          paidAt: { gte: monthStart },
        },
        _sum: { amount: true },
      });

      const total = spent._sum.amount ?? 0n;
      if (total <= 0n) continue;

      const percent = Number((total * 100n) / row.monthlyBudget);
      if (percent < row.budgetAlertPercent) continue;

      const created = await notify(row.userId, {
        kind: 'billing',
        type: percent >= 100 ? 'error' : 'warning',
        title:
          percent >= 100
            ? 'از سقف هزینه ماهانه خود عبور کردید'
            : `هزینه این ماه به ${faNum(percent)}٪ سقف تعیین‌شده رسید`,
        body: [
          `هزینه این ماه: ${formatToman(total)}`,
          `سقف تعیین‌شده: ${formatToman(row.monthlyBudget)}`,
          'این فقط یک هشدار است و سرویسی به‌طور خودکار قطع نمی‌شود.',
        ].join('\n'),
        link: '/dashboard/transactions',
        dedupeHours: 72,
        wait: true,
      });

      if (created) out.sent++;
    } catch (err) {
      out.errors.push(err instanceof Error ? err.message : 'خطای نامشخص');
    }
  }

  return out;
}

function faNum(n: number): string {
  return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 }).format(n);
}

function faHours(hours: number): string {
  if (hours >= 48) return `${faNum(Math.floor(hours / 24))} روز`;
  if (hours >= 1) return `${faNum(Math.floor(hours))} ساعت`;
  return 'کمتر از یک ساعت';
}
