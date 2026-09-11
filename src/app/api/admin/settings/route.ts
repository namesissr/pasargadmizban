import { ok, parseBody, route } from '@/lib/api';
import { requireAdmin, clientIp, assertSameOrigin } from '@/lib/auth';
import { adminSettingsSchema } from '@/lib/validation';
import { getSettings, setSettings, DEFAULT_SETTINGS } from '@/lib/settings';
import { invalidatePricingCache } from '@/lib/pricing';
import { audit } from '@/lib/audit';
import { env } from '@/lib/env';
import { telegramConfigured, getBotInfo, getWebhookInfo } from '@/lib/telegram';
import { capacityOverview } from '@/lib/hetzner-accounts';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  await requireAdmin();
  const settings = await getSettings(true);

  // وضعیت ربات تلگرام
  let bot: { username: string | null; webhook: string | null; pending: number; linkedUsers: number } | null = null;
  if (telegramConfigured()) {
    const [info, hook, linkedUsers] = await Promise.all([
      getBotInfo(),
      getWebhookInfo(),
      prisma.telegramLink.count({ where: { active: true } }),
    ]);
    bot = {
      username: info?.username ?? null,
      webhook: hook?.url || null,
      pending: hook?.pending_update_count ?? 0,
      linkedUsers,
    };
    if (info?.username && info.username !== settings.telegramBotUsername) {
      await setSettings({ telegramBotUsername: info.username }).catch(() => null);
    }
  }

  const [monitors, referrals, capacity] = await Promise.all([
    prisma.serverMonitor.count({ where: { enabled: true } }),
    prisma.referralCommission.aggregate({ _sum: { amount: true }, _count: true }),
    capacityOverview(),
  ]);

  // رمز SMTP حتی رمزنگاری‌شده هم نباید به مرورگر برود
  const { smtpPassEnc: _smtpPassEnc, ...safeSettings } = settings;

  return ok({
    settings: { ...safeSettings, smtpHasPass: Boolean(settings.smtpPassEnc) },
    defaults: DEFAULT_SETTINGS,
    integrations: {
      hetzner: capacity.totals.enabled > 0,
      smtp: env.smtp.enabled,
      sms: env.sms.enabled,
      telegram: telegramConfigured(),
      zibalSandbox: env.zibal.sandbox,
      appUrl: env.appUrl,
    },
    bot,
    hetznerCapacity: capacity.totals,
    stats: {
      activeMonitors: monitors,
      referralPaid: Number(referrals._sum.amount ?? 0),
      referralCount: referrals._count,
    },
  });
});

export const PATCH = route(async (req: Request) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const input = await parseBody(req, adminSettingsSchema);

  const before = await getSettings(true);
  const settings = await setSettings(input as never);
  invalidatePricingCache();

  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(input) as (keyof typeof input)[]) {
    if (before[key as keyof typeof before] !== settings[key as keyof typeof settings]) {
      changed[key] = { from: before[key as keyof typeof before], to: settings[key as keyof typeof settings] };
    }
  }

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.settings_update',
    entity: 'settings',
    ip: await clientIp(),
    meta: { changed } as never,
  });

  return ok({ settings, message: 'تنظیمات ذخیره شد.' });
});
