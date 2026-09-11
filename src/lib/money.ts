/**
 * همه مبالغ در سیستم به «تومان» و به صورت عدد صحیح (BigInt) نگهداری می‌شوند.
 * هیچ‌جا از float برای پول استفاده نمی‌کنیم.
 */

export type Toman = bigint;

export function toToman(value: number | string | bigint): Toman {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[,\s٬،]/g, '');
    return BigInt(cleaned || '0');
  }
  return BigInt(Math.round(value));
}

/** تبدیل امن BigInt به number برای نمایش (مبالغ تومانی از حد امن JS فراتر نمی‌روند) */
export function num(value: bigint | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  return Number(value);
}

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toFaDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

export function toEnDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/** ۱۲۳۴۵۶ → «۱۲۳٬۴۵۶» */
export function formatToman(value: bigint | number | null | undefined, opts?: { fa?: boolean; suffix?: boolean }): string {
  const fa = opts?.fa ?? true;
  const n = num(value);
  const grouped = new Intl.NumberFormat(fa ? 'fa-IR' : 'en-US', {
    maximumFractionDigits: 0,
  }).format(n);
  return opts?.suffix === false ? grouped : `${grouped} تومان`;
}

export function formatNumber(value: number | bigint | null | undefined, fractionDigits = 0): string {
  return new Intl.NumberFormat('fa-IR', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: 0,
  }).format(num(value));
}

/** گرد کردن رو به بالا به نزدیک‌ترین مضرب */
export function roundUpTo(value: bigint, step: bigint): bigint {
  if (step <= 0n) return value;
  const rem = value % step;
  return rem === 0n ? value : value + (step - rem);
}

/** گرد کردن به نزدیک‌ترین مضرب */
export function roundTo(value: bigint, step: bigint): bigint {
  if (step <= 0n) return value;
  const rem = value % step;
  return rem * 2n >= step ? value + (step - rem) : value - rem;
}

/** ضرب BigInt در عدد اعشاری با دقت ۶ رقم */
export function mulFloat(value: bigint, factor: number): bigint {
  const SCALE = 1_000_000n;
  const scaled = BigInt(Math.round(factor * 1_000_000));
  return (value * scaled) / SCALE;
}

const BYTE_UNITS = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت', 'ترابایت', 'پتابایت'];

export function formatBytes(bytes: bigint | number | null | undefined, digits = 2): string {
  let n = num(bytes);
  if (!n) return '۰ بایت';
  let i = 0;
  while (n >= 1024 && i < BYTE_UNITS.length - 1) {
    n /= 1024;
    i++;
  }
  return `${formatNumber(n, digits)} ${BYTE_UNITS[i]}`;
}

export function formatTraffic(bytes: bigint | number | null | undefined): string {
  const tb = num(bytes) / 1024 ** 4;
  if (tb >= 1) return `${formatNumber(tb, tb < 10 ? 1 : 0)} ترابایت`;
  return formatBytes(bytes, 1);
}
