import { Resolver } from 'node:dns/promises';
import net from 'node:net';
import tls, { type DetailedPeerCertificate } from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { ToolError, parseTarget, resolvePublic, assertPort } from './net';
import { probeFromIran } from './iran-probe';

/**
 * بررسی‌های شبکه ابزارهای رایگان. همه از روی همین سرور (داخل ایران) انجام
 * می‌شوند؛ نتیجه یعنی «از ایران این‌طور دیده می‌شود».
 */

const ms = (start: bigint) => Number(process.hrtime.bigint() - start) / 1e6;
const round = (n: number) => Math.round(n * 10) / 10;

// ─────────────  دسترسی TCP (پینگ پورت)  ─────────────

export type TcpAttempt = { ok: true; ms: number } | { ok: false; error: 'timeout' | 'refused' | 'unreachable' | 'other' };

export type TcpResult = {
  host: string;
  ip: string;
  port: number;
  attempts: TcpAttempt[];
  verdict: 'open' | 'closed' | 'timeout' | 'unreachable' | 'mixed';
  stats: { min: number; avg: number; max: number } | null;
};

export async function tcpCheck(rawTarget: string, rawPort?: number | null): Promise<TcpResult> {
  const target = parseTarget(rawTarget);
  const port = assertPort(rawPort ?? target.port, 443);
  const [first] = await resolvePublic(target.host);

  // اتصال از داخل ایران انجام می‌شود، نه از سرور سایت (که خارج از ایران است)
  const attempts: TcpAttempt[] = (await probeFromIran(first.address, port, 4, 4000)).map((r) =>
    r.reachable
      ? { ok: true, ms: round(r.latencyMs ?? 0) }
      : {
          ok: false,
          error:
            r.error === 'ECONNREFUSED' || r.error === 'ECONNRESET'
              ? 'refused'
              : r.error === 'EHOSTUNREACH' || r.error === 'ENETUNREACH'
                ? 'unreachable'
                : r.error === 'timeout' || r.error === 'ETIMEDOUT'
                  ? 'timeout'
                  : 'other',
        },
  );
  if (!attempts.length) throw new ToolError('سرویس آزمایش در ایران نتیجه‌ای برنگرداند.', 502);

  const okTimes = attempts.flatMap((a) => (a.ok ? [a.ms] : []));
  const errors = attempts.flatMap((a) => (a.ok ? [] : [a.error]));
  const verdict: TcpResult['verdict'] =
    okTimes.length === attempts.length
      ? 'open'
      : okTimes.length
        ? 'mixed'
        : errors.every((e) => e === 'refused')
          ? 'closed'
          : errors.includes('unreachable')
            ? 'unreachable'
            : 'timeout';

  return {
    host: target.host,
    ip: first.address,
    port,
    attempts,
    verdict,
    stats: okTimes.length
      ? {
          min: Math.min(...okTimes),
          avg: round(okTimes.reduce((s, n) => s + n, 0) / okTimes.length),
          max: Math.max(...okTimes),
        }
      : null,
  };
}

// ─────────────  DNS  ─────────────

export const DNS_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'CAA'] as const;
export type DnsType = (typeof DNS_TYPES)[number];

export type DnsResult = {
  host: string;
  records: { type: DnsType; values: string[]; error?: string }[];
  /** برای آی‌پی: نام برگشتی (PTR) */
  ptr: string[] | null;
  /** پاسخ‌هایی که نشانه فیلتر DNS در ایران است (۱۰.۱۰.۳۴.x) */
  filteredHint: boolean;
};

async function resolveType(resolver: Resolver, host: string, type: DnsType): Promise<string[]> {
  switch (type) {
    case 'A':
      return resolver.resolve4(host);
    case 'AAAA':
      return resolver.resolve6(host);
    case 'CNAME':
      return resolver.resolveCname(host);
    case 'NS':
      return resolver.resolveNs(host);
    case 'TXT':
      return (await resolver.resolveTxt(host)).map((parts) => parts.join(''));
    case 'MX':
      return (await resolver.resolveMx(host)).sort((a, b) => a.priority - b.priority).map((r) => `${r.priority} ${r.exchange}`);
    case 'SOA': {
      const r = await resolver.resolveSoa(host);
      return [`${r.nsname} ${r.hostmaster} (serial ${r.serial}, refresh ${r.refresh}, retry ${r.retry}, expire ${r.expire}, ttl ${r.minttl})`];
    }
    case 'CAA':
      return (await resolver.resolveCaa(host)).map((r) => {
        const [tag, value] = Object.entries(r).find(([k]) => k !== 'critical') ?? ['', ''];
        return `${r.critical} ${tag} "${value}"`;
      });
  }
}

