'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Sparkles, Check, Trash2, RotateCcw, RefreshCw, ExternalLink, Copy, AlertTriangle } from 'lucide-react';
import { Alert, Badge, Button, LoadingBlock, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiPost, errorMessage, fetcher } from '@/lib/client';
import { faDateTime } from '@/lib/utils';

const fa = (n: number) => new Intl.NumberFormat('fa-IR').format(n);
const faDec = (n: number, d = 1) =>
  new Intl.NumberFormat('fa-IR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

type ImproveState = {
  url: string;
  post: {
    id: string;
    slug: string;
    title: string;
    status: string;
    wordCount: number;
    seoScore: number;
    metaTitle: string | null;
    metaDescription: string | null;
    faqCount: number;
    updatedAt: string;
  };
  suggestion: {
    id: string;
    title: string;
    metaTitle: string | null;
    metaDescription: string | null;
    excerpt: string;
    faqs: { q: string; a: string }[];
    changes: string[];
    issues: string[];
    seoScore: number | null;
    wordCount: number | null;
    createdAt: string;
    html: string;
  } | null;
  backup: { id: string; title: string; wordCount: number | null; seoScore: number | null; createdAt: string } | null;
  totals: { clicks: number; impressions: number; ctr: number; position: number } | null;
  aiReady: boolean;
};

/** نشانی بررسی یک صفحه در سرچ کنسول (برای Request indexing) */
export function inspectUrl(url: string): string {
  const origin = url.replace(/^(https?:\/\/[^/]+).*$/, '$1/');
  return `https://search.google.com/search-console/inspect?resource_id=${encodeURIComponent(origin)}&id=${encodeURIComponent(url)}`;
}

/**
 * بهبود مقاله با هوش مصنوعی: ساخت نسخه بهتر، پیش‌نمایش و مقایسه، اعمال، و
 * بازگشت به نسخه قبل. تا مدیر «اعمال» را نزند، چیزی در سایت عوض نمی‌شود.
 */
export function ImproveModal({
  postId,
  onClose,
  onChanged,
}: {
  postId: string | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const toast = useToast();
  const key = postId ? `/api/admin/blog/posts/${postId}/improve` : null;
  const { data, isLoading, mutate } = useSWR<ImproveState>(key, fetcher, { revalidateOnFocus: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  async function run(action: 'generate' | 'apply' | 'discard' | 'revert') {
    if (!key) return;
    if (action === 'discard' && !window.confirm('نسخه پیشنهادی دور انداخته شود؟')) return;
    if (action === 'revert' && !window.confirm('مقاله به نسخه پیش از آخرین بهبود برگردد؟')) return;
    setBusy(action);
    try {
      const res = await apiPost<{ message: string }>(key, { action });
      toast.success(res.message);
      setApplied(action === 'apply');
      await mutate();
      if (action === 'apply' || action === 'revert') onChanged?.();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  function close() {
    setApplied(false);
    onClose();
  }

  const s = data?.suggestion;

  return (
    <Modal open={!!postId} onClose={close} title="بهبود مقاله با هوش مصنوعی" description={data?.post.title} size="lg">
      {isLoading || !data ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-4">
            <Box label="جایگاه گوگل" value={data.totals?.position ? faDec(data.totals.position) : '—'} />
            <Box label="نمایش در گوگل" value={data.totals ? fa(data.totals.impressions) : '—'} />
            <Box label="کلمه" value={fa(data.post.wordCount)} />
            <Box label="امتیاز سئو" value={fa(data.post.seoScore)} />
          </div>

          {applied ? (
            <Alert tone="success" title="نسخه تازه منتشر شد">
              <p className="leading-7">
                نشانی مقاله عوض نشده و اعتبارش حفظ می‌شود. برای اینکه گوگل زودتر نسخه تازه را ببیند، در سرچ کنسول همین نشانی را
                بررسی کنید و <b>Request indexing</b> را بزنید.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <a href={inspectUrl(data.url)} target="_blank" rel="noopener" className="btn btn-secondary btn-sm">
                  <ExternalLink size={13} /> باز کردن در سرچ کنسول
                </a>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(data.url).then(
                      () => toast.success('نشانی کپی شد.'),
                      () => toast.error('کپی نشد.'),
                    );
                  }}
                >
                  <Copy size={13} /> کپی نشانی
                </button>
              </div>
            </Alert>
          ) : null}

          {!s ? (
            <div className="rounded-xl border p-4">
              <p className="text-xs font-bold">چه کاری انجام می‌شود؟</p>
              <ul className="mt-2 list-disc space-y-1 pr-5 text-[11px] leading-6 muted">
                <li>هوش مصنوعی همین مقاله را با عبارت‌هایی که در گوگل با آن‌ها دیده شده و پرسش‌های کاربران کامل‌تر می‌کند.</li>
                <li>نشانی، تاریخ انتشار، دسته و برچسب‌ها عوض نمی‌شوند؛ اعتباری که صفحه تا حالا گرفته حفظ می‌شود.</li>
                <li>نسخه تازه اول فقط پیش‌نمایش است. تا «اعمال» را نزنید، در سایت چیزی تغییر نمی‌کند.</li>
                <li>ساختنش ۱ تا ۳ دقیقه طول می‌کشد و هزینه API آن تقریباً به اندازه نوشتن یک مقاله است.</li>
              </ul>
              {!data.aiReady ? (
                <Alert tone="warning" title="کلید هوش مصنوعی تنظیم نیست">
                  ANTHROPIC_API_KEY را در ‎.env‎ سرور بگذارید.
                </Alert>
              ) : null}
              <div className="mt-3">
                <Button
                  icon={<Sparkles size={14} />}
                  loading={busy === 'generate'}
                  disabled={!data.aiReady || !!busy}
                  onClick={() => run('generate')}
                >
                  ساخت نسخه بهتر
                </Button>
                {busy === 'generate' ? (
                  <p className="mt-2 text-[11px] muted">در حال نوشتن… این کار ۱ تا ۳ دقیقه طول می‌کشد؛ پنجره را نبندید.</p>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-xl border p-3">
                <p className="text-xs font-bold">تغییرهای اصلی</p>
                <ul className="mt-2 list-disc space-y-1 pr-5 text-[11px] leading-6">
                  {s.changes.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
                <p className="mt-2 text-[10px] muted">ساخته‌شده: {faDateTime(s.createdAt)}</p>
              </div>

              {s.issues.length ? (
                <Alert tone="warning" title="هشدارهای دروازه کیفیت">
                  <ul className="list-disc space-y-1 pr-5 leading-6">
                    {s.issues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                  <p className="mt-1">می‌توانید باز هم اعمالش کنید و بعد در ویرایشگر درستش کنید، یا نسخه دیگری بسازید.</p>
                </Alert>
              ) : null}

              <div className="scroll-x">
                <table className="table">
                  <thead>
                    <tr>
                      <th />
                      <th>نسخه فعلی</th>
                      <th>نسخه پیشنهادی</th>
                    </tr>
                  </thead>
                  <tbody>
                    <Row label="عنوان" before={data.post.title} after={s.title} />
                    <Row label="عنوان سئو" before={data.post.metaTitle ?? '—'} after={s.metaTitle ?? '—'} />
                    <Row label="توضیح متا" before={data.post.metaDescription ?? '—'} after={s.metaDescription ?? '—'} />
                    <Row label="کلمه" before={fa(data.post.wordCount)} after={s.wordCount ? fa(s.wordCount) : '—'} />
                    <Row label="امتیاز سئو" before={fa(data.post.seoScore)} after={s.seoScore !== null ? fa(s.seoScore) : '—'} />
                    <Row label="پرسش پرتکرار" before={fa(data.post.faqCount)} after={fa(s.faqs.length)} />
                  </tbody>
                </table>
              </div>

              <details className="rounded-xl border p-3">
                <summary className="cursor-pointer text-xs font-bold">پیش‌نمایش متن کامل نسخه پیشنهادی</summary>
                <div className="prose mt-3 max-h-[60vh] overflow-y-auto" dangerouslySetInnerHTML={{ __html: s.html }} />
                {s.faqs.length ? (
                  <div className="mt-3 border-t pt-3">
                    <p className="text-xs font-bold">پرسش‌های پرتکرار</p>
                    <ul className="mt-2 space-y-2 text-[11px] leading-6">
                      {s.faqs.map((f, i) => (
                        <li key={i}>
                          <b>{f.q}</b>
                          <br />
                          <span className="muted">{f.a}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </details>

              <div className="flex flex-wrap gap-2">
                <Button icon={<Check size={14} />} loading={busy === 'apply'} disabled={!!busy} onClick={() => run('apply')}>
                  اعمال روی مقاله
                </Button>
                <Button
                  variant="secondary"
                  icon={<RefreshCw size={14} />}
                  loading={busy === 'generate'}
                  disabled={!!busy || !data.aiReady}
                  onClick={() => run('generate')}
                >
                  ساخت دوباره
                </Button>
                <Button
                  variant="ghost"
                  icon={<Trash2 size={14} />}
                  loading={busy === 'discard'}
                  disabled={!!busy}
                  onClick={() => run('discard')}
                >
                  دور انداختن
                </Button>
              </div>
              {busy === 'generate' ? (
                <p className="text-[11px] muted">در حال نوشتن نسخه تازه… ۱ تا ۳ دقیقه؛ پنجره را نبندید.</p>
              ) : null}
            </>
          )}

          {data.backup ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed p-3">
              <span className="flex items-center gap-2 text-[11px] muted">
                <AlertTriangle size={12} />
                نسخه پیش از آخرین بهبود ({faDateTime(data.backup.createdAt)}
                {data.backup.wordCount ? `، ${fa(data.backup.wordCount)} کلمه` : ''}) نگه داشته شده است.
              </span>
              <Button
                variant="ghost"
                size="sm"
                icon={<RotateCcw size={13} />}
                loading={busy === 'revert'}
                disabled={!!busy}
                onClick={() => run('revert')}
              >
                بازگشت به آن
              </Button>
            </div>
          ) : null}

          {data.post.status !== 'PUBLISHED' ? (
            <p className="text-[11px] muted">
              <Badge tone="muted">پیش‌نویس</Badge> این مقاله هنوز منتشر نشده؛ اعمال نسخه تازه آن را منتشر نمی‌کند.
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3 text-center">
      <div className="tabular text-lg font-bold">{value}</div>
      <div className="text-[10px] muted">{label}</div>
    </div>
  );
}

function Row({ label, before, after }: { label: string; before: string; after: string }) {
  const changed = before !== after;
  return (
    <tr>
      <td className="text-[11px] font-bold whitespace-nowrap">{label}</td>
      <td className="max-w-[260px] text-[11px] leading-6 muted">{before}</td>
      <td className={`max-w-[260px] text-[11px] leading-6 ${changed ? 'font-semibold text-emerald-700' : 'muted'}`}>{after}</td>
    </tr>
  );
}
