import { ZibalGateway } from './zibal';
import { BitpayGateway } from './bitpay';
import type { PaymentGateway } from './types';
import { getSettings } from '../settings';

export * from './types';
export { zibalStatusFa } from './zibal';

const registry: Record<string, PaymentGateway> = {
  zibal: new ZibalGateway(),
  bitpay: new BitpayGateway(),
};

export function getGateway(id: string): PaymentGateway {
  const gw = registry[id];
  if (!gw) throw new Error(`درگاه پرداخت «${id}» پشتیبانی نمی‌شود.`);
  return gw;
}

/** درگاه‌های فعال برای نمایش به کاربر */
export async function activeGateways(): Promise<{ id: string; title: string; description: string }[]> {
  const settings = await getSettings();
  const out: { id: string; title: string; description: string }[] = [];
  if (settings.gatewayZibal) {
    out.push({
      id: 'zibal',
      title: 'پرداخت آنلاین (زیبال)',
      description: 'پرداخت با کارت‌های عضو شتاب از طریق درگاه امن زیبال',
    });
  }
  if (settings.gatewayBitpay) {
    out.push({
      id: 'bitpay',
      title: 'پرداخت آنلاین (بیت‌پی)',
      description: 'پرداخت با کارت‌های عضو شتاب از طریق درگاه بیت‌پی',
    });
  }
  if (settings.gatewayManual) {
    out.push({
      id: 'manual',
      title: 'واریز کارت به کارت',
      description: 'واریز به حساب و ثبت رسید؛ پس از تایید توسط پشتیبانی اعمال می‌شود',
    });
  }
  return out;
}