export async function dnsLookup(rawTarget: string): Promise<DnsResult> {
  const target = parseTarget(rawTarget);
  const resolver = new Resolver({ timeout: 4000, tries: 2 });

  if (target.isIp) {
    const ptr = await resolver.reverse(target.host).catch(() => []);
    return { host: target.host, records: [], ptr, filteredHint: false };
  }

  const records = await Promise.all(
    DNS_TYPES.map(async (type) => {
      try {
        return { type, values: await resolveType(resolver, target.host, type) };
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENODATA' || code === 'ENOTFOUND') return { type, values: [] };
        return { type, values: [], error: code === 'ETIMEOUT' ? 'پاسخ دیر رسید' : 'خطا در پرس‌وجو' };
      }
    }),
  );

  if (records.every((r) => !r.values.length && !r.error)) {
    throw new ToolError('برای این دامنه هیچ رکوردی پیدا نشد؛ نام دامنه را بررسی کنید.', 404);
  }

  const a = records.find((r) => r.type === 'A')?.values ?? [];
  return {
    host: target.host,
    records,
    ptr: null,
    filteredHint: a.some((ip) => ip.startsWith('10.10.34.')),
  };
}

// ─────────────  گواهی SSL  ─────────────

export type CertInfo = {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  daysLeft: number;
  altNames: string[];
  serial: string;
  fingerprint256: string;
  keyInfo: string | null;
};

export type SslResult = {
  host: string;
  ip: string;
  port: number;
  /** گواهی معتبر، زنجیره کامل و مطابق با نام دامنه */
  valid: boolean;
  /** کد خطای اعتبارسنجی Node، اگر بود */
  error: string | null;
  hostnameMatch: boolean;
  protocol: string | null;
  cipher: string | null;
  alpn: string | null;
  ms: number;
  chain: CertInfo[];
};

function certName(part: Record<string, string | string[]> | undefined): string {
  if (!part) return '—';
  const pick = (k: string) => {
    const v = part[k];
    return Array.isArray(v) ? v[0] : v;
  };
  return [pick('CN'), pick('O')].filter(Boolean).join(' — ') || '—';
}

function certInfo(cert: DetailedPeerCertificate): CertInfo {
  const validTo = new Date(cert.valid_to);
  const keyInfo = cert.asn1Curve ? `EC ${cert.asn1Curve}` : cert.bits ? `RSA ${cert.bits}-bit` : null;
  return {
    subject: certName(cert.subject as unknown as Record<string, string>),
    issuer: certName(cert.issuer as unknown as Record<string, string>),
    validFrom: new Date(cert.valid_from).toISOString(),
    validTo: validTo.toISOString(),
    daysLeft: Math.floor((validTo.getTime() - Date.now()) / 86_400_000),
    altNames: (cert.subjectaltname ?? '')
      .split(',')
      .map((s) => s.trim().replace(/^(DNS|IP Address):/, ''))
      .filter(Boolean)
      .slice(0, 50),
    serial: cert.serialNumber ?? '',
    fingerprint256: cert.fingerprint256 ?? '',
    keyInfo,
  };
}

