import 'server-only';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { SignJWT, jwtVerify } from 'jose';
import type { Role, User } from '@prisma/client';
import prisma from './prisma';
import { env } from './env';
import { randomToken, sha256 } from './crypto';
import { AuthError } from './errors';

export { AuthError };

/**
 * نشست‌ها: یک JWT کوتاه در کوکی httpOnly که به یک رکورد Session در دیتابیس اشاره می‌کند.
 * این ترکیب هم سریع است و هم امکان ابطال فوری نشست را می‌دهد.
 */

const ALG = 'HS256';

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.sessionSecret);
}

export type SessionUser = {
  id: string;
  email: string;
  role: Role;
  status: User['status'];
  firstName: string | null;
  lastName: string | null;
  balance: bigint;
  discountPct: number;
  emailVerifiedAt: Date | null;
  twoFactorEnabled: boolean;
  maxServers: number;
};

export type SessionPayload = { sid: string; uid: string };

export async function createSession(userId: string, meta: { ip?: string; userAgent?: string } = {}) {
  const raw = randomToken(32);
  const tokenHash = sha256(raw);
  const expiresAt = new Date(Date.now() + env.sessionDays * 24 * 60 * 60 * 1000);

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash,
      ip: meta.ip?.slice(0, 64),
      userAgent: meta.userAgent?.slice(0, 255),
      expiresAt,
    },
  });

  const jwt = await new SignJWT({ sid: session.id, uid: userId })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secretKey());

  const store = await cookies();
  store.set(env.cookieName, `${jwt}.${raw}`, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });

  return session;
}

export async function destroySession() {
  const store = await cookies();
  const value = store.get(env.cookieName)?.value;
  if (value) {
    const parsed = await parseCookieValue(value);
    if (parsed) {
      await prisma.session
        .update({ where: { id: parsed.sid }, data: { revokedAt: new Date() } })
        .catch(() => null);
    }
  }
  store.delete(env.cookieName);
}

async function parseCookieValue(value: string): Promise<{ sid: string; uid: string; raw: string } | null> {
  const idx = value.lastIndexOf('.');
  if (idx < 0) return null;
  const jwt = value.slice(0, idx);
  const raw = value.slice(idx + 1);
  try {
    const { payload } = await jwtVerify(jwt, secretKey(), { algorithms: [ALG] });
    const sid = payload.sid as string;
    const uid = payload.uid as string;
    if (!sid || !uid) return null;
    return { sid, uid, raw };
  } catch {
    return null;
  }
}

/** کاربر جاری — در طول یک درخواست کش می‌شود */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const value = store.get(env.cookieName)?.value;
  if (!value) return null;

  const parsed = await parseCookieValue(value);
  if (!parsed) return null;

  const session = await prisma.session.findUnique({
    where: { id: parsed.sid },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          firstName: true,
          lastName: true,
          balance: true,
          discountPct: true,
          loyaltyPct: true,
          emailVerifiedAt: true,
          twoFactorEnabled: true,
          maxServers: true,
          deletedAt: true,
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.tokenHash !== sha256(parsed.raw)) return null;
  if (session.userId !== parsed.uid) return null;
  if (!session.user || session.user.deletedAt) return null;
  if (session.user.status === 'BANNED') return null;

  const { deletedAt: _deleted, loyaltyPct, ...user } = session.user;
  // تخفیف مؤثر: بیشترینِ تخفیف دستی مدیر و تخفیف سطح باشگاه مشتریان.
  // همه مسیرهای قیمت‌گذاری از همین جا تغذیه می‌شوند، پس تخفیف باشگاه خودکار
  // در کاتالوگ، پیش‌فاکتور، ساخت سرور و ارتقا اعمال می‌شود.
  return { ...user, discountPct: Math.max(user.discountPct, loyaltyPct) };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError('برای ادامه باید وارد حساب کاربری شوید.', 401);
  if (user.status === 'SUSPENDED') throw new AuthError('حساب کاربری شما تعلیق شده است. با پشتیبانی تماس بگیرید.', 403);
  return user;
}

export async function requireActiveUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.status !== 'ACTIVE') {
    throw new AuthError('برای استفاده از این بخش ابتدا حساب خود را فعال (تایید ایمیل) کنید.', 403);
  }
  return user;
}

export async function requireStaff(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'ADMIN' && user.role !== 'SUPPORT') {
    throw new AuthError('دسترسی به این بخش فقط برای کارکنان مجاز است.', 403);
  }
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'ADMIN') throw new AuthError('این عملیات فقط برای مدیر سیستم مجاز است.', 403);
  return user;
}

export function isStaff(user: SessionUser | null): boolean {
  return user?.role === 'ADMIN' || user?.role === 'SUPPORT';
}

/** IP واقعی کاربر پشت پروکسی */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return h.get('x-real-ip') || h.get('cf-connecting-ip') || '0.0.0.0';
}

export async function clientUserAgent(): Promise<string> {
  const h = await headers();
  return h.get('user-agent') || '';
}

/** بررسی هم‌مبدأ بودن درخواست — لایه دوم دفاع در برابر CSRF */
export async function assertSameOrigin(): Promise<void> {
  const h = await headers();
  const origin = h.get('origin');
  if (!origin) return; // درخواست‌های same-origin مرورگر گاهی Origin ندارند
  const host = h.get('host');
  try {
    const originHost = new URL(origin).host;
    if (host && originHost !== host) {
      throw new AuthError('درخواست از مبدأ نامعتبر رد شد.', 403);
    }
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthError('درخواست از مبدأ نامعتبر رد شد.', 403);
  }
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
}

export function fullName(user: { firstName?: string | null; lastName?: string | null; email?: string }): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || user.email || 'کاربر';
}
