'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  Search,
  Pencil,
  ExternalLink,
  ArrowUpDown,
  EyeOff,
  ImageOff,
  LinkIcon,
  FileText,
  Send,
} from 'lucide-react';
import { Badge, Button, Card, Input, LoadingBlock, Modal, Select } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiPost, errorMessage, fetcher } from '@/lib/client';
import { faDate } from '@/lib/utils';
import type { PostSeoDetail, PostSeoRow, SeoResponse } from './types';

const fa = (n: number) => new Intl.NumberFormat('fa-IR').format(n);
const faDec = (n: number, d = 1) =>
  new Intl.NumberFormat('fa-IR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

type SortKey = 'position' | 'clicks' | 'impressions' | 'views' | 'seoScore' | 'published';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'position', label: 'بهترین جایگاه گوگل' },
  { key: 'clicks', label: 'بیشترین کلیک' },
  { key: 'impressions', label: 'بیشترین نمایش' },
  { key: 'views', label: 'بیشترین بازدید سایت' },
  { key: 'seoScore', label: 'امتیاز سئو' },
  { key: 'published', label: 'تازه‌ترین' },
];

/**
 * جدول سئوی مقاله‌ها: بازدید درون‌سایتی، جایگاه و کلیک گوگل، امتیاز سئو و
 * ایرادهای هر مقاله در یک نگاه. با کلیک روی هر ردیف، عبارت‌هایی که آن مقاله
 * با آن‌ها دیده شده و وضعیت ایندکسش از گوگل خوانده می‌شود.
 */
