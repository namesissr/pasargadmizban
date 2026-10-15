'use client';

import { CheckCircle2, AlertTriangle, XCircle, Gauge } from 'lucide-react';
import type { SeoReport } from '@/lib/seo-score';
import { scoreTone } from './types';

/**
 * کارت امتیاز سئو و پیش‌نمایش نتیجه گوگل.
 *
 * نویسنده باید پیش از انتشار ببیند مقاله در نتایج چه شکلی است؛ بیشتر
 * اشتباه‌های سئو (عنوان بلند، توضیح خالی، آدرس بی‌ربط) همان‌جا لو می‌رود.
 */
export function SeoPanel({
  report,
  siteUrl,
  slug,
  title,
  description,
}: {
  report: SeoReport;
  siteUrl: string;
  slug: string;
  title: string;
  description: string;
}) {
  const tone = scoreTone(report.score);
  const color = tone === 'ok' ? '#10b981' : tone === 'warn' ? '#f59e0b' : '#ef4444';
  const failed = report.checks.filter((c) => c.status !== 'ok');
  const passed = report.checks.filter((c) => c.status === 'ok');

  return (
    <div className="space-y-4">
      {/* امتیاز */}
      <div className="card p-4">
        <div className="flex items-center gap-4">
          <div
            className="grid h-20 w-20 shrink-0 place-items-center rounded-full"
            style={{
              background: `conic-gradient(${color} ${report.score * 3.6}deg, var(--border) 0deg)`,
            }}
            role="img"
            aria-label={`امتیاز سئو ${report.score} از ۱۰۰`}
          >
            <span className="grid h-[68px] w-[68px] place-items-center rounded-full" style={{ background: 'var(--surface)' }}>
              <span className="tabular text-lg font-extrabold" style={{ color }}>
                {new Intl.NumberFormat('fa-IR').format(report.score)}
              </span>
            </span>
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-bold">
              <Gauge size={15} /> امتیاز سئو
            </p>
            <p className="mt-1 text-[11px] leading-6 muted">
              {report.score >= 85
                ? 'آماده انتشار است.'
                : report.score >= 70
                  ? 'قابل انتشار، ولی چند مورد زیر را درست کنید.'
                  : 'پیش از انتشار موارد قرمز را برطرف کنید.'}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] muted">
              <span className="tabular">{new Intl.NumberFormat('fa-IR').format(report.stats.wordCount)} کلمه</span>
              <span className="tabular">{new Intl.NumberFormat('fa-IR').format(report.stats.readingMinutes)} دقیقه مطالعه</span>
              <span className="tabular">{new Intl.NumberFormat('fa-IR').format(report.stats.headings)} تیتر</span>
              <span className="tabular">{new Intl.NumberFormat('fa-IR').format(report.stats.internalLinks)} لینک داخلی</span>
            </div>
          </div>
        </div>
      </div>

      {/* پیش‌نمایش نتیجه گوگل */}
      <div className="card p-4">
        <p className="text-xs font-bold">این‌طور در گوگل دیده می‌شود</p>
        <div className="mt-3 rounded-xl border p-3">
          <p className="ltr truncate text-[11px] text-emerald-700">
            {siteUrl.replace(/^https?:\/\//, '')} › blog › {slug || '...'}
          </p>
          <p className="mt-1 line-clamp-2 text-[15px] font-semibold leading-7 text-[#1a0dab] dark:text-[#8ab4f8]">
            {title || 'عنوان مقاله اینجا نمایش داده می‌شود'}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-6 muted">
            {description || 'توضیحات متا را بنویسید تا همین‌جا به کاربر نشان داده شود.'}
          </p>
        </div>
      </div>

      {/* چک‌لیست */}
      <div className="card p-4">
        <p className="text-xs font-bold">چک‌لیست سئو</p>
        <ul className="mt-3 space-y-2.5">
          {[...failed, ...passed].map((check) => (
            <li key={check.key} className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0">
                {check.status === 'ok' ? (
                  <CheckCircle2 size={14} className="text-emerald-500" />
                ) : check.status === 'warn' ? (
                  <AlertTriangle size={14} className="text-amber-500" />
                ) : (
                  <XCircle size={14} className="text-red-500" />
                )}
              </span>
              <span className="min-w-0">
                <span className="text-[11px] font-bold">{check.label}</span>
                <p className="text-[11px] leading-6 muted">{check.message}</p>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
