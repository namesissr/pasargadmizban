import crypto from 'node:crypto';

/**
 * پیاده‌سازی TOTP طبق RFC 6238 برای ورود دو مرحله‌ای.
 * با Google Authenticator، Authy، Microsoft Authenticator و مشابه سازگار است.
 */

const DIGITS = 6;
const PERIOD = 30;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateSecret(bytes = 20): string {
  return base32Encode(crypto.randomBytes(bytes));
}

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of clean) {
    const idx = ALPHABET.indexOf(char);
    if (idx === -1) throw new Error('کلید مخفی معتبر نیست.');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  // شمارنده ۶۴ بیتی، بیگ‌اندین
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
}

export function generateToken(secretBase32: string, at = Date.now()): string {
  return hotp(base32Decode(secretBase32), Math.floor(at / 1000 / PERIOD));
}

/**
 * بررسی کد واردشده.
 * پنجره ۱ یعنی کد بازه قبلی و بعدی هم پذیرفته می‌شود تا اختلاف ساعت دستگاه مشکلی ایجاد نکند.
 */
export function verifyToken(secretBase32: string, token: string, window = 1): boolean {
  const clean = token.replace(/[^0-9]/g, '');
  if (clean.length !== DIGITS) return false;

  let secret: Buffer;
  try {
    secret = base32Decode(secretBase32);
  } catch {
    return false;
  }

  const counter = Math.floor(Date.now() / 1000 / PERIOD);
  for (let i = -window; i <= window; i++) {
    const expected = hotp(secret, counter + i);
    // مقایسه زمان‌ثابت
    if (expected.length === clean.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) {
      return true;
    }
  }
  return false;
}

/** آدرس otpauth برای ساخت QR */
export function otpauthUrl(params: { secret: string; account: string; issuer: string }): string {
  const label = encodeURIComponent(`${params.issuer}:${params.account}`);
  const query = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

/** کدهای بازیابی یک‌بارمصرف برای زمانی که دسترسی به اپ احراز هویت از دست برود */
export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
  });
}

export function hashRecoveryCode(code: string): string {
  return crypto.createHash('sha256').update(code.replace(/-/g, '').toUpperCase()).digest('hex');
}

export function verifyRecoveryCode(code: string, hashes: string[]): { valid: boolean; remaining: string[] } {
  const hash = hashRecoveryCode(code);
  const index = hashes.indexOf(hash);
  if (index === -1) return { valid: false, remaining: hashes };
  const remaining = hashes.filter((_, i) => i !== index);
  return { valid: true, remaining };
}
