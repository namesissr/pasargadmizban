import { env } from '../env';
import {
  GatewayError,
  type PaymentGateway,
  type StartPaymentInput,
  type StartPaymentResult,
  type VerifyInput,
  type VerifyResult,
} from './types';

/**
 * درگاه پرداخت زیبال — https://docs.zibal.ir
 *
 * نکته مهم: زیبال مبالغ را به «ریال» می‌گیرد، در حالی که کل سیستم ما به تومان است.
 * تبدیل در همین فایل و فقط همین‌جا انجام می‌شود.
 */

const RIAL_PER_TOMAN = 10n;

const RESULT_FA: Record<number, string> = {
  100: 'با موفقیت تایید شد.',
  102: 'مرچنت یافت نشد.',
  103: 'مرچنت غیرفعال است.',
  104: 'مرچنت نامعتبر است.',
  105: 'مبلغ باید بیشتر از ۱٬۰۰۰ ریال باشد.',
  106: 'آدرس بازگشت نامعتبر است.',
  113: 'مبلغ تراکنش از سقف مجاز بیشتر است.',
  201: 'این تراکنش قبلاً تایید شده است.',
  202: 'سفارش پرداخت نشده یا ناموفق بوده است.',
  203: 'شناسه پیگیری نامعتبر است.',
};

const STATUS_FA: Record<number, string> = {
  '-1': 'در انتظار پرداخت',
  '-2': 'خطای داخلی درگاه',
  1: 'پرداخت شده و تایید شده',
  2: 'پرداخت شده و تایید نشده',
  3: 'تراکنش توسط کاربر لغو شد.',
  4: 'شماره کارت نامعتبر است.',
  5: 'موجودی حساب کافی نیست.',
  6: 'رمز کارت اشتباه وارد شده است.',
  7: 'تعداد درخواست‌ها بیش از حد مجاز است.',
  8: 'تعداد پرداخت اینترنتی روزانه بیش از حد مجاز است.',
  9: 'مبلغ پرداخت اینترنتی روزانه بیش از حد مجاز است.',
  10: 'صادرکننده کارت نامعتبر است.',
  11: 'خطای سوییچ بانکی. دوباره تلاش کنید.',
  12: 'کارت قابل دسترسی نیست.',
};

type ZibalRequestResponse = {
  trackId?: number;
  result: number;
  message?: string;
};

type ZibalVerifyResponse = {
  paidAt?: string;
  cardNumber?: string;
  status?: number;
  amount?: number;
  refNumber?: number | string;
  orderId?: string;
  result: number;
  message?: string;
};

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(`${env.zibal.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    });
    const text = await res.text();
    if (!res.ok) {
      throw new GatewayError(`درگاه پرداخت پاسخ نامعتبر داد (کد ${res.status}).`, res.status);
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new GatewayError('پاسخ درگاه پرداخت قابل خواندن نبود.', 'parse_error');
    }
  } catch (err) {
    if (err instanceof GatewayError) throw err;
    throw new GatewayError('ارتباط با درگاه پرداخت برقرار نشد. کمی بعد دوباره تلاش کنید.', 'network');
  } finally {
    clearTimeout(timer);
  }
}

export class ZibalGateway implements PaymentGateway {
  readonly id = 'zibal';
  readonly title = 'درگاه پرداخت زیبال';

  async start(input: StartPaymentInput): Promise<StartPaymentResult> {
    const rial = input.amount * RIAL_PER_TOMAN;

    const res = await post<ZibalRequestResponse>('/v1/request', {
      merchant: env.zibal.merchant,
      amount: Number(rial),
      callbackUrl: input.callbackUrl,
      description: input.description.slice(0, 200),
      orderId: input.orderId,
      mobile: input.mobile,
    });

    if (res.result !== 100 || !res.trackId) {
      throw new GatewayError(RESULT_FA[res.result] ?? res.message ?? 'ایجاد تراکنش در درگاه ناموفق بود.', res.result);
    }

    return {
      redirectUrl: `${env.zibal.baseUrl}/start/${res.trackId}`,
      reference: String(res.trackId),
    };
  }

  async verify(input: VerifyInput): Promise<VerifyResult> {
    const res = await post<ZibalVerifyResponse>('/v1/verify', {
      merchant: env.zibal.merchant,
      trackId: Number(input.reference),
    });

    if (res.result === 201) {
      return {
        success: true,
        alreadyVerified: true,
        refNumber: res.refNumber ? String(res.refNumber) : undefined,
        cardNumber: res.cardNumber,
        paidAmount: res.amount ? BigInt(res.amount) / RIAL_PER_TOMAN : undefined,
        message: 'این پرداخت قبلاً تایید شده است.',
      };
    }

    if (res.result !== 100) {
      return {
        success: false,
        message: RESULT_FA[res.result] ?? res.message ?? 'تایید پرداخت ناموفق بود.',
      };
    }

    // result === 100 → بررسی وضعیت واقعی تراکنش
    const status = res.status ?? 0;
    if (status !== 1 && status !== 2) {
      return { success: false, message: STATUS_FA[status] ?? 'پرداخت انجام نشد.' };
    }

    const paidToman = res.amount ? BigInt(res.amount) / RIAL_PER_TOMAN : 0n;
    if (paidToman !== input.amount) {
      return {
        success: false,
        message: 'مبلغ پرداخت‌شده با مبلغ سفارش هم‌خوانی ندارد. با پشتیبانی تماس بگیرید.',
        paidAmount: paidToman,
      };
    }

    return {
      success: true,
      refNumber: res.refNumber ? String(res.refNumber) : undefined,
      cardNumber: res.cardNumber,
      paidAmount: paidToman,
      message: 'پرداخت با موفقیت انجام شد.',
    };
  }
}

export function zibalStatusFa(code: number | string | null | undefined): string {
  if (code === null || code === undefined) return 'نامشخص';
  return STATUS_FA[Number(code)] ?? `کد وضعیت ${code}`;
}
