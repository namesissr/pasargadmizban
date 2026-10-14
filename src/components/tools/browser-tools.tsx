'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { Alert, Badge, Button, CopyButton } from '@/components/ui';
import { parseSubnet, COMMON_PREFIXES } from '@/lib/tools/subnet';
import { fa, KV } from './shared';

// ─────────────  آی‌پی من  ─────────────

function describeAgent(ua: string): { browser: string; os: string; device: string } {
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : 'نامشخص';
  const os =
    /Windows NT/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'نامشخص';
  const device = /Mobi|Android|iPhone/.test(ua) ? 'موبایل' : /iPad|Tablet/.test(ua) ? 'تبلت' : 'رایانه';
  return { browser, os, device };
}

export function MyIpTool({ ip }: { ip: string | null }) {
  const [client, setClient] = useState<{ ua: string; lang: string; tz: string; screen: string } | null>(null);
  useEffect(() => {
    setClient({
      ua: navigator.userAgent,
      lang: navigator.language,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: `${window.screen.width}×${window.screen.height}`,
    });
  }, []);
  const agent = client ? describeAgent(client.ua) : null;
  const version = ip ? (ip.includes(':') ? 'IPv6' : 'IPv4') : null;

  return (
    <div className="space-y-4">
      <div className="card p-6 text-center" style={{ background: 'color-mix(in srgb, var(--color-brand-500) 6%, var(--surface))' }}>
        <p className="text-xs muted">آی‌پی عمومی شما</p>
        {ip ? (
          <>
            <p className="ltr mono mt-2 text-2xl font-extrabold break-all sm:text-3xl">{ip}</p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <Badge tone="muted">{version}</Badge>
              <CopyButton value={ip} label="کپی" />
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm">آی‌پی شما تشخیص داده نشد.</p>
        )}
      </div>

      {client && agent ? (
        <div className="card p-4">
          <dl>
            <KV label="مرورگر">{agent.browser}</KV>
            <KV label="سیستم‌عامل">{agent.os}</KV>
            <KV label="دستگاه">{agent.device}</KV>
            <KV label="منطقه زمانی" ltr>
              {client.tz}
            </KV>
            <KV label="زبان مرورگر" ltr>
              {client.lang}
            </KV>
            <KV label="اندازه صفحه نمایش" ltr>
              {client.screen}
            </KV>
            <KV label="User-Agent" ltr>
              {client.ua}
            </KV>
          </dl>
        </div>
      ) : null}
    </div>
  );
}

// ─────────────  ساب‌نت  ─────────────

