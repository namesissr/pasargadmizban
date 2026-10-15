/**
 * محاسبه‌گر ساب‌نت IPv4 — بدون وابستگی، هم در مرورگر و هم روی سرور.
 */

export type SubnetInfo = {
  ip: string;
  prefix: number;
  netmask: string;
  wildcard: string;
  network: string;
  broadcast: string;
  firstHost: string;
  lastHost: string;
  totalAddresses: number;
  usableHosts: number;
  ipClass: string;
  kind: string;
  binaryMask: string;
  binaryIp: string;
};

const toInt = (ip: string): number | null => {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
};

const toIp = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
const toBin = (n: number) =>
  [24, 16, 8, 0].map((s) => ((n >>> s) & 255).toString(2).padStart(8, '0')).join('.');

const maskOf = (prefix: number) => (prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0);

/** «۱۹۲.۱۶۸.۱.۱۰/۲۴»، «192.168.1.10 255.255.255.0» یا آی‌پی تنها (/۳۲) */
export function parseSubnet(input: string): SubnetInfo | { error: string } {
  const text = input
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .trim();
  const m = /^(\d{1,3}(?:\.\d{1,3}){3})\s*(?:\/\s*(\d{1,2})|\s+(\d{1,3}(?:\.\d{1,3}){3}))?$/.exec(text);
  if (!m) return { error: 'به شکل 192.168.1.10/24 یا 192.168.1.10 255.255.255.0 وارد کنید.' };

  const ip = toInt(m[1]);
  if (ip === null) return { error: 'آی‌پی معتبر نیست؛ هر بخش باید بین ۰ تا ۲۵۵ باشد.' };

  let prefix = 32;
  if (m[2] !== undefined) {
    prefix = Number(m[2]);
    if (prefix > 32) return { error: 'پیشوند باید بین ۰ تا ۳۲ باشد.' };
  } else if (m[3] !== undefined) {
    const mask = toInt(m[3]);
    if (mask === null) return { error: 'ماسک شبکه معتبر نیست.' };
    const bits = mask.toString(2).padStart(32, '0');
    if (!/^1*0*$/.test(bits)) return { error: 'ماسک شبکه باید پیوسته باشد (مثل 255.255.255.0).' };
    prefix = bits.indexOf('0') === -1 ? 32 : bits.indexOf('0');
  }

  const mask = maskOf(prefix);
  const network = (ip & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const total = 2 ** (32 - prefix);
  const usable = prefix >= 31 ? total : total - 2;
  const first = prefix >= 31 ? network : network + 1;
  const last = prefix >= 31 ? broadcast : broadcast - 1;

  const o1 = ip >>> 24;
  const ipClass = o1 < 128 ? 'A' : o1 < 192 ? 'B' : o1 < 224 ? 'C' : o1 < 240 ? 'D (چندپخشی)' : 'E (رزرو)';

  const inRange = (base: string, bits: number) => ((ip & maskOf(bits)) >>> 0) === toInt(base);
  const kind = inRange('10.0.0.0', 8) || inRange('172.16.0.0', 12) || inRange('192.168.0.0', 16)
    ? 'خصوصی (شبکه داخلی)'
    : inRange('127.0.0.0', 8)
      ? 'لوپ‌بک (خود سیستم)'
      : inRange('100.64.0.0', 10)
        ? 'CGNAT (اشتراکی اپراتور)'
        : inRange('169.254.0.0', 16)
          ? 'Link-local'
          : o1 >= 224
            ? 'چندپخشی یا رزرو'
            : 'عمومی (اینترنت)';

  return {
    ip: toIp(ip),
    prefix,
    netmask: toIp(mask),
    wildcard: toIp(~mask >>> 0),
    network: toIp(network),
    broadcast: toIp(broadcast),
    firstHost: toIp(first),
    lastHost: toIp(last),
    totalAddresses: total,
    usableHosts: usable,
    ipClass,
    kind,
    binaryMask: toBin(mask),
    binaryIp: toBin(ip),
  };
}

/** جدول مرجع پیشوندهای پرکاربرد */
export const COMMON_PREFIXES = [8, 16, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32].map((prefix) => ({
  prefix,
  netmask: toIp(maskOf(prefix)),
  total: 2 ** (32 - prefix),
  usable: prefix >= 31 ? 2 ** (32 - prefix) : 2 ** (32 - prefix) - 2,
}));
