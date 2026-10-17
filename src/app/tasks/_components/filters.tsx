'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { Search, X } from 'lucide-react';
import { Input, Select } from '@/components/ui';
import { fetcher } from '@/lib/client';
import { TASK_NECESSITY_FA, TASK_PRIORITY_FA, TASK_TYPE_FA } from '@/lib/dev-tasks-shared';
import { personName, type TaskMeta } from './types';

export function useTaskMeta() {
  return useSWR<TaskMeta>('/api/tasks/meta', fetcher, { revalidateOnFocus: false });
}

export const FILTER_KEYS = ['q', 'type', 'priority', 'necessity', 'assignee', 'area', 'label'] as const;
export type Filters = Partial<Record<(typeof FILTER_KEYS)[number] | 'view' | 'status' | 'sort' | 'page', string>>;

/**
 * وضعیت فیلترها در آدرس صفحه نگه داشته می‌شود تا با رفرش یا اشتراک لینک از
 * دست نرود و دکمه برگشت مرورگر هم درست کار کند.
 */
export function useUrlFilters(): [Filters, (patch: Filters) => void, () => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters: Filters = {};
  params.forEach((v, k) => {
    if (v) filters[k as keyof Filters] = v;
  });

  const set = useCallback(
    (patch: Filters) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      // هر تغییر فیلتری به صفحه نخست برمی‌گردد، مگر خود صفحه عوض شده باشد
      if (!('page' in patch)) next.delete('page');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const reset = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    for (const k of FILTER_KEYS) next.delete(k);
    next.delete('page');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  return [filters, set, reset];
}

export function toQuery(filters: Filters, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...filters, ...extra })) if (v) q.set(k, v);
  return q.toString();
}

/** نوار فیلتر مشترک فهرست و تخته */
export function FilterBar({
  filters,
  onChange,
  onReset,
}: {
  filters: Filters;
  onChange: (p: Filters) => void;
  onReset: () => void;
}) {
  const { data: meta } = useTaskMeta();
  const [q, setQ] = useState(filters.q ?? '');

  // جستجو با کمی تأخیر تا با هر حرف درخواست جدید نرود
  useEffect(() => {
    if ((filters.q ?? '') === q) return;
    const t = setTimeout(() => onChange({ q }), 350);
    return () => clearTimeout(t);
  }, [q, filters.q, onChange]);

  const active = FILTER_KEYS.some((k) => filters[k]);

  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
      <div className="relative col-span-2 sm:w-56">
        <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 muted" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="جستجو در عنوان، شرح یا شماره"
          className="pr-8 text-xs"
        />
      </div>
      <div className="sm:w-32">
        <Select value={filters.type ?? ''} onChange={(e) => onChange({ type: e.target.value })} className="text-xs">
          <option value="">همه انواع</option>
          {Object.entries(TASK_TYPE_FA).map(([k, v]) => (
            <option key={k} value={k}>
              {v.emoji} {v.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="sm:w-32">
        <Select value={filters.priority ?? ''} onChange={(e) => onChange({ priority: e.target.value })} className="text-xs">
          <option value="">همه اولویت‌ها</option>
          {Object.entries(TASK_PRIORITY_FA).map(([k, v]) => (
            <option key={k} value={k}>
              اولویت {v.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="sm:w-32">
        <Select value={filters.necessity ?? ''} onChange={(e) => onChange({ necessity: e.target.value })} className="text-xs">
          <option value="">همه ضرورت‌ها</option>
          {Object.entries(TASK_NECESSITY_FA).map(([k, v]) => (
            <option key={k} value={k}>
              ضرورت {v.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="sm:w-36">
        <Select value={filters.assignee ?? ''} onChange={(e) => onChange({ assignee: e.target.value })} className="text-xs">
          <option value="">همه مسئول‌ها</option>
          <option value="me">سپرده به من</option>
          <option value="none">بدون مسئول</option>
          {meta?.members.map((m) => (
            <option key={m.id} value={m.id}>
              {personName(m)}
            </option>
          ))}
        </Select>
      </div>
      <div className="sm:w-40">
        <Select value={filters.area ?? ''} onChange={(e) => onChange({ area: e.target.value })} className="text-xs">
          <option value="">همه بخش‌ها</option>
          {meta?.areas.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
      </div>
      {meta?.labels.length ? (
        <div className="sm:w-32">
          <Select value={filters.label ?? ''} onChange={(e) => onChange({ label: e.target.value })} className="text-xs">
            <option value="">همه برچسب‌ها</option>
            {meta.labels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      {active ? (
        <button
          type="button"
          onClick={() => {
            setQ('');
            onReset();
          }}
          className="inline-flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs muted hover:text-red-500"
        >
          <X size={13} /> حذف فیلترها
        </button>
      ) : null}
    </div>
  );
}
