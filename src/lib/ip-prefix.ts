import prisma from './prisma';
import { getSettings } from './settings';

/**
 * حافظه سلامت رنج‌های آدرس.
 *
 * فیلترینگ ایران معمولاً یک بلوک /24 کامل را می‌بندد، نه یک آدرس تنها. پس هر
 * مشاهده‌ای — چه آزمایش خودکار پنل، چه گزارش خود مشتری هنگام تعویض آدرس — روی
 * همان بلوک ثبت می‌شود. نتیجه‌اش این است که پنل کم‌کم می‌فهمد کدام رنج‌های هتزنر
 * برای کاربر ایرانی مرده‌اند و دیگر سرور تازه را رویشان تحویل نمی‌دهد.
 *
 * این ماژول عمداً سبک است و به چیزی جز دیتابیس و تنظیمات وابسته نیست تا هم
 * ماژول ساخت سرور و هم ماژول آزمایش دسترسی بتوانند آزادانه از آن استفاده کنند.
 */

/** سه بخش نخست یک آدرس IPv4 — یعنی همان بلوک /24 */
export function prefixOf(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  if (parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return null;
  return parts.slice(0, 3).join('.');
}

type Observation = {
  ip: string | null;
  ok: boolean;
  locationName?: string | null;
  datacenter?: string | null;
};

/**
 * ثبت یک مشاهده روی بلوک آدرس.
 *
 * وقتی شمار مشاهده‌های منفی از آستانه بگذرد و مشاهده مثبت تازه‌ای در کار نباشد،
 * بلوک «سوخته» علامت می‌خورد. یک مشاهده مثبت، علامت را برمی‌دارد؛ چون فیلترینگ
 * گاهی برداشته می‌شود و نباید رنج سالم را برای همیشه کنار بگذاریم.
 */
export async function recordPrefixResult(obs: Observation): Promise<void> {
  const prefix = prefixOf(obs.ip);
  if (!prefix) return;

  const settings = await getSettings();
  const now = new Date();

  const existing = await prisma.ipPrefixHealth.findUnique({ where: { prefix } });

  const okCount = (existing?.okCount ?? 0) + (obs.ok ? 1 : 0);
  const badCount = (existing?.badCount ?? 0) + (obs.ok ? 0 : 1);

  // مدیر اگر دستی تصمیم گرفته باشد، آمار خودکار رویش دست نمی‌گذارد
  const blocked = existing?.pinned
    ? existing.blocked
    : obs.ok
      ? false
      : badCount >= settings.ipPrefixBadThreshold;

  await prisma.ipPrefixHealth.upsert({
    where: { prefix },
    create: {
      prefix,
      locationName: obs.locationName ?? null,
      datacenter: obs.datacenter ?? null,
      okCount,
      badCount,
      lastOkAt: obs.ok ? now : null,
      lastBadAt: obs.ok ? null : now,
      blocked,
    },
    update: {
      locationName: obs.locationName ?? existing?.locationName ?? null,
      datacenter: obs.datacenter ?? existing?.datacenter ?? null,
      okCount,
      badCount,
      ...(obs.ok ? { lastOkAt: now } : { lastBadAt: now }),
      blocked,
    },
  });
}

/** آیا این آدرس در بلوکی است که قبلاً سوخته اعلام شده؟ */
export async function isPrefixBlocked(ip: string | null | undefined): Promise<boolean> {
  const prefix = prefixOf(ip);
  if (!prefix) return false;
  const row = await prisma.ipPrefixHealth.findUnique({
    where: { prefix },
    select: { blocked: true },
  });
  return Boolean(row?.blocked);
}

/** فهرست بلوک‌های سوخته برای نمایش در پنل مدیریت */
export async function blockedPrefixes(limit = 200) {
  return prisma.ipPrefixHealth.findMany({
    where: { blocked: true },
    orderBy: [{ lastBadAt: 'desc' }],
    take: limit,
  });
}

/**
 * نرخ موفقیت هر لوکیشن.
 *
 * این عدد به مشتری نشان می‌دهد کدام لوکیشن برای دسترسی از ایران وضعیت بهتری
 * دارد — چیزی که هیچ‌کدام از رقبا نمی‌توانند بگویند، چون داده‌اش را ندارند.
 */
export async function locationReachability() {
  const rows = await prisma.ipPrefixHealth.groupBy({
    by: ['locationName'],
    _sum: { okCount: true, badCount: true },
    _count: { _all: true },
  });

  return rows
    .filter((r) => r.locationName)
    .map((r) => {
      const ok = r._sum.okCount ?? 0;
      const bad = r._sum.badCount ?? 0;
      const total = ok + bad;
      return {
        locationName: r.locationName as string,
        prefixes: r._count._all,
        ok,
        bad,
        samples: total,
        successPercent: total > 0 ? Math.round((ok / total) * 100) : null,
      };
    })
    .sort((a, b) => (b.successPercent ?? -1) - (a.successPercent ?? -1));
}

/** خلاصه وضعیت برای داشبورد مدیریت */
export async function prefixOverview() {
  const [total, blocked, recentBad] = await Promise.all([
    prisma.ipPrefixHealth.count(),
    prisma.ipPrefixHealth.count({ where: { blocked: true } }),
    prisma.ipPrefixHealth.count({
      where: { blocked: true, lastBadAt: { gte: new Date(Date.now() - 7 * 24 * 3600_000) } },
    }),
  ]);
  return { total, blocked, blockedThisWeek: recentBad };
}
