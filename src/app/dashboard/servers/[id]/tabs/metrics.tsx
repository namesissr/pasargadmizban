'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Alert, LoadingBlock, Select } from '@/components/ui';
import { fetcher } from '@/lib/client';
import { formatNumber, formatBytes } from '@/lib/money';
import { cn } from '@/lib/utils';

type MetricsResponse = {
  type: 'cpu' | 'disk' | 'network';
  range: string;
  step: number;
  series: string[];
  rows: Record<string, number>[];
};

const RANGES = [
  { value: '1h', label: 'یک ساعت اخیر' },
  { value: '6h', label: 'شش ساعت اخیر' },
  { value: '24h', label: 'یک روز اخیر' },
  { value: '7d', label: 'یک هفته اخیر' },
  { value: '30d', label: 'یک ماه اخیر' },
];

const TYPES = [
  { value: 'cpu', label: 'پردازنده' },
  { value: 'network', label: 'شبکه' },
  { value: 'disk', label: 'دیسک' },
];

const SERIES_FA: Record<string, string> = {
  cpu: 'مصرف پردازنده',
  'network.0.bandwidth.in': 'پهنای باند ورودی',
  'network.0.bandwidth.out': 'پهنای باند خروجی',
  'network.0.pps.in': 'بسته ورودی',
  'network.0.pps.out': 'بسته خروجی',
  'disk.0.iops.read': 'خواندن (IOPS)',
  'disk.0.iops.write': 'نوشتن (IOPS)',
  'disk.0.bandwidth.read': 'پهنای باند خواندن',
  'disk.0.bandwidth.write': 'پهنای باند نوشتن',
};

const COLORS = ['#17b19a', '#f59e0b', '#6366f1', '#ec4899', '#0ea5e9', '#84cc16'];

export function MetricsTab({ serverId, disabled }: { serverId: string; disabled?: boolean }) {
  const [type, setType] = useState<'cpu' | 'disk' | 'network'>('cpu');
  const [range, setRange] = useState('24h');

  const { data, isLoading, error } = useSWR<MetricsResponse>(
    `/api/servers/${serverId}/metrics?type=${type}&range=${range}`,
    fetcher,
    { refreshInterval: range === '1h' ? 30_000 : 120_000 },
  );

  const isPercent = type === 'cpu';
  const isBytes = type !== 'cpu';

  function formatValue(v: number): string {
    if (isPercent) return `${formatNumber(v, 1)}٪`;
    if (type === 'network') return `${formatBytes(v, 1)}/ث`;
    return formatNumber(v, 1);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl p-1 surface-2">
          {TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setType(t.value as typeof type)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                type === t.value ? 'bg-[var(--surface)] shadow-sm' : 'muted hover:opacity-80',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <Select value={range} onChange={(e) => setRange(e.target.value)} className="w-40 text-xs">
          {RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </div>

      {disabled ? (
        <Alert tone="info" title="سرور خاموش است">
          نمودار مصرف فقط برای بازه‌هایی که سرور روشن بوده داده دارد.
        </Alert>
      ) : null}

      {error ? (
        <Alert tone="warning" title="نمودار در دسترس نیست">
          دریافت داده‌های مصرف از زیرساخت ممکن نشد. کمی بعد دوباره تلاش کنید.
        </Alert>
      ) : isLoading && !data ? (
        <LoadingBlock label="در حال دریافت داده‌های مصرف…" />
      ) : !data?.rows.length ? (
        <p className="py-12 text-center text-xs muted">داده‌ای برای این بازه ثبت نشده است.</p>
      ) : (
        <div className="h-72 w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.rows} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
              <defs>
                {data.series.map((s, i) => (
                  <linearGradient key={s} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="t"
                tickFormatter={(t: number) =>
                  new Date(t).toLocaleTimeString('fa-IR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })
                }
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                stroke="var(--border)"
                minTickGap={40}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                stroke="var(--border)"
                width={58}
                tickFormatter={(v: number) => (isPercent ? `${v}%` : isBytes ? formatBytes(v, 0) : String(v))}
                domain={isPercent ? [0, 100] : undefined}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  fontSize: 12,
                  direction: 'rtl',
                }}
                labelFormatter={(t) => new Date(Number(t)).toLocaleString('fa-IR', { hour12: false })}
                formatter={(value: number, key: string) => [formatValue(value), SERIES_FA[key] ?? key]}
              />
              <Legend
                formatter={(key: string) => (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{SERIES_FA[key] ?? key}</span>
                )}
              />
              {data.series.map((s, i) => (
                <Area
                  key={s}
                  type="monotone"
                  dataKey={s}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={1.8}
                  fill={`url(#grad-${i})`}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
