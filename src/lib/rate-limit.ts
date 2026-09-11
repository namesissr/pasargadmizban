import prisma from './prisma';

/**
 * محدودکننده نرخ درخواست.
 * لایه اول در حافظه (سریع، هر پروسه)، لایه دوم در دیتابیس (بین چند پروسه مشترک).
 * برای endpoint های حساس مثل ورود، ثبت‌نام و ساخت سرور استفاده می‌شود.
 */

type Bucket = { count: number; expires: number };
const memory = new Map<string, Bucket>();

// جلوگیری از رشد بی‌نهایت حافظه
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of memory) {
    if (bucket.expires < now) memory.delete(key);
  }
}, 60_000).unref?.();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  opts: { persistent?: boolean } = {},
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  // لایه حافظه
  const bucket = memory.get(key);
  if (!bucket || bucket.expires < now) {
    memory.set(key, { count: 1, expires: now + windowMs });
  } else {
    bucket.count += 1;
    if (bucket.count > limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.ceil((bucket.expires - now) / 1000),
      };
    }
  }

  // لایه دیتابیس برای محدودیت‌های مهم
  if (opts.persistent) {
    try {
      const expiresAt = new Date(now + windowMs);
      const existing = await prisma.rateLimit.findUnique({ where: { key } });
      if (!existing || existing.expiresAt < new Date()) {
        await prisma.rateLimit.upsert({
          where: { key },
          create: { key, count: 1, expiresAt },
          update: { count: 1, expiresAt },
        });
      } else {
        const updated = await prisma.rateLimit.update({
          where: { key },
          data: { count: { increment: 1 } },
        });
        if (updated.count > limit) {
          return {
            allowed: false,
            remaining: 0,
            retryAfterSeconds: Math.ceil((existing.expiresAt.getTime() - now) / 1000),
          };
        }
      }
    } catch {
      // اگر دیتابیس در دسترس نبود، فقط به لایه حافظه اکتفا کن
    }
  }

  const current = memory.get(key)!;
  return {
    allowed: true,
    remaining: Math.max(0, limit - current.count),
    retryAfterSeconds: 0,
  };
}

export class RateLimitError extends Error {
  retryAfter: number;
  constructor(retryAfter: number) {
    super(`تعداد درخواست‌ها بیش از حد مجاز است. لطفاً ${retryAfter} ثانیه دیگر تلاش کنید.`);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export async function enforceRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  opts: { persistent?: boolean } = {},
): Promise<void> {
  const result = await rateLimit(key, limit, windowSeconds, opts);
  if (!result.allowed) throw new RateLimitError(result.retryAfterSeconds);
}

export async function clearRateLimit(key: string) {
  memory.delete(key);
  await prisma.rateLimit.deleteMany({ where: { key } }).catch(() => null);
}

/** پاکسازی رکوردهای منقضی — از ورکر صدا زده می‌شود */
export async function purgeExpiredRateLimits(): Promise<number> {
  const res = await prisma.rateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return res.count;
}

export const LIMITS = {
  login: { limit: 8, window: 300 },
  register: { limit: 5, window: 3600 },
  passwordReset: { limit: 5, window: 3600 },
  otp: { limit: 5, window: 600 },
  serverCreate: { limit: 10, window: 600 },
  serverAction: { limit: 60, window: 60 },
  topup: { limit: 15, window: 600 },
  ticket: { limit: 10, window: 600 },
  api: { limit: 240, window: 60 },
} as const;
