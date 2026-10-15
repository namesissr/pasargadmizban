/**
 * ساخت نشانی (slug) خوانا برای آدرس مقاله‌ها.
 *
 * گوگل آدرس فارسی را درست می‌فهمد و در نتایج هم فارسی نشان می‌دهد، پس حروف
 * فارسی را نگه می‌داریم و فقط چیزهایی را که در URL مشکل می‌سازند حذف می‌کنیم.
 * نویسه‌های عربی هم به شکل فارسی یکدست می‌شوند تا دو آدرس متفاوت برای یک
 * عبارت ساخته نشود.
 */

const ARABIC_TO_PERSIAN: Record<string, string> = {
  'ي': 'ی',
  'ك': 'ک',
  'ۀ': 'ه',
  'ة': 'ه',
  'أ': 'ا',
  'إ': 'ا',
  'آ': 'آ',
  'ؤ': 'و',
  'ئ': 'ی',
};

const DIGITS: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

/** حروف فارسی/عربی، لاتین، رقم و خط تیره مجازند؛ بقیه حذف می‌شوند */
const ALLOWED = /[^a-z0-9ء-غف-يٱ-ۓ۰-۹-]/g;

export function slugify(input: string, maxLength = 90): string {
  let s = (input ?? '').toString().trim().toLowerCase();

  // یکدست‌سازی نویسه‌ها و تبدیل رقم‌ها
  s = s.replace(/[يكۀةأإآؤئ]/g, (c) => ARABIC_TO_PERSIAN[c] ?? c);
  s = s.replace(/[۰-۹٠-٩]/g, (c) => DIGITS[c] ?? c);

  // اعراب و نویسه‌های نامرئی
  s = s.replace(/[ً-ْٰـ]/g, '');
  // نیم‌فاصله و فاصله‌ها به خط تیره
  s = s.replace(/[‌‏‎\s_./\\]+/g, '-');

  s = s.replace(ALLOWED, '');
  s = s.replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');

  if (s.length > maxLength) {
    s = s.slice(0, maxLength).replace(/-[^-]*$/, '').replace(/-+$/, '');
  }
  return s;
}

/**
 * اگر اسلاگ تکراری بود، شماره به انتهایش اضافه می‌کند.
 * `taken` بررسی می‌کند آیا این اسلاگ از قبل در دیتابیس هست یا نه.
 */
export async function uniqueSlug(
  base: string,
  taken: (slug: string) => Promise<boolean>,
  fallback = 'post',
): Promise<string> {
  const root = slugify(base) || fallback;
  if (!(await taken(root))) return root;
  for (let i = 2; i < 200; i++) {
    const candidate = `${root}-${i}`;
    if (!(await taken(candidate))) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}
