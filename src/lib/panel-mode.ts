import { getSettings } from './settings';

/**
 * حالت پنل.
 *
 * یک کد پایه، دو جور نصب: پنل کامل فروش سرور (cloud.pasargadmizban.com) و
 * نصب «فقط وبلاگ» (blog.pasargadmizban.com). روی نصب وبلاگ، بخش‌های سرور،
 * هتزنر و مالی هیچ کاری ندارند و فقط پنل را شلوغ می‌کنند؛ با این کلید کنار
 * می‌روند و جایشان را پنل وبلاگ می‌گیرد.
 *
 * ترتیب اولویت:
 *   ۱) متغیر محیطی APP_MODE=blog — روی سرور وبلاگ، قطعی و مستقل از دیتابیس
 *   ۲) تنظیم panelMode در دیتابیس — قابل تغییر از پنل، بدون نیاز به ری‌استارت
 */
export type PanelMode = 'full' | 'blog';

function fromEnv(): PanelMode | null {
  const raw = (process.env.APP_MODE ?? '').trim().toLowerCase();
  if (raw === 'blog' || raw === 'blog-only' || raw === 'blogonly') return 'blog';
  if (raw === 'full' || raw === 'panel' || raw === 'cloud') return 'full';
  return null;
}

/** حالت فعلی پنل. روی هر درخواست یک‌بار از کش تنظیمات خوانده می‌شود. */
export async function panelMode(): Promise<PanelMode> {
  const forced = fromEnv();
  if (forced) return forced;
  const settings = await getSettings();
  return settings.panelMode === 'blog' ? 'blog' : 'full';
}

/** آیا این نصب فقط وبلاگ است؟ */
export async function isBlogPanel(): Promise<boolean> {
  return (await panelMode()) === 'blog';
}

/** حالت از متغیر محیطی قفل شده است و از پنل عوض نمی‌شود */
export function panelModeLocked(): boolean {
  return fromEnv() !== null;
}

/**
 * نگهبان صفحه‌های مخصوص پنل کامل (سرور، هتزنر، مالی، قیمت‌گذاری…).
 * روی نصب وبلاگ، کاربر به داشبورد وبلاگ برمی‌گردد تا به صفحه‌ای بی‌استفاده نرسد.
 */
export async function requireFullPanel(): Promise<void> {
  if (!(await isBlogPanel())) return;
  // ایمپورت تنبل: این فایل از اسکریپت‌های خط فرمان هم خوانده می‌شود و آنجا
  // next/navigation در دسترس نیست
  const { redirect } = await import('next/navigation');
  redirect('/admin');
}
