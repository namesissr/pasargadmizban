import { ok, route, ApiError } from '@/lib/api';
import { requireAdmin, clientIp, assertSameOrigin } from '@/lib/auth';
import { syncCatalog } from '@/lib/catalog';
import { enforceRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { hasAnyAccount } from '@/lib/hetzner-accounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** همگام‌سازی دستی کاتالوگ با هتزنر */
export const POST = route(async () => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  await enforceRateLimit('catalog-sync', 6, 600, { persistent: true });

  if (!(await hasAnyAccount())) {
    throw new ApiError(
      'هنوز هیچ حساب هتزنری اضافه نشده است. ابتدا در بخش «حساب‌های هتزنر» توکن API خود را ثبت کنید.',
      400,
      { code: 'no_account' },
    );
  }

  const result = await syncCatalog();

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.catalog_sync',
    entity: 'catalog',
    ip: await clientIp(),
    meta: result,
  });

  return ok({
    ...result,
    message: `کاتالوگ به‌روزرسانی شد: ${result.serverTypes} پلن، ${result.locations} لوکیشن و ${result.images} سیستم‌عامل.`,
  });
});
