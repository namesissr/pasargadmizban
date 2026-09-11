import prisma from './prisma';
import type { HPrice } from './hetzner';
import { catalogClient } from './hetzner-accounts';
import { invalidatePricingCache } from './pricing';
import { locationFa } from './utils';

/**
 * همگام‌سازی کاتالوگ هتزنر (لوکیشن‌ها، دیتاسنترها، پلن‌ها، ایمیج‌ها) با دیتابیس محلی.
 * این کار باعث می‌شود صفحه ساخت سرور بدون تماس با API هتزنر و بسیار سریع باز شود.
 */

/** دسته‌بندی پلن‌ها بر اساس پیشوند نام هتزنر */
function categoryOf(name: string): string {
  const n = name.toLowerCase();
  if (n.startsWith('cax')) return 'arm';
  if (n.startsWith('ccx')) return 'dedicated';
  if (n.startsWith('cpx')) return 'shared-amd';
  if (n.startsWith('cx')) return 'shared-intel';
  return 'other';
}

export const CATEGORY_FA: Record<string, string> = {
  'shared-intel': 'پردازنده اشتراکی Intel',
  'shared-amd': 'پردازنده اشتراکی AMD',
  arm: 'پردازنده ARM (اقتصادی)',
  dedicated: 'پردازنده اختصاصی',
  other: 'سایر',
};

function sortWeight(name: string): number {
  const category = categoryOf(name);
  const base = { arm: 0, 'shared-intel': 100, 'shared-amd': 200, dedicated: 300, other: 400 }[category] ?? 400;
  const num = Number(name.replace(/\D/g, '')) || 0;
  return base + num;
}

export type SyncResult = {
  locations: number;
  datacenters: number;
  serverTypes: number;
  images: number;
  durationMs: number;
};

