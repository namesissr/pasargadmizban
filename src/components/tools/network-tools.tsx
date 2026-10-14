'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, ArrowLeft, CircleDashed } from 'lucide-react';
import { Alert, Badge } from '@/components/ui';
import type { TcpResult, DnsResult, SslResult, HttpResult } from '@/lib/tools/checks';
import { fa, faMs, useToolRunner, useInitialQuery, TargetForm, ToolError, KV } from './shared';

const faDate = (iso: string) =>
  new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(iso));

// ─────────────  دسترسی از ایران  ─────────────

const PORTS = [
  { port: 22, label: 'SSH' },
  { port: 80, label: 'HTTP' },
  { port: 443, label: 'HTTPS' },
  { port: 3389, label: 'ریموت ویندوز' },
  { port: 8443, label: '8443' },
  { port: 2053, label: '2053' },
];

const VERDICT: Record<TcpResult['verdict'], { tone: 'success' | 'warning' | 'error'; title: string; text: string }> = {
  open: {
    tone: 'success',
    title: 'باز است — از ایران در دسترس',
    text: 'اتصال از داخل ایران به این آی‌پی و پورت برقرار شد.',
  },
  mixed: {
    tone: 'warning',
    title: 'ناپایدار — بعضی تلاش‌ها ناموفق',
    text: 'بعضی اتصال‌ها برقرار شد و بعضی نه. معمولاً نشانه از دست رفتن بسته در مسیر یا بار زیاد سرور است.',
  },
  closed: {
    tone: 'warning',
    title: 'سرور در دسترس است، ولی این پورت بسته است',
    text: 'سرور از ایران پاسخ داد ولی روی این پورت سرویسی گوش نمی‌دهد (یا فایروال اتصال را رد می‌کند). آی‌پی مسدود نیست.',
  },
  timeout: {
    tone: 'error',
    title: 'بی‌پاسخ — از ایران به این پورت نمی‌رسد',
    text: 'هیچ پاسخی نیامد. یا سرور خاموش است، یا فایروال بسته‌ها را دور می‌ریزد، یا این آی‌پی از ایران مسدود است. اگر از خارج ایران باز است، آی‌پی تقریباً به‌طور قطع از ایران بسته شده.',
  },
  unreachable: {
    tone: 'error',
    title: 'مسیر شبکه تا این آی‌پی برقرار نیست',
    text: 'مسیریابی تا این نشانی از ایران ممکن نشد؛ آی‌پی از ایران در دسترس نیست.',
  },
};

/** شماره پورت بدون جداکننده هزارگان */
const faPort = (n: number) => new Intl.NumberFormat('fa-IR', { useGrouping: false }).format(n);

const ATTEMPT_LABEL = { timeout: 'بی‌پاسخ', refused: 'رد شد', unreachable: 'بدون مسیر', other: 'خطا' } as const;

