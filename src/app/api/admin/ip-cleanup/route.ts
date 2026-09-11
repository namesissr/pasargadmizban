import { ok, route } from '@/lib/api';
import { requireAdmin, requireStaff, clientIp, assertSameOrigin } from '@/lib/auth';
import { listOrphanIps, cleanupOrphanIps } from '@/lib/ip-cleanup';
import { enforceRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** فهرست آدرس‌های بلااستفاده در همه حساب‌ها، بدون حذف */
export const GET = route(async () => {
  await requireStaff();
  return ok(await listOrphanIps());
});

/** حذف همه آدرس‌های بلااستفاده، همین حالا */
export const POST = route(async () => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  await enforceRateLimit(`ip-cleanup:${admin.id}`, 10, 600, { persistent: true });

  const result = await cleanupOrphanIps();

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.ip_cleanup',
    entity: 'hetzner_account',
    ip: await clientIp(),
    meta: { found: result.found, deleted: result.deleted, failed: result.failed.length },
  });

  return ok({
    ...result,
    message:
      result.found === 0
        ? 'هیچ آدرس بلااستفاده‌ای پیدا نشد؛ حساب‌های هتزنر تمیزند.'
        : `${result.deleted} آدرس بلااستفاده حذف شد` +
          (result.failed.length ? ` و ${result.failed.length} مورد حذف نشد.` : '.'),
  });
});
