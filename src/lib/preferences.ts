import prisma from './prisma';
import type { NotificationPreference } from '@prisma/client';
import { getSettings } from './settings';

/**
 * ترجیحات اطلاع‌رسانی هر کاربر.
 * اگر کاربر هنوز ترجیحی ثبت نکرده باشد، رکورد با مقادیر پیش‌فرض سامانه ساخته می‌شود.
 */

export type PrefsShape = {
  emailEnabled: boolean;
  smsEnabled: boolean;
  telegramEnabled: boolean;

  lowBalanceEnabled: boolean;
  lowBalanceHours: number;
  lowBalanceAmount: bigint;

  trafficAlertEnabled: boolean;
  trafficAlertPercent: number;

  monthlyBudget: bigint;
  budgetAlertPercent: number;

  serverEvents: boolean;
  billingEvents: boolean;
  ticketEvents: boolean;
  monitorEvents: boolean;
  newsEvents: boolean;

  quietHoursEnabled: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
};

/** دسته‌بندی رویداد — تعیین می‌کند کدام ترجیح کاربر بررسی شود */
export type NotifyKind =
  | 'server'
  | 'billing'
  | 'ticket'
  | 'monitor'
  | 'news'
  /** امنیتی و سیستمی: همیشه ارسال می‌شود و قابل غیرفعال کردن نیست */
  | 'security';

const KIND_FIELD: Record<Exclude<NotifyKind, 'security'>, keyof PrefsShape> = {
  server: 'serverEvents',
  billing: 'billingEvents',
  ticket: 'ticketEvents',
  monitor: 'monitorEvents',
  news: 'newsEvents',
};

export const KIND_LABEL: Record<NotifyKind, string> = {
  server: 'رویدادهای سرور',
  billing: 'مالی و صورتحساب',
  ticket: 'پشتیبانی و تیکت',
  monitor: 'قطعی و در دسترس بودن سرور',
  news: 'اطلاعیه‌ها و تخفیف‌ها',
  security: 'امنیت حساب',
};

/** ساخت یا خواندن ترجیحات کاربر */
export async function getPreferences(userId: string): Promise<NotificationPreference> {
  const existing = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (existing) return existing;

  const settings = await getSettings();
  return prisma.notificationPreference.create({
    data: {
      userId,
      emailEnabled: settings.channelEmail,
      smsEnabled: settings.channelSms,
      telegramEnabled: settings.channelTelegram,
      lowBalanceHours: settings.defaultLowBalanceHours,
      trafficAlertPercent: settings.defaultTrafficAlertPercent,
    },
  });
}

/** خواندن بدون ساخت رکورد — برای مسیرهایی که فقط می‌خوانند */
export async function readPreferences(userId: string): Promise<NotificationPreference | null> {
  return prisma.notificationPreference.findUnique({ where: { userId } });
}

export async function updatePreferences(
  userId: string,
  patch: Partial<PrefsShape>,
): Promise<NotificationPreference> {
  await getPreferences(userId);
  return prisma.notificationPreference.update({ where: { userId }, data: patch });
}

/** آیا این دسته رویداد برای کاربر فعال است؟ */
export function kindEnabled(prefs: NotificationPreference | null, kind: NotifyKind): boolean {
  if (kind === 'security') return true;
  if (!prefs) return true;
  const field = KIND_FIELD[kind];
  return Boolean(prefs[field as keyof NotificationPreference]);
}

/**
 * آیا الان داخل ساعات سکوت کاربر هستیم؟
 * ساعت بر اساس منطقه زمانی تهران محاسبه می‌شود.
 */
export function inQuietHours(prefs: NotificationPreference | null, now = new Date()): boolean {
  if (!prefs?.quietHoursEnabled) return false;

  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tehran',
      hour: '2-digit',
      hour12: false,
    }).format(now),
  );

  const { quietHoursStart: start, quietHoursEnd: end } = prefs;
  if (start === end) return false;
  // بازه‌ای که از نیمه‌شب عبور می‌کند، مثلاً ۲۳ تا ۸
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** پیش‌فرض‌های سامانه برای نمایش در فرم تنظیمات */
export async function preferenceDefaults() {
  const settings = await getSettings();
  return {
    lowBalanceHours: settings.defaultLowBalanceHours,
    trafficAlertPercent: settings.defaultTrafficAlertPercent,
    channels: {
      email: settings.channelEmail,
      sms: settings.channelSms,
      telegram: settings.channelTelegram && settings.telegramEnabled,
    },
  };
}