export async function sslCheck(rawTarget: string, rawPort?: number | null): Promise<SslResult> {
  const target = parseTarget(rawTarget);
  const port = assertPort(rawPort ?? target.port, 443);
  const [first] = await resolvePublic(target.host);
  const start = process.hrtime.bigint();

  return new Promise<SslResult>((resolve, reject) => {
    const socket = tls.connect({
      host: first.address,
      port,
      servername: target.isIp ? undefined : target.host,
      rejectUnauthorized: false,
      ALPNProtocols: ['h2', 'http/1.1'],
    });
    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new ToolError(message, 502));
    };

    socket.setTimeout(8000, () => fail('اتصال به این نشانی در ۸ ثانیه برقرار نشد؛ سرور در دسترس نیست یا پورت بسته است.'));
    socket.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ECONNREFUSED') fail('اتصال رد شد؛ روی این پورت سرویسی گوش نمی‌دهد.');
      else if (/wrong version number|unknown protocol|packet length too long/i.test(err.message)) {
        fail('روی این پورت HTTPS در کار نیست (سرور به زبان TLS پاسخ نداد).');
      } else fail(`اتصال امن برقرار نشد (${err.code ?? 'خطا'}).`);
    });

    socket.once('secureConnect', () => {
      if (settled) return;
      settled = true;
      const peer = socket.getPeerCertificate(true);
      if (!peer || !Object.keys(peer).length) {
        socket.destroy();
        reject(new ToolError('سرور گواهی‌ای ارائه نکرد.', 502));
        return;
      }

      const chain: CertInfo[] = [];
      const seen = new Set<string>();
      let cert: DetailedPeerCertificate | undefined = peer;
      while (cert && !seen.has(cert.fingerprint256) && chain.length < 6) {
        seen.add(cert.fingerprint256);
        chain.push(certInfo(cert));
        cert = cert.issuerCertificate;
      }

      const identity = target.isIp ? undefined : tls.checkServerIdentity(target.host, peer);
      const authError = socket.authorizationError ? String(socket.authorizationError) : null;
      const hostnameMatch = target.isIp ? true : !identity;
      const result: SslResult = {
        host: target.host,
        ip: first.address,
        port,
        valid: socket.authorized && hostnameMatch,
        error: authError ?? (hostnameMatch ? null : 'ERR_TLS_CERT_ALTNAME_INVALID'),
        hostnameMatch,
        protocol: socket.getProtocol(),
        cipher: socket.getCipher()?.name ?? null,
        alpn: socket.alpnProtocol || null,
        ms: round(ms(start)),
        chain,
      };
      socket.end();
      resolve(result);
    });
  });
}

// ─────────────  هدر و سرعت پاسخ HTTP  ─────────────

export type HttpHop = { url: string; status: number; location: string | null; ms: number };

export type HttpResult = {
  url: string;
  ip: string;
  status: number;
  statusText: string;
  httpVersion: string;
  timings: { dns: number; connect: number; tls: number | null; ttfb: number; total: number };
  bytes: number;
  truncated: boolean;
  redirects: HttpHop[];
  headers: [string, string][];
  security: { key: string; label: string; ok: boolean }[];
  compression: string | null;
};

const SHOW_HEADERS = [
  'server',
  'content-type',
  'content-length',
  'content-encoding',
  'cache-control',
  'expires',
  'last-modified',
  'etag',
  'location',
  'strict-transport-security',
  'content-security-policy',
  'x-frame-options',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
  'x-powered-by',
  'alt-svc',
  'via',
  'x-cache',
  'cf-cache-status',
  'age',
  'vary',
];

const MAX_BODY = 1024 * 1024;

type Single = {
  ip: string;
  status: number;
  statusText: string;
  httpVersion: string;
  headers: http.IncomingHttpHeaders;
  timings: HttpResult['timings'];
  bytes: number;
  truncated: boolean;
};