export function SeoPostsTable({ data }: { data: SeoResponse }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>(data.search ? 'impressions' : 'views');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pinging, setPinging] = useState<string | null>(null);

  const rows = useMemo(() => {
    const term = q.trim();
    const filtered = term
      ? data.posts.filter(
          (p) => p.title.includes(term) || p.slug.includes(term) || (p.focusKeyword ?? '').includes(term),
        )
      : data.posts;

    const metric = (row: PostSeoRow) => data.perPage[row.id];

    return [...filtered].sort((a, b) => {
      switch (sort) {
        case 'position': {
          const pa = metric(a)?.position ?? Infinity;
          const pb = metric(b)?.position ?? Infinity;
          return pa - pb;
        }
        case 'clicks':
          return (metric(b)?.clicks ?? 0) - (metric(a)?.clicks ?? 0);
        case 'impressions':
          return (metric(b)?.impressions ?? 0) - (metric(a)?.impressions ?? 0);
        case 'views':
          return b.views - a.views;
        case 'seoScore':
          return a.seoScore - b.seoScore;
        default:
          return (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '');
      }
    });
  }, [data, q, sort]);

  async function ping(row: PostSeoRow) {
    setPinging(row.id);
    try {
      const res = await apiPost<{ message: string }>('/api/admin/seo/indexnow', {
        target: 'path',
        path: `/blog/${row.slug}`,
      });
      toast.success(res.message);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPinging(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card
        title="سئوی هر مقاله"
        description={
          data.search
            ? 'جایگاه و کلیک از گوگل سرچ کنسول (۲۸ روز گذشته) و بازدید از شمارنده سایت.'
            : 'بازدید و امتیاز سئو از داده‌های سایت. برای دیدن جایگاه گوگل، سرچ کنسول را وصل کنید.'
        }
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <label className="relative min-w-48 flex-1">
            <span className="sr-only">جستجو در مقاله‌ها</span>
            <Search size={14} className="absolute top-1/2 right-3 -translate-y-1/2 opacity-50" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در عنوان یا کلیدواژه…" className="pr-9" />
          </label>
          <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="w-48">
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>مقاله</th>
                <th>جایگاه</th>
                <th>کلیک</th>
                <th>نمایش</th>
                <th>بازدید</th>
                <th>سئو</th>
                <th>لینک ورودی</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const m = data.perPage[row.id];
                return (
                  <tr key={row.id}>
                    <td>
                      <button
                        type="button"
                        onClick={() => setDetailId(row.id)}
                        className="max-w-[260px] truncate text-right text-xs font-bold hover:text-[var(--color-brand-600)]"
                      >
                        {row.title}
                      </button>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] muted">
                        {row.status !== 'PUBLISHED' ? <Badge tone="muted">{row.status === 'DRAFT' ? 'پیش‌نویس' : 'زمان‌بندی'}</Badge> : null}
                        <span>{row.publishedAt ? faDate(row.publishedAt) : '—'}</span>
                        <span>{fa(row.wordCount)} کلمه</span>
                        {row.noindex ? (
                          <Badge tone="bad">
                            <EyeOff size={9} /> بی‌ایندکس
                          </Badge>
                        ) : null}
                        {!row.hasMeta ? (
                          <Badge tone="warn">
                            <FileText size={9} /> بی‌توضیح متا
                          </Badge>
                        ) : null}
                        {!row.hasCover ? (
                          <Badge tone="muted">
                            <ImageOff size={9} /> بی‌تصویر
                          </Badge>
                        ) : null}
                        {row.faqCount < 2 ? <Badge tone="muted">بدون FAQ</Badge> : null}
                      </div>
                    </td>
                    <td className="tabular text-xs">{m?.position ? faDec(m.position, 1) : '—'}</td>
                    <td className="tabular text-xs">{m ? fa(m.clicks) : '—'}</td>
                    <td className="tabular text-xs">{m ? fa(m.impressions) : '—'}</td>
                    <td className="tabular text-xs">{fa(row.views)}</td>
                    <td>
                      <Badge tone={row.seoScore >= 80 ? 'ok' : row.seoScore >= 60 ? 'warn' : 'bad'}>{fa(row.seoScore)}</Badge>
                    </td>
                    <td>
                      <span className={`tabular flex items-center gap-1 text-xs ${row.incomingLinks ? '' : 'text-amber-600'}`}>
                        <LinkIcon size={11} /> {fa(row.incomingLinks)}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <Link href={`/blog/${row.slug}`} target="_blank" className="btn btn-ghost btn-sm" aria-label="دیدن در سایت">
                          <ExternalLink size={13} />
                        </Link>
                        <Link href={`/admin/blog/${row.id}`} className="btn btn-ghost btn-sm" aria-label="ویرایش">
                          <Pencil size={13} />
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Send size={13} />}
                          loading={pinging === row.id}
                          onClick={() => ping(row)}
                          aria-label="اعلام به موتورهای جستجو"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {rows.length === 0 ? <p className="py-6 text-center text-xs muted">مقاله‌ای پیدا نشد.</p> : null}
      </Card>

      <PostDetailModal id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

function PostDetailModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading } = useSWR<PostSeoDetail>(id ? `/api/admin/seo/post/${id}` : null, fetcher);

  return (
    <Modal open={!!id} onClose={onClose} title="سئوی مقاله" size="lg" description={data?.post.title}>
      {isLoading || !data ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border p-3 text-center">
              <div className="tabular text-lg font-bold">{fa(data.post.views)}</div>
              <div className="text-[10px] muted">بازدید سایت</div>
            </div>
            <div className="rounded-xl border p-3 text-center">
              <div className="tabular text-lg font-bold">{data.performance ? fa(data.performance.totals.clicks) : '—'}</div>
              <div className="text-[10px] muted">کلیک گوگل</div>
            </div>
            <div className="rounded-xl border p-3 text-center">
              <div className="tabular text-lg font-bold">
                {data.performance ? fa(data.performance.totals.impressions) : '—'}
              </div>
              <div className="text-[10px] muted">نمایش</div>
            </div>
            <div className="rounded-xl border p-3 text-center">
              <div className="tabular text-lg font-bold">
                {data.performance?.totals.position ? faDec(data.performance.totals.position, 1) : '—'}
              </div>
              <div className="text-[10px] muted">میانگین جایگاه</div>
            </div>
          </div>

          {/* وضعیت ایندکس */}
          <div className="rounded-xl border p-3">
            <p className="text-xs font-bold">وضعیت ایندکس در گوگل</p>
            {data.index ? (
              <ul className="mt-2 space-y-1 text-[11px] muted">
                <li>
                  نتیجه بررسی:{' '}
                  <Badge tone={data.index.verdict === 'PASS' ? 'ok' : data.index.verdict ? 'warn' : 'muted'}>
                    {data.index.verdict ?? 'نامشخص'}
                  </Badge>
                </li>
                <li>پوشش: {data.index.coverageState ?? '—'}</li>
                <li>اجازه ایندکس: {data.index.indexingState ?? '—'}</li>
                <li>وضعیت robots: {data.index.robotsTxtState ?? '—'}</li>
                <li>آخرین خزش: {data.index.lastCrawlTime ? faDate(data.index.lastCrawlTime) : '—'}</li>
              </ul>
            ) : (
              <p className="mt-2 text-[11px] leading-6 muted">
                {data.error ?? 'برای این مقاله وضعیت ایندکس خوانده نشد (سهمیه روزانه یا عدم اتصال سرچ کنسول).'}
              </p>
            )}
          </div>

          {/* عبارت‌های جستجو */}
          <div>
            <p className="text-xs font-bold">عبارت‌هایی که این مقاله با آن‌ها دیده شده</p>
            {data.performance?.queries.length ? (
              <div className="scroll-x mt-2">
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
                    {data.performance.queries.map((row) => (
                      <tr key={row.keys[0]}>
                        <td className="max-w-[260px] truncate text-xs">{row.keys[0]}</td>
                        <td className="tabular text-xs">{fa(row.clicks)}</td>
                        <td className="tabular text-xs">{fa(row.impressions)}</td>
                        <td className="tabular text-xs">{faDec(row.position, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-[11px] leading-6 muted">
                هنوز داده‌ای نیست. مقاله‌های تازه معمولاً چند روز تا دو هفته بعد از انتشار در این فهرست ظاهر می‌شوند.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2 border-t pt-3">
            <Link href={`/admin/blog/${data.post.id}`} className="btn btn-secondary btn-sm">
              <Pencil size={14} /> ویرایش مقاله
            </Link>
            <a href={data.url} target="_blank" rel="noopener" className="btn btn-ghost btn-sm">
              <ExternalLink size={14} /> دیدن در سایت
            </a>
            <a
              href={`https://search.google.com/search-console/inspect?resource_id=${encodeURIComponent(
                data.url.replace(/\/[^/]*$/, '/'),
              )}&id=${encodeURIComponent(data.url)}`}
              target="_blank"
              rel="noopener"
              className="btn btn-ghost btn-sm"
            >
              <ArrowUpDown size={14} /> بررسی در سرچ کنسول
            </a>
          </div>
        </div>
      )}
    </Modal>
  );
}
