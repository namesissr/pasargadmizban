'use client';

import useSWR from 'swr';
import { Crown, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { fetcher } from '@/lib/client';
import { formatToman } from '@/lib/money';
import { cn } from '@/lib/utils';

type Status = {
  enabled: boolean;
  tier: string;
  tierFa: { label: string; emoji: string };
  pct: number;
  effectivePct: number;
  spend: number;
  next: {
    tierFa: { label: string; emoji: string };
    pct: number;
    minSpend: number;
    remaining: number;
    progressPercent: number;
  } | null;
  table: { tier: string; tierFa: { label: string; emoji: string }; minSpend: number; pct: number }[];
};

const fa = (n: number) => new Intl.NumberFormat('fa-IR').format(n);

/**
 * کارت باشگاه مشتریان: سطح فعلی، تخفیف دائمی و مسیر رسیدن به سطح بعد.
 * حس پیشرفت، دلیل ماندن است.
 */
export function LoyaltyCard({ compact = false }: { compact?: boolean }) {
  const { data } = useSWR<Status>('/api/me/loyalty', fetcher, { revalidateOnFocus: false });

  if (!data || !data.enabled) return null;

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Crown size={15} className="text-amber-500" />
          <span className="text-sm font-bold">باشگاه مشتریان</span>
        </div>
        <span className="badge badge-warn">
          {data.tierFa.emoji} سطح {data.tierFa.label}
        </span>
      </div>

      <div className="p-4">
        {data.pct > 0 ? (
          <p className="text-xs leading-6">
            <b className="text-[var(--color-brand-600)]">{fa(data.pct)}٪ تخفیف دائمی</b> روی همه پلن‌ها دارید و
            خودکار در قیمت‌ها اعمال می‌شود.
          </p>
        ) : (
          <p className="text-xs leading-6 muted">
            با مصرف بیشتر، خودکار تخفیف دائمی می‌گیرید. تخفیف هر سطح برای همیشه می‌ماند.
          </p>
        )}

        {data.next ? (
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="muted">
                تا سطح {data.next.tierFa.label} {data.next.tierFa.emoji} ({fa(data.next.pct)}٪ تخفیف)
              </span>
              <span className="tabular font-semibold">{formatToman(data.next.remaining)} مانده</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full surface-2">
              <div
                className="h-full rounded-full bg-gradient-to-l from-amber-400 to-amber-500 transition-all"
                style={{ width: `${Math.max(3, data.next.progressPercent)}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="mt-2 text-[11px] muted">شما در بالاترین سطح هستید. 💎</p>
        )}

        {!compact ? (
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {data.table.map((t) => {
              const reached = data.spend >= t.minSpend;
              return (
                <div
                  key={t.tier}
                  className={cn(
                    'rounded-lg border p-1.5 text-center',
                    reached
                      ? 'border-amber-400/50 bg-amber-400/10'
                      : 'opacity-55',
                  )}
                >
                  <div className="text-sm leading-none">{t.tierFa.emoji}</div>
                  <div className="mt-1 text-[9px] font-semibold">{t.tierFa.label}</div>
                  <div className="tabular text-[9px] muted">{fa(t.pct)}٪</div>
                </div>
              );
            })}
          </div>
        ) : null}

        <Link
          href="/dashboard/servers/new"
          className="mt-3 flex items-center justify-center gap-1 text-[11px] font-semibold text-[var(--color-brand-600)] hover:underline"
        >
          ساخت سرور و پیشرفت در باشگاه <ArrowLeft size={12} />
        </Link>
      </div>
    </div>
  );
}
