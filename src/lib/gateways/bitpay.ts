import { env } from '../env';
import { getSettings } from '../settings';
import { decrypt } from '../crypto';
import {
  GatewayError,
  type PaymentGateway,
  type StartPaymentInput,
  type StartPaymentResult,
  type VerifyInput,
  type VerifyResult,
} from './types';

/**
 * درگاه پرداخت بیت‌پی — https://bitpay.ir
 *
 * نکته مهم: بیت‌پی مبلغ را به «ریال» می‌گیرد، در حالی که کل سیستم ما تومانی است.
 * پس هنگام ارسال، تومان در ۱۰ ضرب می‌شود تا کاربر دقیقاً همان مبلغ سفارش را بپردازد.
 * (پیش از این تبدیل انجام نمی‌شد و کاربر یک‌دهم مبلغ را می‌پرداخت.)
 * جریان کار:
 *   ۱) gateway-send  → یک id_get (عدد مثبت) می‌دهد
 *   ۲) کاربر به gateway-{id_get}-get هدایت می‌شود
 *   ۳) بازگشت با پارامترهای trans_id و id_get
 *   ۴) gateway-result-second با api و trans_id و id_get تایید می‌کند (۱ = موفق)
 *
 * کلید API در تنظیمات پنل (رمزنگاری‌شده) نگهداری می‌شود.
 */

const RIAL_PER_TOMAN = 10n;

const SEND_FA: Record<number, string> = {
  [-1]: 'کلید API یا مبلغ ارسال نشده است.',
  [-2]: 'مبلغ باید عددی باشد.',
  [-3]: 'مبلغ نباید کمتر از ۱۰۰۰ تومان باشد.',
  [-4]: 'آدرس بازگشت (redirect) ارسال نشده است.',
  [-5]: 'کلید API نامعتبر است.',
};

const VERIFY_FA: Record<number, string> = {
  [-1]: 'کلید API یا شناسه تراکنش ارسال نشده است.',
  [-2]: 'تراکنش پرداخت نشده یا ناموفق بوده است.',
  [-3]: 'توکن امنیتی نامعتبر است.',
  [-4]: 'شناسه پرداخت (id_get) ارسال نشده است.',
};

async function bitpayApiKey(): Promise<string> {
  const s = await getSettings();
  const key = s.bitpayApiEnc ? decrypt(s.bitpayApiEnc) : '';
  return (key || env.bitpay.apiOptional || '').trim();
}

/** بیت‌پی پاسخ را به‌صورت متن ساده (یک عدد) برمی‌گرداند */
async function postForm(path: string, body: Record<string, string>): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(`${env.bitpay.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
      signal: controller.signal,
      cache: 'no-store',
    });
    const text = (await res.text()).trim();
    if (!res.ok) {
      throw new GatewayError(`درگاه بیت‌پی پاسخ نامعتبر داد (کد ${res.status}).`, res.status);
    }
    const num = Number(text);
    if (!Number.isFinite(num)) {
      throw new GatewayError('پاسخ درگاه بیت‌پی قابل خواندن نبود.', 'parse_error');
    }
    return num;
  } catch (err) {
    if (err instanceof GatewayError) throw err;
    throw new GatewayError('ارتباط با درگاه بیت‌پی برقرار نشد. کمی بعد دوباره تلاش کنید.', 'network');
  } finally {
    clearTimeout(timer);
  }
}

export class BitpayGateway implements PaymentGateway {
  readonly id = 'bitpay';
  readonly title = 'درگاه پرداخت بیت‌پی';

  async start(input: StartPaymentInput): Promise<StartPaymentResult> {
    const api = await bitpayApiKey();
    if (!api) {
      throw new GatewayError('کلید API بیت‌پی تنظیم نشده است. از بخش «درگاه‌ها» آن را وارد کنید.', 'not_configured');
    }

    // شناسه تراکنش را در آدرس بازگشت می‌گذاریم تا در callback سرور پیدایش کند
    const redirect = new URL(input.callbackUrl);
    redirect.searchParams.set('orderId', input.orderId);

    const idGet = await postForm('/payment/gateway-send', {
      api,
      amount: String(input.amount * RIAL_PER_TOMAN), // تبدیل تومان به ریال برای بیت‌پی
      redirect: redirect.toString(),
      factorId: input.orderId,
      description: input.description.slice(0, 200),
      email: input.email ?? '',
      name: '',
    });

    if (idGet <= 0) {
      throw new GatewayError(SEND_FA[idGet] ?? 'ایجاد تراکنش در بیت‌پی ناموفق بود.', idGet);
    }

    return {
      redirectUrl: `${env.bitpay.baseUrl}/payment/gateway-${idGet}-get`,
      reference: String(idGet),
    };
  }

  async verify(input: VerifyInput): Promise<VerifyResult> {
    const api = await bitpayApiKey();
    if (!api) {
      return { success: false, message: 'کلید API بیت‌پی تنظیم نشده است.' };
    }

    const transId = input.params?.trans_id ?? '';
    const idGet = input.params?.id_get || input.reference;
    if (!transId || !idGet) {
      return { success: false, message: 'اطلاعات بازگشتی از بیت‌پی ناقص است.' };
    }

    const result = await postForm('/payment/gateway-result-second', {
      api,
      trans_id: transId,
      id_get: String(idGet),
    });

    // ۱ = پرداخت موفق و تایید شد. ۱۱ = قبلاً تایید شده بود.
    if (result === 11) {
      return {
        success: true,
        alreadyVerified: true,
        refNumber: transId,
        paidAmount: input.amount,
        message: 'این پرداخت قبلاً تایید شده است.',
      };
    }
    if (result !== 1) {
      return { success: false, message: VERIFY_FA[result] ?? 'تایید پرداخت در بیت‌پی ناموفق بود.' };
    }

    // بیت‌پی مبلغ را در پاسخ تایید برنمی‌گرداند؛ همان مبلغ سفارش ملاک است.
    return {
      success: true,
      refNumber: transId,
      paidAmount: input.amount,
      message: 'پرداخت با موفقیت انجام شد.',
    };
  }
}