export async function syncCatalog(opts: { includeImages?: boolean } = {}): Promise<SyncResult> {
  const started = Date.now();
  const client = await catalogClient();

  const [locations, datacenters, serverTypes] = await Promise.all([
    client.listLocations(),
    client.listDatacenters(),
    client.listServerTypes(),
  ]);

  // ── لوکیشن‌ها ──
  for (const [i, loc] of locations.entries()) {
    const fa = locationFa(loc.name, loc.city, loc.country);
    await prisma.hetznerLocation.upsert({
      where: { id: loc.id },
      create: {
        id: loc.id,
        name: loc.name,
        description: loc.description,
        country: loc.country,
        city: loc.city,
        networkZone: loc.network_zone,
        latitude: loc.latitude,
        longitude: loc.longitude,
        sortOrder: i,
        flagEmoji: fa.flag,
        faTitle: fa.title,
      },
      update: {
        description: loc.description,
        country: loc.country,
        city: loc.city,
        networkZone: loc.network_zone,
        latitude: loc.latitude,
        longitude: loc.longitude,
        flagEmoji: fa.flag,
        faTitle: fa.title,
      },
    });
  }

  // ── دیتاسنترها ──
  const typeNameById = new Map(serverTypes.map((t) => [t.id, t.name]));
  for (const dc of datacenters) {
    const available = (dc.server_types?.available ?? []).map((id) => typeNameById.get(id)).filter(Boolean) as string[];
    const supported = (dc.server_types?.supported ?? []).map((id) => typeNameById.get(id)).filter(Boolean) as string[];
    await prisma.hetznerDatacenter.upsert({
      where: { id: dc.id },
      create: {
        id: dc.id,
        name: dc.name,
        description: dc.description,
        locationId: dc.location.id,
        available,
        supported,
      },
      update: { description: dc.description, locationId: dc.location.id, available, supported },
    });
  }

  // ── پلن‌ها ──
  for (const st of serverTypes) {
    const prices: HPrice[] = st.prices ?? [];
    const includedTraffic = BigInt(
      st.included_traffic ?? prices[0]?.included_traffic ?? 0,
    );
    await prisma.hetznerServerType.upsert({
      where: { id: st.id },
      create: {
        id: st.id,
        name: st.name,
        description: st.description,
        cores: st.cores,
        cpuType: st.cpu_type,
        architecture: st.architecture ?? 'x86',
        memory: st.memory,
        disk: st.disk,
        storageType: st.storage_type ?? 'local',
        includedTraffic,
        deprecated: Boolean(st.deprecated || st.deprecation),
        enabled: !st.deprecated && !st.deprecation,
        category: categoryOf(st.name),
        sortOrder: sortWeight(st.name),
        prices: prices as never,
      },
      update: {
        description: st.description,
        cores: st.cores,
        cpuType: st.cpu_type,
        architecture: st.architecture ?? 'x86',
        memory: st.memory,
        disk: st.disk,
        storageType: st.storage_type ?? 'local',
        includedTraffic,
        deprecated: Boolean(st.deprecated || st.deprecation),
        category: categoryOf(st.name),
        sortOrder: sortWeight(st.name),
        prices: prices as never,
      },
    });
  }

  // ── ایمیج‌ها ──
  let imageCount = 0;
  if (opts.includeImages !== false) {
    const images = await client.listImages('system');
    const flavorOrder = ['ubuntu', 'debian', 'rocky', 'alma', 'centos', 'fedora', 'opensuse', 'alpine', 'arch'];
    for (const img of images) {
      if (img.deprecated) continue;
      const order = flavorOrder.indexOf(img.os_flavor);
      await prisma.hetznerImage.upsert({
        where: { id: img.id },
        create: {
          id: img.id,
          name: img.name,
          description: img.description,
          osFlavor: img.os_flavor,
          osVersion: img.os_version,
          type: img.type,
          architecture: img.architecture ?? 'x86',
          diskSize: img.disk_size,
          sortOrder: (order < 0 ? 90 : order) * 10,
        },
        update: {
          name: img.name,
          description: img.description,
          osFlavor: img.os_flavor,
          osVersion: img.os_version,
          architecture: img.architecture ?? 'x86',
          diskSize: img.disk_size,
          sortOrder: (order < 0 ? 90 : order) * 10,
        },
      });
      imageCount++;
    }
  }

  invalidatePricingCache();

  return {
    locations: locations.length,
    datacenters: datacenters.length,
    serverTypes: serverTypes.length,
    images: imageCount,
    durationMs: Date.now() - started,
  };
}

/** آخرین زمان همگام‌سازی */
export async function lastCatalogSync(): Promise<Date | null> {
  const row = await prisma.hetznerServerType.findFirst({
    orderBy: { updatedAt: 'desc' },
    select: { updatedAt: true },
  });
  return row?.updatedAt ?? null;
}

/** آیا کاتالوگ خالی است؟ (برای نمایش پیام راهنما در پنل) */
export async function catalogIsEmpty(): Promise<boolean> {
  const count = await prisma.hetznerServerType.count();
  return count === 0;
}

/** بررسی در دسترس بودن یک پلن در یک لوکیشن */
export async function isAvailable(serverTypeName: string, locationName: string): Promise<boolean> {
  const location = await prisma.hetznerLocation.findUnique({
    where: { name: locationName },
    include: { datacenters: true },
  });
  if (!location || !location.enabled) return false;
  return location.datacenters.some((dc) => ((dc.available as string[]) ?? []).includes(serverTypeName));
}

/** یافتن نام دیتاسنتر مناسب برای یک پلن در یک لوکیشن */
export async function pickDatacenter(serverTypeName: string, locationName: string): Promise<string | null> {
  const location = await prisma.hetznerLocation.findUnique({
    where: { name: locationName },
    include: { datacenters: true },
  });
  if (!location) return null;
  const dc = location.datacenters.find((d) => ((d.available as string[]) ?? []).includes(serverTypeName));
  return dc?.name ?? null;
}
