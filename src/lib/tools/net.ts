import { promises as dns } from 'node:dns';
import { BlockList, isIP } from 'node:net';

/**
 * نگهبان ابزارهای شبکه.
 *
 * ابزارهای رایگان از روی سرور ما به نشانی‌ای که کاربر می‌دهد وصل می‌شوند. بدون
 * این نگهبان، هر کسی می‌توانست با آن‌ها شبکه داخلی سرور (دیتابیس، داکر،
 * سرویس‌های محلی) را بکاود. پس:
 *   ۱) فقط نام دامنه یا آی‌پی عمومی پذیرفته می‌شود،
 *   ۲) دامنه یک بار resolve می‌شود و اگر به هر نشانی داخلی اشاره کند رد می‌شود،
 *   ۳) اتصال مستقیم به همان آی‌پی بررسی‌شده انجام می‌شود (نه resolve دوباره)،
 *      تا ترفند «DNS rebinding» کار نکند.
 */

export class ToolError extends Error {
  constructor(
    message: string,
    readonly status = 422,
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

/** آی‌پی عمومی و قابل اتصال است؟ (نگاشت‌شده‌های IPv4 در IPv6 هم با قواعد IPv4 سنجیده می‌شوند) */
export function isPublicIp(ip: string): boolean {
  const family = isIP(ip);
  if (!family) return false;
  return !blocked.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}

const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
const LOCAL_SUFFIX = /\.(local|localhost|internal|lan|home|corp|intranet|test|invalid|example|arpa)$/i;

export type Target = {
  /** نام دامنه (به شکل punycode) یا آی‌پی، بدون کروشه */
  host: string;
  /** آیا خود ورودی آی‌پی بود */
  isIp: boolean;
  /** پورتی که در ورودی آمده بود */
  port: number | null;
  /** اگر ورودی نشانی کامل بود */
  url: URL | null;
};

/**
 * ورودی کاربر → میزبان.
 * «example.com»، «https://example.com/x»، «1.2.3.4:22»، «[2001:db8::1]:443» و
 * دامنه فارسی همه پذیرفته می‌شوند.
 */
export function parseTarget(raw: string): Target {
  const input = (raw ?? '').trim().replace(/[‌‎‏]/g, '');
  if (!input) throw new ToolError('نشانی یا آی‌پی را وارد کنید.');
  if (input.length > 300) throw new ToolError('نشانی خیلی طولانی است.');

  // آی‌پی نسخه ۶ بدون کروشه
  if (isIP(input) === 6) return { host: input, isIp: true, port: null, url: null };

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input);
  if (hasScheme && !/^https?:\/\//i.test(input)) throw new ToolError('فقط نشانی‌های http و https پذیرفته می‌شوند.');

  let url: URL;
  try {
    url = new URL(hasScheme ? input : `http://${input}`);
  } catch {
    throw new ToolError('این نشانی معتبر نیست.');
  }
  if (url.username || url.password) throw new ToolError('نشانی نباید نام کاربری یا رمز داشته باشد.');

  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  const isIpHost = isIP(host) !== 0;
  if (!isIpHost) {
    if (!HOSTNAME.test(host) || LOCAL_SUFFIX.test(host) || host === 'localhost') {
      throw new ToolError('نام دامنه معتبر نیست؛ مثلاً example.com یا یک آی‌پی عمومی وارد کنید.');
    }
  }

  return {
    host,
    isIp: isIpHost,
    port: url.port ? Number(url.port) : null,
    url: hasScheme ? url : null,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new ToolError(message, 504)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * نشانی‌های عمومی یک میزبان. اگر حتی یکی از نشانی‌ها داخلی باشد کل درخواست
 * رد می‌شود (وگرنه می‌شد با دامنه‌ای که دو رکورد دارد، از نگهبان رد شد).
 */
export async function resolvePublic(host: string): Promise<{ address: string; family: 4 | 6 }[]> {
  if (isIP(host)) {
    if (!isPublicIp(host)) throw new ToolError('این آی‌پی عمومی نیست (شبکه داخلی یا رزروشده)؛ فقط آی‌پی عمومی قابل بررسی است.');
    return [{ address: host, family: isIP(host) as 4 | 6 }];
  }

  let records: { address: string; family: number }[];
  try {
    records = await withTimeout(dns.lookup(host, { all: true, verbatim: true }), 6000, 'پاسخ DNS این دامنه دیر رسید.');
  } catch (err) {
    if (err instanceof ToolError) throw err;
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') throw new ToolError('این دامنه پیدا نشد (رکورد DNS ندارد).', 404);
    throw new ToolError('resolve کردن این دامنه ناموفق بود.', 502);
  }

  if (!records.length) throw new ToolError('این دامنه آی‌پی ندارد.', 404);
  if (records.some((r) => !isPublicIp(r.address))) {
    throw new ToolError('این دامنه به یک نشانی داخلی یا رزروشده اشاره می‌کند و قابل بررسی نیست.');
  }

  // IPv4 اول: اتصال IPv6 روی همه سرورها برقرار نیست
  return records
    .map((r) => ({ address: r.address, family: (r.family === 6 ? 6 : 4) as 4 | 6 }))
    .sort((a, b) => a.family - b.family);
}

export function assertPort(port: number | null | undefined, fallback: number): number {
  const p = port ?? fallback;
  if (!Number.isInteger(p) || p < 1 || p > 65535) throw new ToolError('شماره پورت باید بین ۱ تا ۶۵۵۳۵ باشد.');
  return p;
}
