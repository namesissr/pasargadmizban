import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ───────────────  تاریخ شمسی  ───────────────

const jalaliDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const jalaliDateTime = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const jalaliLong = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

function asDate(input: Date | string | number | null | undefined): Date | null {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function faDate(input: Date | string | number | null | undefined): string {
  const d = asDate(input);
  return d ? jalaliDate.format(d) : '—';
}

export function faDateTime(input: Date | string | number | null | undefined): string {
  const d = asDate(input);
  return d ? jalaliDateTime.format(d) : '—';
}

export function faDateLong(input: Date | string | number | null | undefined): string {
  const d = asDate(input);
  return d ? jalaliLong.format(d) : '—';
}

/** «۳ ساعت پیش» / «۲ روز دیگر» */
export function faRelative(input: Date | string | number | null | undefined): string {
  const d = asDate(input);
  if (!d) return '—';
  const diffMs = d.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat('fa-IR', { numeric: 'auto' });

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 24 * 3600_000],
    ['month', 30 * 24 * 3600_000],
    ['day', 24 * 3600_000],
    ['hour', 3600_000],
    ['minute', 60_000],
    ['second', 1000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === 'second') {
      return rtf.format(Math.round(diffMs / ms), unit);
    }
  }
  return 'هم‌اکنون';
}

/** فاصله زمانی به شکل «۳ روز و ۴ ساعت» */
export function faDuration(ms: number): string {
  if (ms <= 0) return 'منقضی شده';
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const parts: string[] = [];
  if (days) parts.push(`${toFa(days)} روز`);
  if (hours) parts.push(`${toFa(hours)} ساعت`);
  if (!days && minutes) parts.push(`${toFa(minutes)} دقیقه`);
  return parts.join(' و ') || 'کمتر از یک دقیقه';
}

function toFa(n: number): string {
  return new Intl.NumberFormat('fa-IR', { useGrouping: false }).format(n);
}

// ───────────────  برچسب‌های فارسی  ───────────────

export const SERVER_STATUS_FA: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }> = {
  PROVISIONING: { label: 'در حال ساخت', tone: 'warn' },
  RUNNING: { label: 'روشن', tone: 'ok' },
  OFF: { label: 'خاموش', tone: 'muted' },
  REBUILDING: { label: 'در حال نصب مجدد', tone: 'warn' },
  MIGRATING: { label: 'در حال انتقال', tone: 'warn' },
  SUSPENDED: { label: 'تعلیق‌شده', tone: 'bad' },
  DELETING: { label: 'در حال حذف', tone: 'bad' },
  DELETED: { label: 'حذف‌شده', tone: 'muted' },
  ERROR: { label: 'خطا', tone: 'bad' },
};

/** نتیجه بررسی دسترسی آدرس از داخل ایران */
export const IP_REACH_FA: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }> = {
  OK: { label: 'از ایران تاییدشده', tone: 'ok' },
  BLOCKED: { label: 'از ایران مسدود', tone: 'bad' },
  INCONCLUSIVE: { label: 'نتیجه نامشخص', tone: 'warn' },
  UNKNOWN: { label: 'در انتظار بررسی', tone: 'muted' },
  SKIPPED: { label: 'بررسی نشد', tone: 'muted' },
};

export const TX_TYPE_FA: Record<string, string> = {
  DEPOSIT: 'شارژ کیف پول',
  CHARGE: 'کسر بابت سرویس',
  REFUND: 'بازگشت وجه',
  BONUS: 'هدیه',
  ADJUSTMENT: 'تعدیل دستی',
  WITHDRAW: 'برداشت',
};

export const TX_STATUS_FA: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }> = {
  PENDING: { label: 'در انتظار', tone: 'warn' },
  SUCCESS: { label: 'موفق', tone: 'ok' },
  FAILED: { label: 'ناموفق', tone: 'bad' },
  CANCELED: { label: 'لغو شده', tone: 'muted' },
};

export const INVOICE_STATUS_FA: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }> = {
  DRAFT: { label: 'پیش‌نویس', tone: 'muted' },
  UNPAID: { label: 'پرداخت‌نشده', tone: 'warn' },
  PAID: { label: 'پرداخت‌شده', tone: 'ok' },
  CANCELED: { label: 'لغو شده', tone: 'muted' },
  REFUNDED: { label: 'مسترد شده', tone: 'muted' },
};

export const TICKET_STATUS_FA: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }> = {
  OPEN: { label: 'باز', tone: 'warn' },
  ANSWERED: { label: 'پاسخ داده شده', tone: 'ok' },
  CUSTOMER_REPLY: { label: 'پاسخ مشتری', tone: 'warn' },
  ON_HOLD: { label: 'در انتظار', tone: 'muted' },
  CLOSED: { label: 'بسته', tone: 'muted' },
};

