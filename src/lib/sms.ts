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

export async function sendSms(to: string, message: string): Promise<boolean> {
  const phone = normalizePhone(to);
  if (!env.sms.enabled) {
    if (!env.isProd) console.info('[sms:dev]', phone, '|', message);
    return false;
  }

  try {
    if (env.sms.provider === 'kavenegar') {
      const url = `https://api.kavenegar.com/v1/${env.sms.apiKey}/sms/send.json`;
      const params = new URLSearchParams({
        receptor: phone,
        message,
        ...(env.sms.sender ? { sender: env.sms.sender } : {}),
      });
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      return res.ok;
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
      });
      return res.ok;
    }

    console.warn('[sms] ارائه‌دهنده ناشناخته:', env.sms.provider);
    return false;
  } catch (err) {
    console.error('[sms] ارسال پیامک ناموفق بود:', err);
    return false;
  }
}

export async function sendOtp(phone: string, code: string): Promise<boolean> {
  return sendSms(phone, `کد تایید ${env.appName}: ${code}\nاین کد تا ۵ دقیقه معتبر است.`);
}