async function requestOnce(url: URL): Promise<Single> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const dnsStart = process.hrtime.bigint();
  const [first] = await resolvePublic(host);
  const dnsMs = isIP(host) ? 0 : round(ms(dnsStart));

  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;
  const start = process.hrtime.bigint();

  return new Promise<Single>((resolve, reject) => {
    let connectMs = 0;
    let tlsMs: number | null = null;
    let ttfb = 0;
    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      req.destroy();
      reject(new ToolError(message, 502));
    };

    const req = lib.request(
      url,
      {
        method: 'GET',
        // اتصال به همان آی‌پی بررسی‌شده؛ نام دامنه فقط برای Host و SNI می‌ماند
        lookup: ((_h: string, opts: { all?: boolean }, cb: (...args: unknown[]) => void) =>
          opts?.all
            ? cb(null, [{ address: first.address, family: first.family }])
            : cb(null, first.address, first.family)) as unknown as net.LookupFunction,
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; PasargadMizbanTools/1.0; +https://pasargadmizban.com)',
          accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
          'accept-encoding': 'gzip, deflate, br',
          'accept-language': 'fa,en;q=0.8',
        },
        timeout: 10_000,
        rejectUnauthorized: false,
        agent: false,
      },
      (res) => {
        ttfb = round(ms(start));
        let bytes = 0;
        let truncated = false;
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > MAX_BODY) {
            truncated = true;
            res.destroy();
          }
        });
        const done = () => {
          if (settled) return;
          settled = true;
          resolve({
            ip: first.address,
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? '',
            httpVersion: res.httpVersion,
            headers: res.headers,
            timings: { dns: dnsMs, connect: connectMs, tls: tlsMs, ttfb, total: round(ms(start)) + dnsMs },
            bytes: Math.min(bytes, MAX_BODY),
            truncated,
          });
        };
        res.on('end', done);
        res.on('close', done);
        res.on('error', done);
      },
    );

    req.on('socket', (socket) => {
      socket.once('connect', () => {
        connectMs = round(ms(start));
      });
      socket.once('secureConnect', () => {
        tlsMs = round(ms(start) - connectMs);
      });
    });
    req.on('timeout', () => fail('سرور در ۱۰ ثانیه پاسخ نداد.'));
    req.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ECONNREFUSED') fail('اتصال رد شد؛ وب‌سرور روی این پورت روشن نیست.');
      else if (err.code === 'ECONNRESET') fail('اتصال وسط کار قطع شد (ECONNRESET).');
      else if (err.code === 'EPROTO' || /wrong version number/i.test(err.message)) fail('روی این نشانی HTTPS درست راه‌اندازی نشده است.');
      else fail(`درخواست ناموفق بود (${err.code ?? 'خطا'}).`);
    });
    req.end();
  });
}

export async function httpCheck(rawTarget: string): Promise<HttpResult> {
  const target = parseTarget(rawTarget);
  let url = target.url ?? new URL(`https://${target.host.includes(':') ? `[${target.host}]` : target.host}${target.port ? `:${target.port}` : ''}/`);

  const redirects: HttpHop[] = [];
  for (let hop = 0; hop <= 5; hop++) {
    const res = await requestOnce(url);
    const location = typeof res.headers.location === 'string' ? res.headers.location : null;

    if (res.status >= 300 && res.status < 400 && location && hop < 5) {
      redirects.push({ url: url.toString(), status: res.status, location, ms: res.timings.total });
      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        throw new ToolError('سرور به نشانی نامعتبری ریدایرکت کرد.', 502);
      }
      if (next.protocol !== 'http:' && next.protocol !== 'https:') throw new ToolError('ریدایرکت به نشانی غیر وب.', 502);
      // هر مقصد دوباره از نگهبان رد می‌شود
      parseTarget(next.toString());
      url = next;
      continue;
    }

    const headers = SHOW_HEADERS.flatMap((name) => {
      const v = res.headers[name];
      return v === undefined ? [] : [[name, Array.isArray(v) ? v.join(', ') : String(v)] as [string, string]];
    });
    const has = (name: string) => res.headers[name] !== undefined;
    const isHttps = url.protocol === 'https:';

    return {
      url: url.toString(),
      ip: res.ip,
      status: res.status,
      statusText: res.statusText,
      httpVersion: res.httpVersion,
      timings: res.timings,
      bytes: res.bytes,
      truncated: res.truncated,
      redirects,
      headers,
      compression: (res.headers['content-encoding'] as string | undefined) ?? null,
      security: [
        { key: 'https', label: 'نشانی نهایی روی HTTPS است', ok: isHttps },
        { key: 'hsts', label: 'Strict-Transport-Security (HSTS)', ok: isHttps && has('strict-transport-security') },
        { key: 'xcto', label: 'X-Content-Type-Options', ok: has('x-content-type-options') },
        {
          key: 'frame',
          label: 'جلوگیری از قاب‌گیری (X-Frame-Options یا CSP)',
          ok: has('x-frame-options') || /frame-ancestors/i.test(String(res.headers['content-security-policy'] ?? '')),
        },
        { key: 'referrer', label: 'Referrer-Policy', ok: has('referrer-policy') },
        { key: 'powered', label: 'X-Powered-By پنهان است', ok: !has('x-powered-by') },
      ],
    };
  }
  throw new ToolError('بیش از ۵ ریدایرکت پشت سر هم؛ احتمالاً حلقه ریدایرکت دارید.', 502);
}
