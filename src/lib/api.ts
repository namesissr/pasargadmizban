import { NextResponse } from 'next/server';
import { ZodError, type ZodType, type ZodTypeDef } from 'zod';
import { ApiError, AuthError } from './errors';

export { ApiError };
import { RateLimitError } from './rate-limit';
import { InsufficientFundsError } from './wallet';
import { HetznerError, hetznerErrorFa } from './hetzner';

/**
 * کمکی‌های لایه API: پاسخ یکنواخت، مدیریت خطا و اعتبارسنجی ورودی.
 * قالب پاسخ موفق: { ok: true, data: ... }
 * قالب پاسخ خطا:   { ok: false, error: { message, code?, fields? } }
 */

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: { message: string; code?: string; fields?: Record<string, string> } };

/** BigInt و Date را به شکل قابل انتقال در JSON تبدیل می‌کند */
export function serialize<T>(value: T): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serialize(v);
    }
    return out;
  }
  return value;
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, data: serialize(data) } as ApiOk<unknown>, init);
}

export function fail(
  message: string,
  status = 400,
  extra?: { code?: string; fields?: Record<string, string> },
): NextResponse {
  return NextResponse.json(
    { ok: false, error: { message, ...extra } } as ApiErr,
    { status },
  );
}

/** تبدیل هر خطایی به پاسخ HTTP مناسب با پیام فارسی */
export function handleError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return fail(err.message, err.status, { code: err.code, fields: err.fields });
  }
  if (err instanceof AuthError) {
    return fail(err.message, err.status, { code: 'auth' });
  }
  if (err instanceof RateLimitError) {
    const res = fail(err.message, 429, { code: 'rate_limit' });
    res.headers.set('Retry-After', String(err.retryAfter));
    return res;
  }
  if (err instanceof InsufficientFundsError) {
    return fail('موجودی کیف پول شما برای این عملیات کافی نیست.', 402, { code: 'insufficient_funds' });
  }
  if (err instanceof HetznerError) {
    return fail(hetznerErrorFa(err), err.statusCode >= 500 ? 502 : 400, { code: err.code });
  }
  if (err instanceof ZodError) {
    return fail('اطلاعات ارسالی معتبر نیست.', 422, { code: 'validation', fields: zodFields(err) });
  }
  // خطاهای شناخته‌شده Prisma
  const prismaCode = (err as { code?: string })?.code;
  if (prismaCode === 'P2002') {
    return fail('این مقدار قبلاً ثبت شده است.', 409, { code: 'duplicate' });
  }
  if (prismaCode === 'P2025') {
    return fail('مورد درخواستی یافت نشد.', 404, { code: 'not_found' });
  }

  console.error('[api] خطای مدیریت‌نشده:', err);
  return fail('خطای داخلی سرور. اگر تکرار شد با پشتیبانی تماس بگیرید.', 500, { code: 'internal' });
}

export function zodFields(err: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/** خواندن و اعتبارسنجی بدنه JSON */
// ورودی خام هر شکلی می‌تواند داشته باشد؛ خروجی همان چیزی است که schema تضمین می‌کند.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function parseBody<T>(req: Request, schema: ZodType<T, ZodTypeDef, any>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError('بدنه درخواست باید JSON معتبر باشد.', 400);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError('اطلاعات ارسالی معتبر نیست.', 422, {
      code: 'validation',
      fields: zodFields(result.error),
    });
  }
  return result.data;
}

/** اعتبارسنجی query string */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseQuery<T>(req: Request, schema: ZodType<T, ZodTypeDef, any>): T {
  const url = new URL(req.url);
  const obj: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    obj[k] = v;
  });
  const result = schema.safeParse(obj);
  if (!result.success) {
    throw new ApiError('پارامترهای درخواست معتبر نیست.', 422, {
      code: 'validation',
      fields: zodFields(result.error),
    });
  }
  return result.data;
}

/** پوشش استاندارد هندلرها: مدیریت خطا به صورت متمرکز */
export function route<Ctx = unknown>(
  handler: (req: Request, ctx: Ctx) => Promise<NextResponse> | NextResponse,
) {
  return async (req: Request, ctx: Ctx): Promise<NextResponse> => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      return handleError(err);
    }
  };
}

export type PageParams<T extends Record<string, string> = Record<string, string>> = {
  params: Promise<T>;
};

/** صفحه‌بندی استاندارد لیست‌ها */
export function pagination(req: Request, defaults = { page: 1, perPage: 20, maxPerPage: 100 }) {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? defaults.page) || defaults.page);
  const perPageRaw = Number(url.searchParams.get('perPage') ?? defaults.perPage) || defaults.perPage;
  const perPage = Math.min(defaults.maxPerPage, Math.max(1, perPageRaw));
  return { page, perPage, skip: (page - 1) * perPage, take: perPage };
}

export function paged<T>(items: T[], total: number, page: number, perPage: number) {
  return {
    items,
    meta: {
      total,
      page,
      perPage,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    },
  };
}
