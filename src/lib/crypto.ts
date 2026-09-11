import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from './env';

// ───────────────  رمز عبور  ───────────────

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

// ───────────────  توکن‌ها  ───────────────

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** کد عددی برای پیامک/ایمیل */
export function randomCode(digits = 6): string {
  const max = 10 ** digits;
  return String(crypto.randomInt(0, max)).padStart(digits, '0');
}

/** رمز روت امن برای سرورها */
export function generateRootPassword(length = 20): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#%^*-_=+';
  const all = upper + lower + digits + symbols;
  const pick = (set: string) => set[crypto.randomInt(0, set.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < length) chars.push(pick(all));
  // به‌هم‌ریختن با Fisher-Yates امن
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

// ───────────────  رمزنگاری متقارن (AES-256-GCM)  ───────────────

function keyBuffer(): Buffer {
  const key = env.encryptionKey;
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error('ENCRYPTION_KEY باید دقیقاً ۶۴ کاراکتر هگزادسیمال باشد (۳۲ بایت).');
  }
  return Buffer.from(key, 'hex');
}

/** خروجی: v1.<iv-b64>.<tag-b64>.<cipher-b64> */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), enc.toString('base64url')].join('.');
}

export function decrypt(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    const [version, ivB64, tagB64, dataB64] = payload.split('.');
    if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      keyBuffer(),
      Buffer.from(ivB64, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]);
    return dec.toString('utf8');
  } catch {
    return null;
  }
}

/** مقایسه زمان‌ثابت برای جلوگیری از timing attack */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** اثر انگشت کلید عمومی SSH به فرمت MD5 هتزنری */
export function sshFingerprint(publicKey: string): string | null {
  try {
    const parts = publicKey.trim().split(/\s+/);
    const b64 = parts.find((p) => /^[A-Za-z0-9+/=]{20,}$/.test(p));
    if (!b64) return null;
    const raw = Buffer.from(b64, 'base64');
    const md5 = crypto.createHash('md5').update(raw).digest('hex');
    return md5.match(/.{2}/g)!.join(':');
  } catch {
    return null;
  }
}
