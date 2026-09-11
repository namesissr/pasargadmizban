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
  reference: string;
  amount: bigint;
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
