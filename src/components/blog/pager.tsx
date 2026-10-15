import Link from 'next/link';
import { ArrowRight, ArrowLeft } from 'lucide-react';

/**
 * صفحه‌بندی با لینک واقعی (<a>) و نه دکمه؛ خزنده باید بتواند صفحه‌های بعدی
 * فهرست را دنبال کند، وگرنه مقاله‌های قدیمی‌تر هیچ‌وقت کشف نمی‌شوند.
 */
export function Pager({
  basePath,
  page,
  totalPages,
  query,
}: {
  basePath: string;
  page: number;
  totalPages: number;
  query?: string;
}) {
  if (totalPages <= 1) return null;

  const href = (p: number) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (p > 1) params.set('page', String(p));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  // در فهرست‌های بلند فقط پنجره‌ای دور صفحه جاری نشان داده می‌شود
  const pages: number[] = [];
  const from = Math.max(1, page - 2);
  const to = Math.min(totalPages, page + 2);
  for (let p = from; p <= to; p++) pages.push(p);

  return (
    <nav aria-label="صفحه‌بندی مقاله‌ها" className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
      {page > 1 ? (
        <Link href={href(page - 1)} rel="prev" className="btn btn-secondary btn-sm">
          <ArrowRight size={14} /> صفحه قبل
        </Link>
      ) : null}

      {from > 1 ? (
        <>
          <Link href={href(1)} className="btn btn-ghost btn-sm tabular">
            ۱
          </Link>
          {from > 2 ? <span className="px-1 text-xs muted">…</span> : null}
        </>
      ) : null}

      {pages.map((p) => (
        <Link
          key={p}
          href={href(p)}
          aria-current={p === page ? 'page' : undefined}
          className={`btn btn-sm tabular ${p === page ? 'btn-primary' : 'btn-ghost'}`}
        >
          {new Intl.NumberFormat('fa-IR').format(p)}
        </Link>
      ))}

      {to < totalPages ? (
        <>
          {to < totalPages - 1 ? <span className="px-1 text-xs muted">…</span> : null}
          <Link href={href(totalPages)} className="btn btn-ghost btn-sm tabular">
            {new Intl.NumberFormat('fa-IR').format(totalPages)}
          </Link>
        </>
      ) : null}

      {page < totalPages ? (
        <Link href={href(page + 1)} rel="next" className="btn btn-secondary btn-sm">
          صفحه بعد <ArrowLeft size={14} />
        </Link>
      ) : null}
    </nav>
  );
}