export function SubnetTool() {
  const [input, setInput] = useState('192.168.1.10/24');
  const info = useMemo(() => parseSubnet(input), [input]);

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="sr-only">آی‌پی و پیشوند</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="192.168.1.10/24"
          dir="ltr"
          spellCheck={false}
          className="input h-11 w-full text-left text-sm"
          aria-label="آی‌پی و پیشوند"
        />
      </label>

      {'error' in info ? (
        <Alert tone="warning">{info.error}</Alert>
      ) : (
        <div className="card p-4">
          <dl>
            <KV label="نشانی شبکه" ltr>
              {info.network}/{info.prefix}
            </KV>
            <KV label="ماسک شبکه" ltr>
              {info.netmask}
            </KV>
            <KV label="Wildcard" ltr>
              {info.wildcard}
            </KV>
            <KV label="برادکست" ltr>
              {info.broadcast}
            </KV>
            <KV label="محدوده قابل استفاده" ltr>
              {info.firstHost} — {info.lastHost}
            </KV>
            <KV label="تعداد نشانی‌ها">
              {fa(info.totalAddresses)} نشانی، {fa(info.usableHosts)} میزبان قابل استفاده
            </KV>
            <KV label="کلاس و نوع">
              کلاس {info.ipClass} · {info.kind}
            </KV>
            <KV label="ماسک به دودویی" ltr>
              {info.binaryMask}
            </KV>
            <KV label="آی‌پی به دودویی" ltr>
              {info.binaryIp}
            </KV>
          </dl>
        </div>
      )}

      <div className="card p-4">
        <p className="mb-2 text-xs font-bold">جدول پیشوندهای پرکاربرد</p>
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>پیشوند</th>
                <th>ماسک</th>
                <th>نشانی</th>
                <th>قابل استفاده</th>
              </tr>
            </thead>
            <tbody>
              {COMMON_PREFIXES.map((row) => (
                <tr key={row.prefix}>
                  <td className="ltr mono text-xs">/{row.prefix}</td>
                  <td className="ltr mono text-xs">{row.netmask}</td>
                  <td className="tabular text-xs">{fa(row.total)}</td>
                  <td className="tabular text-xs">{fa(row.usable)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─────────────  رمز قوی  ─────────────

const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?/~',
};
const SIMILAR = /[O0Il1|`'"]/g;

/** عدد تصادفی یکنواخت در [0, max) بدون سوگیری مدولو */
function randomBelow(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

function generate(length: number, pools: string[]): string {
  const all = pools.join('');
  // از هر دسته انتخاب‌شده دست‌کم یک نویسه، بعد بقیه از کل
  const chars = pools.map((p) => p[randomBelow(p.length)]);
  while (chars.length < length) chars.push(all[randomBelow(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export function PasswordTool() {
  const [length, setLength] = useState(20);
  const [opts, setOpts] = useState({ lower: true, upper: true, digits: true, symbols: true, noSimilar: false });
  const [list, setList] = useState<string[]>([]);

  const pools = useMemo(
    () =>
      (['lower', 'upper', 'digits', 'symbols'] as const)
        .filter((k) => opts[k])
        .map((k) => (opts.noSimilar ? SETS[k].replace(SIMILAR, '') : SETS[k])),
    [opts],
  );
  const alphabet = pools.join('').length;
  const bits = alphabet ? Math.round(length * Math.log2(alphabet)) : 0;

  function refresh() {
    if (!pools.length) return setList([]);
    setList(Array.from({ length: 5 }, () => generate(length, pools)));
  }

  useEffect(refresh, [length, pools]);

  const strength =
    bits >= 100 ? { tone: 'ok' as const, label: 'بسیار قوی' } : bits >= 75 ? { tone: 'ok' as const, label: 'قوی' } : bits >= 50 ? { tone: 'warn' as const, label: 'متوسط' } : { tone: 'bad' as const, label: 'ضعیف' };

  return (
    <div className="space-y-4">
      <div className="card space-y-4 p-4">
        <label className="block">
          <span className="flex items-center justify-between text-xs font-semibold">
            طول رمز <span className="tabular">{fa(length)} نویسه</span>
          </span>
          <input type="range" min={8} max={64} value={length} onChange={(e) => setLength(Number(e.target.value))} className="mt-2 w-full" />
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(
            [
              ['lower', 'حروف کوچک (a-z)'],
              ['upper', 'حروف بزرگ (A-Z)'],
              ['digits', 'عدد (0-9)'],
              ['symbols', 'نماد (!@#…)'],
              ['noSimilar', 'بدون نویسه‌های شبیه'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={opts[key]} onChange={(e) => setOpts((o) => ({ ...o, [key]: e.target.checked }))} />
              {label}
            </label>
          ))}
        </div>
        <p className="flex items-center gap-2 text-xs">
          <ShieldCheck size={14} /> قدرت: <Badge tone={strength.tone}>{strength.label}</Badge>
          <span className="muted">حدود {fa(bits)} بیت</span>
        </p>
      </div>

      {pools.length ? (
        <div className="card p-4">
          <ul className="space-y-2">
            {list.map((pw, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                <code className="ltr mono min-w-0 flex-1 text-left text-sm break-all">{pw}</code>
                <CopyButton value={pw} />
              </li>
            ))}
          </ul>
          <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={refresh} className="mt-3">
            ساخت دوباره
          </Button>
        </div>
      ) : (
        <Alert tone="warning">دست‌کم یک نوع نویسه را انتخاب کنید.</Alert>
      )}
    </div>
  );
}
