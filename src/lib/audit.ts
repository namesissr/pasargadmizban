import prisma from './prisma';
import type { Prisma } from '@prisma/client';

export type AuditInput = {
  userId?: string | null;
  actorType?: 'user' | 'admin' | 'system' | 'gateway';
  action: string;
  entity?: string;
  entityId?: string;
  ip?: string;
  userAgent?: string;
  meta?: Prisma.InputJsonValue;
};

/** ثبت رویداد در دفتر ممیزی — هرگز خطا پرتاب نمی‌کند */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        actorType: input.actorType ?? 'user',
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        ip: input.ip?.slice(0, 64),
        userAgent: input.userAgent?.slice(0, 255),
        meta: input.meta ?? {},
      },
    });
  } catch (err) {
    console.error('[audit] ثبت لاگ ناموفق بود:', err);
  }
}

/** برچسب فارسی برای نمایش در پنل مدیریت */
export const AUDIT_LABELS: Record<string, string> = {
  'auth.register': 'ثبت‌نام',
  'auth.login': 'ورود موفق',
  'auth.login_failed': 'ورود ناموفق',
  'auth.logout': 'خروج',
  'auth.password_reset_request': 'درخواست بازیابی رمز',
  'auth.password_reset': 'تغییر رمز عبور',
  'auth.email_verified': 'تایید ایمیل',
  'auth.sessions_revoked': 'ابطال همه نشست‌ها',
  'wallet.topup_start': 'شروع شارژ کیف پول',
  'wallet.topup_success': 'شارژ موفق کیف پول',
  'wallet.topup_failed': 'شارژ ناموفق کیف پول',
  'wallet.manual_receipt': 'ثبت رسید واریز دستی',
  'server.create': 'ساخت سرور',
  'server.delete': 'حذف سرور',
  'server.action': 'عملیات روی سرور',
  'server.rebuild': 'نصب مجدد سیستم‌عامل',
  'server.reset_password': 'تغییر رمز روت',
  'server.resize': 'ارتقای پلن',
  'server.renew': 'تمدید سرور',
  'server.suspend': 'تعلیق سرور',
  'server.unsuspend': 'رفع تعلیق سرور',
  'ticket.create': 'ایجاد تیکت',
  'ticket.reply': 'پاسخ تیکت',
  'ticket.close': 'بستن تیکت',
  'sshkey.create': 'افزودن کلید SSH',
  'sshkey.delete': 'حذف کلید SSH',
  'admin.user_update': 'ویرایش کاربر توسط مدیر',
  'admin.balance_adjust': 'تعدیل دستی موجودی',
  'admin.settings_update': 'تغییر تنظیمات',
  'admin.pricing_update': 'تغییر قیمت‌گذاری',
  'admin.catalog_sync': 'همگام‌سازی کاتالوگ هتزنر',
  'admin.impersonate': 'ورود به حساب کاربر',
  'billing.hourly_charge': 'کسر ساعتی',
  'billing.invoice_created': 'صدور فاکتور',
  'billing.invoice_paid': 'پرداخت فاکتور',
};

export function auditLabel(action: string): string {
  return AUDIT_LABELS[action] ?? action;
}
