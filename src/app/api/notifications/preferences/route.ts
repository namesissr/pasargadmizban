import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, parseBody, route } from '@/lib/api';
import { requireUser, assertSameOrigin } from '@/lib/auth';
import { getPreferences, updatePreferences, preferenceDefaults, KIND_LABEL } from '@/lib/preferences';
import { getSettings } from '@/lib/settings';
import { telegramConfigured } from '@/lib/telegram';
import { burnRate } from '@/lib/billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  telegramEnabled: z.boolean().optional(),

  lowBalanceEnabled: z.boolean().optional(),
  lowBalanceHours: z.coerce.number().int().min(1).max(720).optional(),
  lowBalanceAmount: z.coerce.number().int().min(0).max(1_000_000_000).optional(),

  trafficAlertEnabled: z.boolean().optional(),
  trafficAlertPercent: z.coerce.number().int().min(10).max(100).optional(),

  monthlyBudget: z.coerce.number().int().min(0).max(10_000_000_000).optional(),
  budgetAlertPercent: z.coerce.number().int().min(10).max(100).optional(),

  serverEvents: z.boolean().optional(),
  billingEvents: z.boolean().optional(),
  ticketEvents: z.boolean().optional(),
  monitorEvents: z.boolean().optional(),
  newsEvents: z.boolean().optional(),
  weeklyReport: z.boolean().optional(),

  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: z.coerce.number().int().min(0).max(23).optional(),
  quietHoursEnd: z.coerce.number().int().min(0).max(23).optional(),
});

export const GET = route(async () => {
  const user = await requireUser();

  const [prefs, defaults, settings, telegram, burn, balanceRow] = await Promise.all([
    getPreferences(user.id),
    preferenceDefaults(),
    getSettings(),
    prisma.telegramLink.findUnique({
      where: { userId: user.id },
      select: { chatId: true, username: true, firstName: true, active: true, linkedAt: true },
    }),
    burnRate(user.id),
    prisma.user.findUnique({ where: { id: user.id }, select: { balance: true } }),
  ]);

  // تخمین اینکه با تنظیم فعلی، هشدار در چه مبلغی فرستاده می‌شود
  const balance = balanceRow?.balance ?? 0n;
  const thresholdAmount = burn.hourly * BigInt(prefs.lowBalanceHours);
  const hoursLeft = burn.hourly > 0n ? Number(balance / burn.hourly) : null;

  return ok({
    preferences: {
      ...prefs,
      lowBalanceAmount: Number(prefs.lowBalanceAmount),
      monthlyBudget: Number(prefs.monthlyBudget),
    },
    defaults,
    kinds: KIND_LABEL,
    channels: {
      email: settings.channelEmail,
      sms: settings.channelSms && Boolean(settings.channelSms),
      telegram: settings.telegramEnabled && settings.channelTelegram && telegramConfigured(),
    },
    telegram: telegram
      ? {
          linked: true,
          username: telegram.username,
          firstName: telegram.firstName,
          active: telegram.active,
          linkedAt: telegram.linkedAt,
        }
      : { linked: false },
    botUsername: settings.telegramBotUsername,
    estimate: {
      hourlyBurn: Number(burn.hourly),
      thresholdAmount: Number(thresholdAmount),
      balance: Number(balance),
      hoursLeft,
    },
  });
});

export const PATCH = route(async (req: Request) => {
  await assertSameOrigin();
  const user = await requireUser();
  const input = await parseBody(req, schema);

  const patch = {
    ...input,
    ...(input.lowBalanceAmount !== undefined ? { lowBalanceAmount: BigInt(input.lowBalanceAmount) } : {}),
    ...(input.monthlyBudget !== undefined ? { monthlyBudget: BigInt(input.monthlyBudget) } : {}),
  };

  const prefs = await updatePreferences(user.id, patch as never);

  return ok({
    preferences: {
      ...prefs,
      lowBalanceAmount: Number(prefs.lowBalanceAmount),
      monthlyBudget: Number(prefs.monthlyBudget),
    },
    message: 'تنظیمات اطلاع‌رسانی ذخیره شد.',
  });
});