export function TcpTool({ ctaHref }: { ctaHref: string }) {
  const initial = useInitialQuery();
  const [target, setTarget] = useState('');
  const [port, setPort] = useState('443');
  const { result, error, loading, run } = useToolRunner<TcpResult>('tcp');

  useEffect(() => {
    if (initial.q) setTarget(initial.q);
    if (initial.port) setPort(initial.port);
  }, [initial.q, initial.port]);

  const portNum = Number(port);
  const submit = () => run({ target, port: Number.isInteger(portNum) && portNum > 0 ? portNum : null });
  const v = result ? VERDICT[result.verdict] : null;

  return (
    <div className="space-y-4">
      <TargetForm value={target} onChange={setTarget} onSubmit={submit} loading={loading} placeholder="1.2.3.4 یا example.com" label="آی‌پی یا دامنه" button="تست از ایران">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] muted">پورت:</span>
          {PORTS.map((p) => (
            <button
              key={p.port}
              type="button"
              onClick={() => setPort(String(p.port))}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                port === String(p.port) ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-50)] font-bold text-[var(--color-brand-700)]' : 'hover:border-[var(--color-brand-400)]'
              }`}
            >
              {p.label}
              {p.label !== String(p.port) ? <span className="opacity-60"> {faPort(p.port)}</span> : null}
            </button>
          ))}
          <input
            value={port}
            onChange={(e) => setPort(e.target.value.replace(/[^\d۰-۹]/g, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))))}
            className="input h-8 text-center text-xs"
            style={{ width: '5.5rem' }}
            dir="ltr"
            inputMode="numeric"
            aria-label="پورت دلخواه"
          />
        </div>
      </TargetForm>

      <ToolError message={error} />
      {loading ? <p className="text-xs muted">در حال اتصال از ایران… تا ۱۵ ثانیه طول می‌کشد.</p> : null}

      {result && v ? (
        <div className="space-y-3">
          <Alert tone={v.tone} title={v.title}>
            {v.text}
          </Alert>
          <div className="card p-4">
            <dl>
              <KV label="مقصد" ltr>
                {result.host !== result.ip ? `${result.host} → ` : ''}
                {result.ip}:{result.port}
              </KV>
              {result.stats ? (
                <KV label="زمان اتصال از ایران">
                  میانگین {faMs(result.stats.avg)} (کمترین {faMs(result.stats.min)}، بیشترین {faMs(result.stats.max)})
                </KV>
              ) : null}
              <KV label="تلاش‌ها">
                <span className="flex flex-wrap gap-1.5">
                  {result.attempts.map((a, i) =>
                    a.ok ? (
                      <Badge key={i} tone="ok">
                        <CheckCircle2 size={10} /> {faMs(a.ms)}
                      </Badge>
                    ) : (
                      <Badge key={i} tone={a.error === 'refused' ? 'warn' : 'bad'}>
                        <XCircle size={10} /> {ATTEMPT_LABEL[a.error]}
                      </Badge>
                    ),
                  )}
                </span>
              </KV>
            </dl>
          </div>
          {result.verdict === 'timeout' || result.verdict === 'unreachable' ? (
            <div className="card p-4 text-xs leading-7">
              <b>آی‌پی سرورتان از ایران بسته شده؟</b> سرورهای ساعتی ما آی‌پی تست‌شده از داخل ایران تحویل می‌دهند و تعویض آی‌پی
              از داخل پنل با یک کلیک انجام می‌شود.
              <a href={ctaHref} rel="noopener" className="btn btn-primary btn-sm mt-2 flex w-full sm:inline-flex sm:w-auto">
                ساخت سرور با آی‌پی تست‌شده <ArrowLeft size={14} />
              </a>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ─────────────  DNS  ─────────────

export function DnsTool() {
  const initial = useInitialQuery();
  const [target, setTarget] = useState('');
  const { result, error, loading, run } = useToolRunner<DnsResult>('dns');
  useEffect(() => {
    if (initial.q) setTarget(initial.q);
  }, [initial.q]);

  return (
    <div className="space-y-4">
      <TargetForm value={target} onChange={setTarget} onSubmit={() => run({ target })} loading={loading} placeholder="example.com" label="دامنه یا آی‌پی" />
      <ToolError message={error} />

      {result ? (
        <div className="space-y-3">
          {result.filteredHint ? (
            <Alert tone="warning" title="این دامنه در ایران فیلتر است">
              DNS داخل ایران برای این دامنه آی‌پی 10.10.34.x برمی‌گرداند که نشانه فیلتر شدن است.
            </Alert>
          ) : null}
          <div className="card p-4">
            <p className="mb-2 text-xs font-bold ltr text-left">{result.host}</p>
            {result.ptr ? (
              <dl>
                <KV label="نام برگشتی (PTR)" ltr>
                  {result.ptr.length ? result.ptr.join('\n') : '— ندارد'}
                </KV>
              </dl>
            ) : (
              <dl>
                {result.records.map((r) => (
                  <KV key={r.type} label={r.type}>
                    {r.values.length ? (
                      <ul className="ltr space-y-1 text-left mono">
                        {r.values.map((v, i) => (
                          <li key={i} className="break-all">
                            {v}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="muted">{r.error ?? '— ندارد'}</span>
                    )}
                  </KV>
                ))}
              </dl>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─────────────  SSL  ─────────────

const SSL_ERRORS: Record<string, string> = {
  CERT_HAS_EXPIRED: 'گواهی منقضی شده است.',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'گواهی خودامضا است و مرورگرها به آن اعتماد نمی‌کنند.',
  SELF_SIGNED_CERT_IN_CHAIN: 'زنجیره گواهی به یک ریشه خودامضا و نامعتبر می‌رسد.',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'زنجیره گواهی ناقص است؛ سرور گواهی واسط (Intermediate) را نمی‌فرستد. در nginx از fullchain.pem استفاده کنید.',
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'زنجیره گواهی ناقص است یا صادرکننده معتبر نیست.',
  CERT_NOT_YET_VALID: 'تاریخ شروع اعتبار گواهی هنوز نرسیده است (ساعت سرور را بررسی کنید).',
  ERR_TLS_CERT_ALTNAME_INVALID: 'گواهی برای این نام دامنه صادر نشده است.',
};

export function SslTool() {
  const initial = useInitialQuery();
  const [target, setTarget] = useState('');
  const { result, error, loading, run } = useToolRunner<SslResult>('ssl');
  useEffect(() => {
    if (initial.q) setTarget(initial.q);
  }, [initial.q]);

  const leaf = result?.chain[0];
  const expiring = leaf && leaf.daysLeft >= 0 && leaf.daysLeft < 15;

  return (
    <div className="space-y-4">
      <TargetForm value={target} onChange={setTarget} onSubmit={() => run({ target })} loading={loading} placeholder="example.com" label="دامنه" />
      <ToolError message={error} />

      {result && leaf ? (
        <div className="space-y-3">
          {result.valid && !expiring ? (
            <Alert tone="success" title="گواهی معتبر است">
              {`${fa(leaf.daysLeft)} روز تا انقضا مانده است.`}
            </Alert>
          ) : result.valid ? (
            <Alert tone="warning" title="گواهی به‌زودی منقضی می‌شود">
              {`فقط ${fa(leaf.daysLeft)} روز مانده؛ همین حالا تمدید کنید.`}
            </Alert>
          ) : (
            <Alert tone="error" title="گواهی مشکل دارد">
              {(result.error && SSL_ERRORS[result.error]) ?? `مرورگرها به این گواهی اعتماد نمی‌کنند (${result.error ?? 'خطای نامشخص'}).`}
            </Alert>
          )}

          <div className="card p-4">
            <dl>
              <KV label="دامنه گواهی">{leaf.subject}</KV>
              <KV label="صادرکننده">{leaf.issuer}</KV>
              <KV label="اعتبار">
                از {faDate(leaf.validFrom)} تا {faDate(leaf.validTo)}{' '}
                <Badge tone={leaf.daysLeft < 0 ? 'bad' : leaf.daysLeft < 15 ? 'warn' : 'ok'}>
                  {leaf.daysLeft < 0 ? 'منقضی' : `${fa(leaf.daysLeft)} روز مانده`}
                </Badge>
              </KV>
              <KV label="تطبیق با نام دامنه">
                {result.hostnameMatch ? (
                  <span className="text-emerald-600">بله</span>
                ) : (
                  <span className="text-red-600">خیر</span>
                )}
              </KV>
              <KV label="دامنه‌های تحت پوشش" ltr>
                {leaf.altNames.join('، ') || '—'}
              </KV>
              <KV label="کلید" ltr>
                {leaf.keyInfo ?? '—'}
              </KV>
              <KV label="پروتکل و رمزنگاری" ltr>
                {[result.protocol, result.cipher, result.alpn ? `ALPN: ${result.alpn}` : null].filter(Boolean).join(' · ')}
              </KV>
              <KV label="آی‌پی سرور" ltr>
                {result.ip}:{result.port}
              </KV>
            </dl>
          </div>

          {result.chain.length > 1 ? (
            <div className="card p-4">
              <p className="mb-2 text-xs font-bold">زنجیره گواهی</p>
              <ol className="space-y-2">
                {result.chain.map((c, i) => (
                  <li key={c.fingerprint256 || i} className="flex items-start gap-2 text-[11px]">
                    <span className="tabular mt-0.5 font-bold text-[var(--color-brand-600)]">{fa(i + 1)}</span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{c.subject}</span>
                      <span className="block muted">
                        صادرکننده: {c.issuer} · تا {faDate(c.validTo)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ─────────────  هدر و سرعت  ─────────────

function TimingBar({ t }: { t: HttpResult['timings'] }) {
  const parts = [
    { key: 'dns', label: 'DNS', value: t.dns, color: '#94a3b8' },
    { key: 'connect', label: 'اتصال', value: t.connect, color: '#60a5fa' },
    { key: 'tls', label: 'TLS', value: t.tls ?? 0, color: '#a78bfa' },
    { key: 'server', label: 'پاسخ سرور', value: Math.max(0, t.ttfb - t.connect - (t.tls ?? 0)), color: '#f59e0b' },
    { key: 'download', label: 'دریافت', value: Math.max(0, t.total - t.dns - t.ttfb), color: '#34d399' },
  ].filter((p) => p.value > 0);
  const sum = parts.reduce((s, p) => s + p.value, 0) || 1;

  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full ltr" role="img" aria-label="تفکیک زمان پاسخ">
        {parts.map((p) => (
          <span key={p.key} style={{ width: `${(p.value / sum) * 100}%`, background: p.color }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
            {p.label}: <span className="tabular">{faMs(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HttpTool() {
  const initial = useInitialQuery();
  const [target, setTarget] = useState('');
  const { result, error, loading, run } = useToolRunner<HttpResult>('http');
  useEffect(() => {
    if (initial.q) setTarget(initial.q);
  }, [initial.q]);

  const statusTone = !result ? 'muted' : result.status < 300 ? 'ok' : result.status < 400 ? 'warn' : 'bad';
  const ttfbTone = !result ? '' : result.timings.ttfb < 600 ? 'text-emerald-600' : result.timings.ttfb < 1500 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="space-y-4">
      <TargetForm value={target} onChange={setTarget} onSubmit={() => run({ target })} loading={loading} placeholder="https://example.com" label="نشانی سایت" />
      <ToolError message={error} />
      {loading ? <p className="text-xs muted">در حال درخواست از ایران…</p> : null}

      {result ? (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="card p-3 text-center">
              <div className="text-lg font-extrabold">
                <Badge tone={statusTone}>
                  <span className="tabular text-sm">{result.status}</span>
                </Badge>
              </div>
              <div className="mt-1 text-[10px] muted ltr">{result.statusText || 'کد وضعیت'}</div>
            </div>
            <div className="card p-3 text-center">
              <div className={`tabular text-lg font-extrabold ${ttfbTone}`}>{faMs(result.timings.ttfb)}</div>
              <div className="mt-1 text-[10px] muted">اولین بایت (TTFB)</div>
            </div>
            <div className="card p-3 text-center">
              <div className="tabular text-lg font-extrabold">{faMs(result.timings.total)}</div>
              <div className="mt-1 text-[10px] muted">
                کل زمان · {fa(Math.round(result.bytes / 1024))} کیلوبایت{result.truncated ? '+' : ''}
              </div>
            </div>
          </div>

          <div className="card p-4">
            <TimingBar t={result.timings} />
          </div>

          {result.redirects.length ? (
            <div className="card p-4">
              <p className="mb-2 text-xs font-bold">ریدایرکت‌ها</p>
              <ol className="space-y-1.5">
                {result.redirects.map((r, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <Badge tone="warn">{r.status}</Badge>
                    <span className="ltr mono break-all">{r.url}</span>
                    <ArrowLeft size={12} className="muted" />
                    <span className="ltr mono break-all">{r.location}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          <div className="card p-4">
            <p className="mb-2 text-xs font-bold">هدرهای امنیتی</p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {result.security.map((s) => (
                <li key={s.key} className="flex items-center gap-2 text-[11px]">
                  {s.ok ? <CheckCircle2 size={13} className="text-emerald-500" /> : <AlertTriangle size={13} className="text-amber-500" />}
                  {s.label}
                </li>
              ))}
              <li className="flex items-center gap-2 text-[11px]">
                {result.compression ? <CheckCircle2 size={13} className="text-emerald-500" /> : <CircleDashed size={13} className="muted" />}
                فشرده‌سازی: {result.compression ?? 'ندارد'}
              </li>
            </ul>
          </div>

          <div className="card p-4">
            <p className="mb-2 text-xs font-bold">
              هدرهای پاسخ <span className="font-normal muted">· HTTP/{result.httpVersion} · {result.ip}</span>
            </p>
            <dl>
              {result.headers.map(([k, v]) => (
                <KV key={k} label={k} ltr>
                  {v}
                </KV>
              ))}
            </dl>
          </div>
        </div>
      ) : null}
    </div>
  );
}
