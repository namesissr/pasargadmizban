import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireAdmin, clientIp, assertSameOrigin } from '@/lib/auth';
import { catalogToggleSchema } from '@/lib/validation';
import { invalidatePricingCache } from '@/lib/pricing';
import { lastCatalogSync, CATEGORY_FA } from '@/lib/catalog';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  await requireAdmin();

  const [serverTypes, locations, images, datacenters, syncedAt] = await Promise.all([
    prisma.hetznerServerType.findMany({ orderBy: [{ sortOrder: 'asc' }] }),
    prisma.hetznerLocation.findMany({ orderBy: { sortOrder: 'asc' }, include: { datacenters: true } }),
    prisma.hetznerImage.findMany({ orderBy: [{ sortOrder: 'asc' }, { description: 'asc' }] }),
    prisma.hetznerDatacenter.count(),
    lastCatalogSync(),
  ]);

  const usage = await prisma.server.groupBy({
    by: ['serverTypeName'],
    where: { status: { notIn: ['DELETED'] } },
    _count: true,
  });
  const usageMap = Object.fromEntries(usage.map((u) => [u.serverTypeName, u._count]));

  return ok({
    syncedAt,
    categories: CATEGORY_FA,
    counts: { serverTypes: serverTypes.length, locations: locations.length, images: images.length, datacenters },
    serverTypes: serverTypes.map((st) => ({
      id: st.id,
      name: st.name,
      description: st.description,
      cores: st.cores,
      cpuType: st.cpuType,
      architecture: st.architecture,
      memory: st.memory,
      disk: st.disk,
      category: st.category,
      deprecated: st.deprecated,
      enabled: st.enabled,
      sortOrder: st.sortOrder,
      includedTraffic: Number(st.includedTraffic),
      inUse: usageMap[st.name] ?? 0,
      priceLocations: (st.prices as { location: string }[] | null)?.map((p) => p.location) ?? [],
    })),
    locations: locations.map((l) => ({
      id: l.id,
      name: l.name,
      description: l.description,
      city: l.city,
      country: l.country,
      networkZone: l.networkZone,
      enabled: l.enabled,
      sortOrder: l.sortOrder,
      flag: l.flagEmoji,
      title: l.faTitle,
      datacenters: l.datacenters.length,
      availableTypes: [...new Set(l.datacenters.flatMap((d) => (d.available as string[]) ?? []))].length,
    })),
    images: images.map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description,
      osFlavor: i.osFlavor,
      osVersion: i.osVersion,
      architecture: i.architecture,
      enabled: i.enabled,
      sortOrder: i.sortOrder,
    })),
  });
});

/** فعال یا غیرفعال کردن یک آیتم کاتالوگ برای فروش */
export const PATCH = route(async (req: Request) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const input = await parseBody(req, catalogToggleSchema);

  const data = {
    enabled: input.enabled,
    ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
  };

  if (input.kind === 'serverType') {
    await prisma.hetznerServerType.update({ where: { id: input.id }, data }).catch(() => {
      throw new ApiError('پلن یافت نشد.', 404);
    });
  } else if (input.kind === 'location') {
    await prisma.hetznerLocation.update({ where: { id: input.id }, data }).catch(() => {
      throw new ApiError('لوکیشن یافت نشد.', 404);
    });
  } else {
    await prisma.hetznerImage.update({ where: { id: input.id }, data }).catch(() => {
      throw new ApiError('سیستم‌عامل یافت نشد.', 404);
    });
  }

  invalidatePricingCache();

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.catalog_toggle',
    entity: input.kind,
    entityId: String(input.id),
    ip: await clientIp(),
    meta: { enabled: input.enabled },
  });

  return ok({ updated: true, message: input.enabled ? 'برای فروش فعال شد.' : 'از فروش خارج شد.' });
});
