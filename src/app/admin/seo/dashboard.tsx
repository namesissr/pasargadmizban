'use client';

import Link from 'next/link';
import {
  TrendingUp,
  TrendingDown,
  MousePointerClick,
  Eye,
  ArrowUpDown,
  Gauge,
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  Search,
  ExternalLink,
} from 'lucide-react';
import { Alert, Badge, Card, Stat } from '@/components/ui';
import type { SeoResponse } from './types';

const fa = (n: number) => new Intl.NumberFormat('fa-IR').format(n);
const faDec = (n: number, digits = 1) =>
  new Intl.NumberFormat('fa-IR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
const pct = (n: number) => `${faDec(n * 100, 1)}٪`;

/** درصد تغییر نسبت به بازه قبل */
function change(current: number, previous: number): { text: string; up: boolean | null } {
  if (!previous) return { text: current ? 'تازه' : '—', up: current ? true : null };
  const diff = ((current - previous) / previous) * 100;
  if (Math.abs(diff) < 1) return { text: 'بی‌تغییر', up: null };
  return { text: `${faDec(Math.abs(diff), 0)}٪`, up: diff > 0 };
}

function TrendBadge({ current, previous, lowerIsBetter = false }: { current: number; previous: number; lowerIsBetter?: boolean }) {
  const { text, up } = change(current, previous);
  if (up === null) return <span className="text-[11px] muted">{text}</span>;
  const good = lowerIsBetter ? !up : up;
  return (
    <span className={`flex items-center gap-1 text-[11px] font-bold ${good ? 'text-emerald-600' : 'text-red-500'}`}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {text}
    </span>
  );
}

export function SeoDashboard({ data }: { data: SeoResponse }) {
  const { health, search, gsc, site } = data;
  const scoreTone = health.score >= 80 ? 'text-emerald-600' : health.score >= 55 ? 'text-amber-600' : 'text-red-500';

  return (
    <div className="space-y-4">
      {/* ── آمار واقعی گوگل ── */}
      {search ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="کلیک از گوگل (۲۸ روز)"
              value={fa(search.current.clicks)}
              hint={<TrendBadge current={search.current.clicks} previous={search.previous.clicks} />}
              icon={<MousePointerClick size={15} />}
            />
            <Stat
              label="نمایش در نتایج"
              value={fa(search.current.impressions)}
              hint={<TrendBadge current={search.current.impressions} previous={search.previous.impressions} />}
              icon={<Eye size={15} />}
            />
            <Stat
              label="میانگین جایگاه"
              value={search.current.position ? faDec(search.current.position, 1) : '—'}
              hint={<TrendBadge current={search.current.position} previous={search.previous.position} lowerIsBetter />}
              icon={<ArrowUpDown size={15} />}
            />
            <Stat
              label="نرخ کلیک"
              value={search.current.impressions ? pct(search.current.ctr) : '—'}
              hint={<TrendBadge current={search.current.ctr} previous={search.previous.ctr} />}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="عبارت‌هایی که با آن‌ها دیده می‌شوید" description="۲۸ روز گذشته، به ترتیب نمایش.">
              {search.topQueries.length === 0 ? (
                <p className="text-xs muted">هنوز داده‌ای نیست. چند روز بعد از ایندکس شدن مقاله‌ها پر می‌شود.</p>
              ) : (
                <div className="scroll-x">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>عبارت</th>
                        <th>کلیک</th>
                        <th>نمایش</th>
                        <th>جایگاه</th>
                      </tr>
                    </thead>
                    <tbody>
                      {search.topQueries.slice(0, 15).map((row) => (
                        <tr key={row.keys[0]}>
                          <td className="max-w-[220px] truncate text-xs">{row.keys[0]}</td>
                          <td className="tabular text-xs">{fa(row.clicks)}</td>
                          <td className="tabular text-xs">{fa(row.impressions)}</td>
                          <td className="tabular text-xs">{faDec(row.position, 1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card title="صفحه‌های پربازدید در گوگل" description="۲۸ روز گذشته.">
              {search.topPages.length === 0 ? (
                <p className="text-xs muted">هنوز داده‌ای نیست.</p>
              ) : (
                <div className="scroll-x">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>صفحه</th>
                        <th>کلیک</th>
                        <th>نمایش</th>
                        <th>جایگاه</th>
                      </tr>
                    </thead>
                    <tbody>
                      {search.topPages.slice(0, 15).map((row) => (
                        <tr key={row.keys[0]}>
                          <td className="max-w-[220px] truncate text-xs">
                            <a href={row.keys[0]} target="_blank" rel="noopener" className="ltr hover:underline">
                              {row.keys[0]?.replace(/^https?:\/\/[^/]+/, '') || '/'}
                            </a>
                          </td>
                          <td className="tabular text-xs">{fa(row.clicks)}</td>
                          <td className="tabular text-xs">{fa(row.impressions)}</td>
                          <td className="tabular text-xs">{faDec(row.position, 1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </>
      ) : (
        <Alert tone={gsc.error ? 'warning' : 'info'} title={gsc.error ? 'خواندن آمار گوگل ناموفق بود' : 'آمار واقعی گوگل وصل نیست'}>
          {gsc.error ? (
            gsc.error
          ) : (
            <>
              برای دیدن جایگاه واقعی هر مقاله، عبارت‌های جستجو و وضعیت ایندکس، سرچ کنسول را وصل کنید: یک Service
              Account در Google Cloud بسازید، ایمیلش را در سرچ کنسول به عنوان کاربر اضافه کنید و متغیرهای{' '}
              <span className="ltr mono">GSC_CLIENT_EMAIL</span>، <span className="ltr mono">GSC_PRIVATE_KEY</span> و{' '}
              <span className="ltr mono">GSC_SITE_URL</span> را تنظیم کنید. تا آن زمان، همه آمار درون‌سایتی پایین کار
              می‌کند.
            </>
          )}
        </Alert>
      )}

      {/* ── سلامت سئوی سایت ── */}
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card title="سلامت سئو">
          <div className="text-center">
            <div className={`tabular text-4xl font-extrabold ${scoreTone}`}>{fa(health.score)}</div>
            <p className="mt-1 text-[11px] muted">از ۱۰۰ — بر اساس بررسی‌های درون‌سایتی</p>
          </div>

          <div className="mt-4 space-y-1.5 border-t pt-3">
            {health.checklist.map((item) => (
              <div key={item.key} className="flex items-start gap-2">
                {item.ok ? (
                  <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-500" />
                ) : (
                  <XCircle size={13} className="mt-0.5 shrink-0 text-red-500" />
                )}
                <span className="min-w-0">
                  <span className="text-[11px] font-semibold">{item.label}</span>
                  <span className="block text-[10px] leading-5 muted">{item.hint}</span>
                </span>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="مقاله منتشرشده" value={fa(health.stats.published)} hint={`${fa(health.stats.drafts)} پیش‌نویس`} />
            <Stat
              label="میانگین امتیاز سئو"
              value={fa(health.stats.avgSeoScore)}
              icon={<Gauge size={15} />}
              tone={health.stats.avgSeoScore >= 80 ? 'ok' : health.stats.avgSeoScore >= 60 ? 'warn' : 'bad'}
            />
            <Stat label="بازدید وبلاگ" value={fa(health.stats.totalViews)} hint="شمارش درون‌سایتی" icon={<Eye size={15} />} />
            <Stat
              label="مقاله یتیم"
              value={fa(health.stats.orphans)}
              hint="هیچ لینک داخلی ندارند"
              tone={health.stats.orphans ? 'warn' : 'ok'}
            />
          </div>

          <Card
            title="کارهایی که باید انجام شود"
            description="به ترتیب اهمیت؛ از بالا شروع کنید."
            bodyClassName={health.issues.length ? 'space-y-2.5' : undefined}
          >
            {health.issues.length === 0 ? (
              <p className="flex items-center gap-2 text-xs text-emerald-600">
                <CheckCircle2 size={14} /> هیچ ایرادی پیدا نشد.
              </p>
            ) : (
              health.issues.map((issue) => (
                <div key={issue.key} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      {issue.severity === 'critical' ? (
                        <XCircle size={14} className="mt-0.5 shrink-0 text-red-500" />
                      ) : issue.severity === 'warning' ? (
                        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
                      ) : (
                        <Info size={14} className="mt-0.5 shrink-0 muted" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold">
                          {issue.title}
                          {issue.count ? <Badge tone="muted">{fa(issue.count)}</Badge> : null}
                        </p>
                        <p className="mt-1 text-[11px] leading-6 muted">{issue.detail}</p>
                        {issue.posts?.length ? (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {issue.posts.map((post) => (
                              <Link
                                key={post.id}
                                href={`/admin/blog/${post.id}`}
                                className="max-w-[220px] truncate rounded-full border px-2 py-0.5 text-[10px] hover:border-[var(--color-brand-500)]"
                              >
                                {post.title}
                              </Link>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    {issue.href ? (
                      <Link href={issue.href} className="btn btn-ghost btn-sm shrink-0">
                        رفتن
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </Card>
        </div>
      </div>

      {/* ── نشانی‌های فنی ── */}
      <Card title="نشانی‌های فنی" description="این‌ها خودکار ساخته می‌شوند؛ نقشه سایت را در سرچ کنسول ثبت کنید.">
        <ul className="space-y-2 text-xs">
          {[
            { label: 'نقشه سایت', url: site.sitemap, icon: <Search size={13} /> },
            { label: 'robots.txt', url: site.robots, icon: <Search size={13} /> },
            { label: 'خوراک RSS', url: site.rss, icon: <ExternalLink size={13} /> },
            { label: 'کلید IndexNow', url: site.indexNowKeyFile, icon: <ExternalLink size={13} /> },
          ].map((row) => (
            <li key={row.url} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
              <span className="flex items-center gap-2 font-semibold">
                {row.icon} {row.label}
              </span>
              <a href={row.url} target="_blank" rel="noopener" className="ltr text-[11px] text-[var(--color-brand-600)] hover:underline">
                {row.url}
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
