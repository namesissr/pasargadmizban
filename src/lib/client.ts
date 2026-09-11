'use client';

/**
 * کمکی سمت مرورگر برای صدا زدن API پنل.
 * خطاها را به یک شیء یکنواخت با پیام فارسی تبدیل می‌کند.
 */

export class ApiClientError extends Error {
  status: number;
  code?: string;
  fields?: Record<string, string>;

  constructor(message: string, status: number, code?: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

type Options = Omit<RequestInit, 'body'> & { body?: unknown };

export async function api<T = unknown>(path: string, options: Options = {}): Promise<T> {
  const { body, headers, ...rest } = options;

  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(headers as Record<string, string>),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiClientError('ارتباط با سرور برقرار نشد. اتصال اینترنت خود را بررسی کنید.', 0, 'network');
  }

  let json: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  const payload = json as { ok?: boolean; data?: T; error?: { message?: string; code?: string; fields?: Record<string, string> } } | null;

  if (!res.ok || payload?.ok === false) {
    const err = payload?.error;
    throw new ApiClientError(
      err?.message ?? `خطای ${res.status} در ارتباط با سرور.`,
      res.status,
      err?.code,
      err?.fields,
    );
  }

  return (payload?.data ?? (json as T)) as T;
}

export const apiGet = <T>(path: string) => api<T>(path);
export const apiPost = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body });
export const apiPatch = <T>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body });
export const apiPut = <T>(path: string, body?: unknown) => api<T>(path, { method: 'PUT', body });
export const apiDelete = <T>(path: string, body?: unknown) => api<T>(path, { method: 'DELETE', body });

/** fetcher برای SWR */
export const fetcher = <T>(path: string) => api<T>(path);

export function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return 'خطای نامشخص رخ داد.';
}

export function errorFields(err: unknown): Record<string, string> {
  return err instanceof ApiClientError ? err.fields ?? {} : {};
}
