'use client';

import { useMemo, useState } from 'react';
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
  Eye,
  CheckSquare,
  FolderInput,
  Send,
  Undo2,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  Input,
  LoadingBlock,
  Modal,
  Select,
  Stat,
  Tabs,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiDelete, apiPost, errorMessage, fetcher } from '@/lib/client';
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
  const [sort, setSort] = useState<'updated' | 'published' | 'views' | 'seo' | 'title' | 'words'>('updated');
  const [page, setPage] = useState(1);
  const [removing, setRemoving] = useState<AdminPostRow | null>(null);
  const [busy, setBusy] = useState(false);
  /** شناسه مقاله‌های انتخاب‌شده برای عملیات گروهی */
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [movingCategory, setMovingCategory] = useState(false);

  const params = new URLSearchParams({ status, sort, page: String(page), perPage: '20' });
  if (q.trim()) params.set('q', q.trim());
  if (categoryId) params.set('categoryId', categoryId);

  const { data, isLoading, mutate } = useSWR<ListResponse>(`/api/admin/blog/posts?${params}`, fetcher);
  const { data: catData } = useSWR<{ items: AdminCategory[] }>('/api/admin/blog/categories', fetcher);

  const items = useMemo(() => data?.items ?? [], [data]);
  const stats = data?.stats;

  const allSelected = items.length > 0 && items.every((p) => selected.includes(p.id));
  const toggleRow = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleAll = () =>
    setSelected((prev) => (allSelected ? prev.filter((id) => !items.some((p) => p.id === id)) : [
      ...new Set([...prev, ...items.map((p) => p.id)]),
    ]));

  /**
   * عملیات گروهی. حتی وقتی یک مقاله انتخاب شده، از همین مسیر می‌رویم: تغییر
   * یک کلید بدون فرستادن کل مقاله، هم سریع‌تر است و هم خطر بازنویسی ناخواسته
   * متن را ندارد.
   */
  async function bulk(action: string, categoryId?: string | null, ids = selected) {
    if (!ids.length) return;
    setBusy(true);
    try {
      const res = await apiPost<{ message: string }>('/api/admin/blog/posts/bulk', {
        ids,
        action,
        ...(categoryId !== undefined ? { categoryId } : {}),
      });
      toast.success(res.message);
      setSelected([]);
      setBulkDeleting(false);
      setMovingCategory(false);
      mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const toggleFeatured = (post: AdminPostRow) =>
    bulk(post.featured ? 'unfeature' : 'feature', undefined, [post.id]);

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

        <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_11rem_11rem]">
          <label className="relative">
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
          >
            <option value="">همه دسته‌ها</option>
            <option value="none">بی‌دسته</option>
            {(catData?.items ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as typeof sort);
              setPage(1);
            }}
            aria-label="ترتیب نمایش"
          >
            <option value="updated">تازه‌ترین ویرایش</option>
            <option value="published">تازه‌ترین انتشار</option>
            <option value="views">پربازدیدترین</option>
            <option value="seo">کم‌امتیازترین سئو</option>
            <option value="words">کوتاه‌ترین متن</option>
            <option value="title">الفبایی</option>
          </Select>
        </div>

        {/* نوار عملیات گروهی — فقط وقتی چیزی انتخاب شده باشد */}
        {selected.length > 0 ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border p-2.5 surface-2">
            <span className="flex items-center gap-1.5 px-1 text-xs font-bold">
              <CheckSquare size={14} className="text-[var(--color-brand-600)]" />
              {new Intl.NumberFormat('fa-IR').format(selected.length)} مقاله انتخاب شده
            </span>
            <div className="flex-1" />
            <Button variant="secondary" size="sm" icon={<Send size={13} />} disabled={busy} onClick={() => bulk('publish')}>
              انتشار
            </Button>
            <Button variant="secondary" size="sm" icon={<Undo2 size={13} />} disabled={busy} onClick={() => bulk('draft')}>
              پیش‌نویس
            </Button>
            <Button variant="secondary" size="sm" icon={<Star size={13} />} disabled={busy} onClick={() => bulk('feature')}>
              ویژه
            </Button>
            <Button variant="secondary" size="sm" icon={<Eye size={13} />} disabled={busy} onClick={() => bulk('index')}>
              ایندکس شود
            </Button>
            <Button variant="secondary" size="sm" icon={<EyeOff size={13} />} disabled={busy} onClick={() => bulk('noindex')}>
              بی‌ایندکس
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<FolderInput size={13} />}
              disabled={busy}
              onClick={() => setMovingCategory(true)}
            >
              تغییر دسته
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Trash2 size={13} />}
              disabled={busy}
              className="hover:text-red-500"
              onClick={() => setBulkDeleting(true)}
            >
              حذف
            </Button>
            <Button variant="ghost" size="sm" icon={<X size={13} />} onClick={() => setSelected([])} aria-label="لغو انتخاب" />
          </div>
        ) : null}

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
                  <th className="w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="انتخاب همه مقاله‌های این صفحه"
                      className="h-4 w-4 cursor-pointer accent-[var(--color-brand-600)]"
                    />
                  </th>
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
                    <tr key={post.id} className={selected.includes(post.id) ? 'bg-[var(--surface-2)]' : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.includes(post.id)}
                          onChange={() => toggleRow(post.id)}
                          aria-label={`انتخاب ${post.title}`}
                          className="h-4 w-4 cursor-pointer accent-[var(--color-brand-600)]"
                        />
                      </td>
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
        open={bulkDeleting}
        onClose={() => setBulkDeleting(false)}
        onConfirm={() => bulk('delete')}
        loading={busy}
        title="حذف گروهی مقاله‌ها"
        message={`${new Intl.NumberFormat('fa-IR').format(selected.length)} مقاله برای همیشه حذف می‌شوند. اگر هر کدام در گوگل رتبه دارد، آن رتبه از دست می‌رود؛ جایگزین بی‌خطرتر، «بی‌ایندکس» کردن است.`}
        confirmLabel="حذف همه"
      />

      <MoveCategoryModal
        open={movingCategory}
        count={selected.length}
        categories={catData?.items ?? []}
        loading={busy}
        onClose={() => setMovingCategory(false)}
        onConfirm={(categoryId) => bulk('category', categoryId)}
      />

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

/** جابه‌جایی گروهی مقاله‌ها بین دسته‌ها */
function MoveCategoryModal({
  open,
  count,
  categories,
  loading,
  onClose,
  onConfirm,
}: {
  open: boolean;
  count: number;
  categories: AdminCategory[];
  loading: boolean;
  onClose: () => void;
  onConfirm: (categoryId: string | null) => void;
}) {
  const [categoryId, setCategoryId] = useState('');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="تغییر دسته گروهی"
      description={`${new Intl.NumberFormat('fa-IR').format(count)} مقاله به دسته انتخابی منتقل می‌شوند.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            انصراف
          </Button>
          <Button onClick={() => onConfirm(categoryId || null)} loading={loading}>
            انتقال
          </Button>
        </>
      }
    >
      <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
        <option value="">بی‌دسته</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </Modal>
  );
}
