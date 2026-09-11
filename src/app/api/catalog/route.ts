import prisma from '@/lib/prisma';
import { ok, route } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth';
import { buildCatalogPrices } from '@/lib/pricing';
import { getSettings } from '@/lib/settings';
import { CATEGORY_FA } from '@/lib/catalog';
import { locationReachability } from '@/lib/ip-prefix';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * کاتالوگ کامل برای صفحه ساخت سرور:
 * پلن‌ها با قیمت تومانی هر لوکیشن، لوکیشن‌های فعال و سیستم‌عامل‌ها.
 */
export const GET = route(async () => {
  const user = await getCurrentUser();
  const settings = await getSettings();

  const [{ items, locations }, images, reachability] = await Promise.all([
    buildCatalogPrices(user?.id, user?.discountPct ?? 0),
    prisma.hetznerImage.findMany({
      where: { enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { description: 'asc' }],
    }),
    locationReachability(),
  ]);

  // نرخ دسترسی هر لوکیشن از داخل ایران — بر پایه آزمایش‌های واقعی همین پنل.
  // فقط وقتی نشان داده می‌شود که نمونه کافی جمع شده باشد، وگرنه گمراه‌کننده است.
  const MIN_SAMPLES = 10;
  const reachByLocation = new Map(
    reachability
      .filter((r) => r.samples >= MIN_SAMPLES && r.successPercent !== null)
      .map((r) => [r.locationName, r.successPercent as number]),
  );

  return ok({
    locations: locations.map((l) => ({
      name: l.name,
      description: l.description,
      city: l.city,
      country: l.country,
      networkZone: l.networkZone,
      flag: l.flagEmoji,
      title: l.faTitle ?? l.description,
      /** درصد آدرس‌هایی که از داخل ایران باز شده‌اند — تهی یعنی هنوز داده کافی نداریم */
      iranReachPercent: reachByLocation.get(l.name) ?? null,
    })),
    categories: CATEGORY_FA,
    plans: items.map(({ serverType, prices }) => ({
      name: serverType.name,
      description: serverType.description,
      cores: serverType.cores,
      cpuType: serverType.cpuType,
      architecture: serverType.architecture,
      memory: serverType.memory,
      disk: serverType.disk,
      storageType: serverType.storageType,
      category: serverType.category,
      includedTraffic: Number(serverType.includedTraffic),
      prices: Object.fromEntries(
        Object.entries(prices).map(([loc, p]) => [
          loc,
          {
            hourly: Number(p.hourly),
            monthly: Number(p.monthly),
            available: p.available,
          },
        ]),
      ),
    })),
    images: images.map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description,
      osFlavor: i.osFlavor,
      osVersion: i.osVersion,
      architecture: i.architecture,
    })),
    settings: {
      hourlyPrepayHours: settings.hourlyPrepayHours,
      backupPercent: 20,
    },
  });
});
