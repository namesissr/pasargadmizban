export type StartPaymentInput = {
  /** مبلغ به تومان */
  amount: bigint;
  /** شناسه داخلی تراکنش — در callback برمی‌گردد */
  orderId: string;
  callbackUrl: string;
  description: string;
  mobile?: string;
  email?: string;
};

export type StartPaymentResult = {
  /** آدرسی که کاربر باید به آن هدایت شود */
  redirectUrl: string;
  /** شناسه‌ای که درگاه برمی‌گرداند (trackId / authority) */
  reference: string;
};

export type VerifyInput = {
  /** شناسه‌ای که هنگام شروع پرداخت ذخیره شد (trackId زیبال / id_get بیت‌پی) */
  reference: string;
  amount: bigint;
  /** همه پارامترهای بازگشتی درگاه در callback — برای درگاه‌هایی مثل بیت‌پی که داده اضافه می‌فرستند */
  params?: Record<string, string>;
};

export type VerifyResult = {
  success: boolean;
  /** شماره پیگیری بانکی */
  refNumber?: string;
  cardNumber?: string;
  paidAmount?: bigint;
  message: string;
  /** پرداخت قبلاً تایید شده بود */
  alreadyVerified?: boolean;
};

export interface PaymentGateway {
  readonly id: string;
  readonly title: string;
  start(input: StartPaymentInput): Promise<StartPaymentResult>;
  verify(input: VerifyInput): Promise<VerifyResult>;
}

export class GatewayError extends Error {
  code: string | number;
  constructor(message: string, code: string | number = 'gateway_error') {
    super(message);
    this.name = 'GatewayError';
    this.code = code;
  }
}
