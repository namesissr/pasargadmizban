'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Alert, Button } from '@/components/ui';
import { apiPost, errorMessage } from '@/lib/client';

/**
 * بخش‌های مشترک ابزارهای شبکه: فرم ورودی و فراخوانی API.
 *
 * ورودی آخرین بررسی در نشانی صفحه (?q=) می‌نشیند تا بشود نتیجه را با لینک
 * برای کسی فرستاد؛ canonical صفحه بدون پارامتر است، پس صفحه تکراری ایندکس نمی‌شود.
 */

export const fa = (n: number) => new Intl.NumberFormat('fa-IR').format(n);
export const faMs = (n: number) =>
  `${new Intl.NumberFormat('fa-IR', { maximumFractionDigits: n < 10 ? 1 : 0 }).format(n)} میلی‌ثانیه`;

export function useToolRunner<T>(tool: string) {
  const [result, setResult] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(body: { target: string; port?: number | null }) {
    setLoading(true);
    setError(null);
    try {
      const res = await apiPost<{ result: T }>(`/api/tools/${tool}`, body);
      setResult(res.result);
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('q', body.target);
        if (body.port) url.searchParams.set('port', String(body.port));
        else url.searchParams.delete('port');
        window.history.replaceState(null, '', url.toString());
      } catch {
        // نشانی صفحه عوض نشد؛ مهم نیست
      }
    } catch (err) {
      setResult(null);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return { result, error, loading, run };
}

/** مقدار اولیه از ?q= و ?port= */
export function useInitialQuery(): { q: string; port: string } {
  const [state, setState] = useState({ q: '', port: '' });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setState({ q: params.get('q') ?? '', port: params.get('port') ?? '' });
  }, []);
  return state;
}

export function TargetForm({
  value,
  onChange,
  onSubmit,
  loading,
  placeholder,
  label,
  children,
  button = 'بررسی',
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  placeholder: string;
  label: string;
  children?: React.ReactNode;
  button?: string;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit();
      }}
      className="space-y-3"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex-1">
          <span className="sr-only">{label}</span>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            dir="ltr"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="input h-11 w-full text-left text-sm"
            aria-label={label}
          />
        </label>
        <Button type="submit" loading={loading} icon={<Search size={15} />} className="h-11 sm:w-36">
          {button}
        </Button>
      </div>
      {children}
    </form>
  );
}

export function ToolError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert tone="error" title="بررسی انجام نشد">
      {message}
    </Alert>
  );
}

/** ردیف «برچسب: مقدار» در نتیجه‌ها */
export function KV({ label, children, ltr }: { label: string; children: React.ReactNode; ltr?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 border-b py-2 last:border-0 sm:flex-row sm:items-start sm:gap-4">
      <dt className="shrink-0 text-[11px] font-semibold muted sm:w-40">{label}</dt>
      <dd className={`min-w-0 text-xs break-words ${ltr ? 'ltr text-left mono' : ''}`}>{children}</dd>
    </div>
  );
}
