import { env } from './env';

/**
 * ارسال پیامک. پیش‌فرض: کاوه‌نگار.
 * اگر SMS_API_KEY تنظیم نشده باشد، در حالت توسعه فقط در کنسول چاپ می‌شود.
 */

export function normalizePhone(input: string): string {
  const digits = input
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, '');
  if (digits.startsWith('0098')) return '0' + digits.slice(4);
  if (digits.startsWith('98') && digits.length === 12) return '0' + digits.slice(2);
  if (digits.startsWith('9') && digits.length === 10) return '0' + digits;
  return digits;
}

export function isValidIranPhone(input: string): boolean {
  return /^09\d{9}$/.test(normalizePhone(input));
}

export type SmsResult = { ok: boolean; error?: string };

/**
 * ارسال پیامک با نتیجه دقیق — برای دکمه «پیامک آزمایشی» و لاگ خطا.
 * کاوه‌نگار در پاسخ JSON کد و پیام خطا را برمی‌گرداند (مثلاً ۴۱۸: اعتبار کافی نیست).
 */
export async function sendSmsDetailed(to: string, message: string): Promise<SmsResult> {
  const phone = normalizePhone(to);
  if (!env.sms.enabled) {
    if (!env.isProd) console.info('[sms:dev]', phone, '|', message);
    return { ok: false, error: 'سرویس پیامک تنظیم نشده است (SMS_API_KEY خالی است).' };
  }

  try {
    if (env.sms.provider === 'kavenegar') {
      const url = `https://api.kavenegar.com/v1/${encodeURIComponent(env.sms.apiKey)}/sms/send.json`;
      const params = new URLSearchParams({
        receptor: phone,
        message,
        ...(env.sms.sender ? { sender: env.sms.sender } : {}),
      });
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json().catch(() => null)) as { return?: { status?: number; message?: string } } | null;
      const status = json?.return?.status ?? res.status;
      if (res.ok && status === 200) return { ok: true };
      const error = `کاوه‌نگار ${status}: ${json?.return?.message ?? res.statusText}`;
      console.error('[sms]', error);
      return { ok: false, error };
    }

    if (env.sms.provider === 'sms_ir') {
      const res = await fetch('https://api.sms.ir/v1/send/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': env.sms.apiKey },
        body: JSON.stringify({
          lineNumber: env.sms.sender,
          messageText: message,
          mobiles: [phone],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) return { ok: true };
      const error = `sms.ir ${res.status}: ${await res.text().catch(() => '')}`.slice(0, 300);
      console.error('[sms]', error);
      return { ok: false, error };
    }

    console.warn('[sms] ارائه‌دهنده ناشناخته:', env.sms.provider);
    return { ok: false, error: `ارائه‌دهنده ناشناخته: ${env.sms.provider}` };
  } catch (err) {
    console.error('[sms] ارسال پیامک ناموفق بود:', err);
    return { ok: false, error: 'اتصال به سرویس پیامک برقرار نشد.' };
  }
}

export async function sendSms(to: string, message: string): Promise<boolean> {
  return (await sendSmsDetailed(to, message)).ok;
}

export async function sendOtp(phone: string, code: string): Promise<boolean> {
  return sendSms(phone, `کد تایید ${env.appName}: ${code}\nاین کد تا ۵ دقیقه معتبر است.`);
}
