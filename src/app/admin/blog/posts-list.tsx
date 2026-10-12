'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  Star,
  Search,
  FileText,
  EyeOff,
  Gauge,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  Input,
  LoadingBlock,
  Select,
  Stat,
  Tabs,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiDelete, apiPatch, errorMessage, fetcher } from '@/lib/client';
import { faDate, faRelative } from '@/lib/utils';
import { STATUS_FA, scoreTone, type AdminCategory, type AdminPostRow, type PostStatus } from './types';

type ListResponse = {
  items: AdminPostRow[];
  meta: { total: number; page: number; perPage: number; totalPages: number };
  stats: { all: number; draft: number; scheduled: number; published: number };
};

const TABS: { id: 'ALL' | PostStatus; label: string }[] = [
  { id: 'ALL', label: 'همه' },
  { id: 'PUBLISHED', label: 'منتشرشده' },
  { id: 'SCHEDULED', label: 'زمان‌بندی‌شده' },
  { id: 'DRAFT', label: 'پیش‌نویس' },
];

export function PostsList() {
  const toast = useToast();
  const [status, setStatus] = useState<'ALL' | PostStatus>('ALL');
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [removing, setRemoving] = useState<AdminPostRow | null>(null);
  const [busy, setBusy] = useState(false);

  const params = new URLSearchParams({ status, page: String(page), perPage: '20' });
  if (q.trim()) params.set('q', q.trim());
  if (categoryId) params.set('categoryId', categoryId);

  const { data, isLoading, mutate } = useSWR<ListResponse>(`/api/admin/blog/posts?${params}`, fetcher);
  const { data: catData } = useSWR<{ items: AdminCategory[] }>('/api/admin/blog/categories', fetcher);

  const items = data?.items ?? [];
  const stats = data?.stats;

  async function toggleFeatured(post: AdminPostRow) {
    setBusy(true);
    try {
      // برای تغییر یک کلید، باید کل مقاله را بفرستیم؛ پس ابتدا نسخه کامل را می‌خوانیم
      const { post: full } = await fetcher<{ post: Record<string, unknown> }>(`/api/admin/blog/posts/${post.id}`);
      await apiPatch(`/api/admin/blog/posts/${post.id}`, {
        ...toPayload(full),
        featured: !post.featured,
      });
      toast.success(post.featured ? 'از مقاله‌های ویژه برداشته شد.' : 'به مقاله‌های ویژه اضافه شد.');
      mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      const res = await apiDelete<{ message: string }>(`/api/admin/blog/posts/${removing.id}`);
      toast.success(res.message);
      setRemoving(null);
      mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {stats ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="همه مقاله‌ها" value={new Intl.NumberFormat('fa-IR').format(stats.all)} icon={<FileText size={15} />} />
          <Stat label="منتشرشده" value={new Intl.NumberFormat('fa-IR').format(stats.published)} tone="ok" />
          <Stat label="زمان‌بندی‌شده" value={new Intl.NumberFormat('fa-IR').format(stats.scheduled)} tone="warn" />
          <Stat label="پیش‌نویس" value={new Intl.NumberFormat('fa-IR').format(stats.draft)} />
        </div>
      ) : null}

      <Card
        title="مقاله‌ها"
        description="امتیاز سئوی هر مقاله همان لحظه ذخیره محاسبه می‌شود؛ زیر ۷۵ یعنی جای بهتر شدن دارد."
        action={
          <Link href="/admin/blog/new" className="btn btn-primary btn-sm">
            <Plus size={14} /> مقاله تازه
          </Link>
        }
      >
        <Tabs
          tabs={TABS.map((t) => ({ id: t.id, label: t.label }))}
          active={status}
          onChange={(id) => {
            setStatus(id as 'ALL' | PostStatus);
            setPage(1);
          }}
          className="mb-3"
        />

        <div className="mb-3 flex flex-wrap gap-2">
          <label className="relative flex-1 min-w-48">
            <span className="sr-only">جستجو در مقاله‌ها</span>
            <Search size={14} className="absolute top-1/2 right-3 -translate-y-1/2 opacity-50" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="جستجو در عنوان، نشانی یا کلیدواژه…"
              className="pr-9"
            />
          </label>
          <Select
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setPage(1);
            }}
            className="w-44"
          >
            <option value="">همه دسته‌ها</option>
            {(catData?.items ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>

        {isLoading && !data ? (
          <LoadingBlock />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<FileText size={28} />}
            title="مقاله‌ای نیست"
            description="نخستین مقاله را بنویسید؛ ویرایشگر همان‌جا امتیاز سئو و پیش‌نمایش گوگل را نشان می‌دهد."
            action={
              <Link href="/admin/blog/new" className="btn btn-primary">
                <Plus size={15} /> نوشتن مقاله
              </Link>
            }
          />
        ) : (
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>عنوان</th>
                  <th>وضعیت</th>
                  <th>سئو</th>
                  <th>بازدید</th>
                  <th>انتشار</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((post) => {
                  const st = STATUS_FA[post.status];
                  return (
                    <tr key={post.id}>
                      <td>
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() => toggleFeatured(post)}
                            disabled={busy}
                            aria-label={post.featured ? 'برداشتن از ویژه' : 'ویژه کردن'}
                            className={post.featured ? 'text-amber-500' : 'muted opacity-50 hover:opacity-100'}
                          >
                            <Star size={14} fill={post.featured ? 'currentColor' : 'none'} />
                          </button>
                          <div className="min-w-0">
                            <Link href={`/admin/blog/${post.id}`} className="text-xs font-bold hover:underline">
                              {post.title}
                            </Link>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] muted">
                              {post.category ? <span>{post.category.name}</span> : <span>بی‌دسته</span>}
                              <span>•</span>
                              <span className="tabular">{new Intl.NumberFormat('fa-IR').format(post.wordCount)} کلمه</span>
                              {post.focusKeyword ? (
                                <>
                                  <span>•</span>
                                  <span>کلیدواژه: {post.focusKeyword}</span>
                                </>
                              ) : null}
                              {post.noindex ? (
                                <Badge tone="bad">
                                  <EyeOff size={10} /> بی‌ایندکس
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </td>
                      <td>
                        <Badge tone={scoreTone(post.seoScore)}>
                          <Gauge size={10} /> {new Intl.NumberFormat('fa-IR').format(post.seoScore)}
                        </Badge>
                      </td>
                      <td className="tabular text-xs">{new Intl.NumberFormat('fa-IR').format(post.views)}</td>
                      <td className="text-[11px] muted">
                        {post.publishedAt ? faDate(post.publishedAt) : '—'}
                        <div className="opacity-70">{faRelative(post.updatedAt)}</div>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <Link
                            href={`/blog/${post.slug}`}
                            target="_blank"
                            className="btn btn-ghost btn-sm"
                            aria-label="دیدن در سایت"
                          >
                            <ExternalLink size={14} />
                          </Link>
                          <Link href={`/admin/blog/${post.id}`} className="btn btn-ghost btn-sm" aria-label="ویرایش">
                            <Pencil size={14} />
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<Trash2 size={14} />}
                            onClick={() => setRemoving(post)}
                            className="hover:text-red-500"
                            aria-label="حذف"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && data.meta.totalPages > 1 ? (
          <div className="mt-3 flex items-center justify-between gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              صفحه قبل
            </Button>
            <span className="tabular text-[11px] muted">
              صفحه {new Intl.NumberFormat('fa-IR').format(data.meta.page)} از{' '}
              {new Intl.NumberFormat('fa-IR').format(data.meta.totalPages)}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= data.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              صفحه بعد
            </Button>
          </div>
        ) : null}
      </Card>

      <ConfirmModal
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        loading={busy}
        title="حذف مقاله"
        message={`مقاله «${removing?.title ?? ''}» برای همیشه حذف می‌شود. اگر این صفحه در گوگل رتبه دارد، بهتر است جایش را با مقاله تازه بگیرید یا پیش‌نویسش کنید.`}
        confirmLabel="حذف مقاله"
      />
    </div>
  );
}

/** تبدیل مقاله خوانده‌شده از API به بدنه‌ای که PATCH می‌پذیرد */
function toPayload(post: Record<string, unknown>) {
  return {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    content: post.content,
    coverImage: post.coverImage ?? undefined,
    coverAlt: post.coverAlt ?? undefined,
    metaTitle: post.metaTitle ?? undefined,
    metaDescription: post.metaDescription ?? undefined,
    focusKeyword: post.focusKeyword ?? undefined,
    keywords: post.keywords ?? undefined,
    canonicalUrl: post.canonicalUrl ?? undefined,
    ogImage: post.ogImage ?? undefined,
    noindex: post.noindex,
    faqs: Array.isArray(post.faqs) ? post.faqs : [],
    status: post.status,
    publishedAt: post.publishedAt ?? null,
    categoryId: post.categoryId ?? null,
    tags: Array.isArray(post.tags) ? post.tags : [],
    authorName: post.authorName ?? undefined,
    authorTitle: post.authorTitle ?? undefined,
    authorBio: post.authorBio ?? undefined,
  };
}
