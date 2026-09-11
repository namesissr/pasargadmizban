/**
 * کلاس‌های خطای مشترک.
 *
 * این فایل عمداً هیچ وابستگی‌ای به Next.js ندارد تا ماژول‌های منطق کسب‌وکار
 * (مثل provisioning و billing) بتوانند هم در سرور وب و هم در ورکر پس‌زمینه
 * از آن استفاده کنند.
 */

export class ApiError extends Error {
  status: number;
  code?: string;
  fields?: Record<string, string>;

  constructor(message: string, status = 400, opts?: { code?: string; fields?: Record<string, string> }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = opts?.code;
    this.fields = opts?.fields;
  }
}

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}