export const TICKET_PRIORITY_FA: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }> = {
  LOW: { label: 'کم', tone: 'muted' },
  MEDIUM: { label: 'متوسط', tone: 'ok' },
  HIGH: { label: 'زیاد', tone: 'warn' },
  URGENT: { label: 'فوری', tone: 'bad' },
};

export const USER_STATUS_FA: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }> = {
  PENDING: { label: 'در انتظار تایید', tone: 'warn' },
  ACTIVE: { label: 'فعال', tone: 'ok' },
  SUSPENDED: { label: 'تعلیق', tone: 'bad' },
  BANNED: { label: 'مسدود', tone: 'bad' },
};

export const ROLE_FA: Record<string, string> = {
  USER: 'کاربر',
  SUPPORT: 'پشتیبان',
  ADMIN: 'مدیر',
};

export const SERVER_ACTION_FA: Record<string, string> = {
  create_server: 'ساخت سرور',
  start_server: 'روشن کردن',
  poweron: 'روشن کردن',
  stop_server: 'خاموش کردن',
  poweroff: 'خاموش کردن (قطع برق)',
  shutdown_server: 'خاموش کردن نرم',
  shutdown: 'خاموش کردن نرم',
  reboot_server: 'راه‌اندازی مجدد',
  reboot: 'راه‌اندازی مجدد',
  reset_server: 'ریست سخت',
  reset: 'ریست سخت',
  reset_password: 'تغییر رمز روت',
  rebuild_server: 'نصب مجدد سیستم‌عامل',
  rebuild: 'نصب مجدد سیستم‌عامل',
  change_server_type: 'تغییر پلن',
  change_type: 'تغییر پلن',
  enable_rescue: 'فعال‌سازی حالت نجات',
  disable_rescue: 'غیرفعال‌سازی حالت نجات',
  enable_backup: 'فعال‌سازی پشتیبان‌گیری',
  disable_backup: 'غیرفعال‌سازی پشتیبان‌گیری',
  create_image: 'ساخت اسنپ‌شات',
  attach_iso: 'اتصال ISO',
  detach_iso: 'جدا کردن ISO',
  delete_server: 'حذف سرور',
  change_dns_ptr: 'تغییر rDNS',
  request_console: 'کنسول وب',
  change_protection: 'تغییر محافظت',
};

/** نام فارسی لوکیشن‌های هتزنر */
export const LOCATION_FA: Record<string, { title: string; flag: string; country: string }> = {
  fsn1: { title: 'فالکنشتاین، آلمان', flag: '🇩🇪', country: 'آلمان' },
  nbg1: { title: 'نورنبرگ، آلمان', flag: '🇩🇪', country: 'آلمان' },
  hel1: { title: 'هلسینکی، فنلاند', flag: '🇫🇮', country: 'فنلاند' },
  ash: { title: 'اشبورن، آمریکا', flag: '🇺🇸', country: 'آمریکا' },
  hil: { title: 'هیلزبورو، آمریکا', flag: '🇺🇸', country: 'آمریکا' },
  sin: { title: 'سنگاپور', flag: '🇸🇬', country: 'سنگاپور' },
};

export function locationFa(name: string, fallbackCity?: string, fallbackCountry?: string) {
  const known = LOCATION_FA[name];
  if (known) return known;
  return {
    title: fallbackCity ? `${fallbackCity}${fallbackCountry ? `، ${fallbackCountry}` : ''}` : name.toUpperCase(),
    flag: '🌐',
    country: fallbackCountry ?? '',
  };
}

/** آیکون/رنگ سیستم‌عامل */
export const OS_FA: Record<string, { label: string; color: string }> = {
  ubuntu: { label: 'اوبونتو', color: '#E95420' },
  debian: { label: 'دبیان', color: '#A81D33' },
  centos: { label: 'سنت‌اواس', color: '#932279' },
  rocky: { label: 'راکی لینوکس', color: '#10B981' },
  alma: { label: 'آلما لینوکس', color: '#0F766E' },
  fedora: { label: 'فدورا', color: '#294172' },
  opensuse: { label: 'اوپن‌سوزه', color: '#73BA25' },
  alpine: { label: 'آلپاین', color: '#0D597F' },
  arch: { label: 'آرچ لینوکس', color: '#1793D1' },
  windows: { label: 'ویندوز', color: '#0078D4' },
  unknown: { label: 'سایر', color: '#6B7280' },
};

export function osFa(flavor: string) {
  return OS_FA[flavor?.toLowerCase()] ?? OS_FA.unknown;
}

// ───────────────  متفرقه  ───────────────

export function truncate(text: string, max = 80): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0] ?? '').join('') || '؟';
}

/** ساخت نام یکتا برای سرور بر اساس نام کاربر */
export function suggestServerName(existing: string[]): string {
  for (let i = 1; i < 1000; i++) {
    const candidate = `server-${i}`;
    if (!existing.includes(candidate)) return candidate;
  }
  return `server-${Date.now()}`;
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
