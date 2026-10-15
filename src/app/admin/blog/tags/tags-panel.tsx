'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Hash, Plus, Pencil, Trash2, Merge, Search, Sparkles, ExternalLink } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Select,
  Stat,
  Textarea,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiDelete, apiPatch, apiPost, errorMessage, fetcher } from '@/lib/client';
import { formatNumber } from '@/lib/money';
import { faDate } from '@/lib/utils';

type Tag = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  createdAt: string;
  postCount: number;
};

/**
 * مدیریت برچسب‌ها.
 *
 * برچسب‌ها خوشه‌های موضوعی سایت را می‌سازند و لینک‌دهی داخلی را سر پا نگه
 * می‌دارند، ولی دو جور خراب می‌شوند: برچسب‌های هم‌معنا («سرور مجازی» و
 * «سرور ابری») که قدرت را بین دو صفحه پخش می‌کنند، و برچسب‌های بی‌مقاله که
 * صفحه خالی به سایت اضافه می‌کنند. ادغام و پاکسازی، درمان هر دو است.
 */
export function TagsPanel() {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<{ items: Tag[] }>('/api/admin/blog/tags', fetcher);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'name' | 'posts' | 'new'>('posts');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [merging, setMerging] = useState<Tag | null>(null);
  const [removing, setRemoving] = useState<Tag | null>(null);
  const [busy, setBusy] = useState(false);

  const items = data?.items ?? [];
  const orphans = items.filter((t) => t.postCount === 0);

  const visible = useMemo(() => {
    const all = data?.items ?? [];
    const q = query.trim();
    const list = q ? all.filter((t) => t.name.includes(q) || t.slug.includes(q)) : [...all];
    if (sort === 'posts') list.sort((a, b) => b.postCount - a.postCount || a.name.localeCompare(b.name, 'fa'));
    else if (sort === 'new') list.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    else list.sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    return list;
  }, [data, query, sort]);

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      const res = await apiDelete<{ message: string }>(`/api/admin/blog/tags/${removing.id}`);
      toast.success(res.message);
      setRemoving(null);
      mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function cleanup() {
    setBusy(true);
    try {
      const res = await apiPost<{ message: string }>('/api/admin/blog/tags/cleanup');
      toast.success(res.message);
      mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="برچسب‌ها" value={formatNumber(items.length)} icon={<Hash size={16} />} />
        <Stat
          label="برچسب بی‌مقاله"
          value={formatNumber(orphans.length)}
          hint={orphans.length ? 'صفحه خالی در سایت می‌سازد' : 'پاک و مرتب'}
          tone={orphans.length ? 'warn' : 'ok'}
        />
        <Stat
          label="برچسب تک‌مقاله‌ای"
          value={formatNumber(items.filter((t) => t.postCount === 1).length)}
          hint="نامزد ادغام با برچسب‌های نزدیک"
        />
        <Stat
          label="پرکاربردترین"
          value={items.length ? (visible[0]?.name ?? '—') : '—'}
          hint={items.length ? `${formatNumber(Math.max(...items.map((t) => t.postCount)))} مقاله` : undefined}
        />
      </div>

      {orphans.length > 0 ? (
        <Alert
          tone="warning"
          title={`${formatNumber(orphans.length)} برچسب هیچ مقاله‌ای ندارد`}
          action={
            <Button size="sm" variant="secondary" onClick={cleanup} loading={busy}>
              پاکسازی یک‌جا
            </Button>
          }
        >
          صفحه برچسبِ خالی برای گوگل «محتوای نازک» است. برچسب‌های بی‌مقاله را حذف کنید یا به مقاله‌ها اضافه‌شان کنید.
        </Alert>
      ) : null}

      <Card
        title="برچسب‌ها"
        description="نام برچسب را همان‌طور بنویسید که کاربر جستجو می‌کند؛ صفحه برچسب از سه مقاله به بالا برای گوگل باز می‌شود."
        action={
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 muted" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="جستجوی برچسب"
                className="h-9 w-40 pr-8 text-xs"
              />
            </div>
            <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-9 w-32 text-xs">
              <option value="posts">بیشترین مقاله</option>
              <option value="name">الفبایی</option>
              <option value="new">تازه‌ترین</option>
            </Select>
            <Button size="sm" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
              برچسب تازه
            </Button>
          </div>
        }
        bodyClassName={visible.length ? 'space-y-2' : undefined}
      >
        {isLoading && !data ? (
          <LoadingBlock />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Hash size={28} />}
            title={query ? 'برچسبی با این نام نبود' : 'هنوز برچسبی ندارید'}
            description={
              query
                ? 'جستجو را خالی کنید تا همه برچسب‌ها را ببینید.'
                : 'برچسب‌ها هنگام نوشتن مقاله خودکار ساخته می‌شوند؛ می‌توانید از همین‌جا هم بسازید.'
            }
          />
        ) : (
          visible.map((tag) => (
            <div key={tag.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold">{tag.name}</span>
                  <Badge tone={tag.postCount === 0 ? 'bad' : tag.postCount < 3 ? 'warn' : 'ok'}>
                    {formatNumber(tag.postCount)} مقاله
                  </Badge>
                  {tag.postCount > 0 && tag.postCount < 3 ? (
                    <span className="text-[10px] muted">زیر ۳ مقاله: صفحه‌اش noindex می‌ماند</span>
                  ) : null}
                </div>
                <p className="ltr mt-1 text-[11px] muted">
                  /blog/tag/{tag.slug} · ساخته‌شده {faDate(tag.createdAt)}
                </p>
                {tag.description ? <p className="mt-1 text-xs leading-6 muted">{tag.description}</p> : null}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {tag.postCount > 0 ? (
                  <Link
                    href={`/blog/tag/${tag.slug}`}
                    target="_blank"
                    rel="noopener"
                    className="btn btn-ghost btn-sm"
                    aria-label="دیدن صفحه برچسب"
                  >
                    <ExternalLink size={14} />
                  </Link>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Merge size={14} />}
                  onClick={() => setMerging(tag)}
                  aria-label="ادغام"
                  disabled={items.length < 2}
                />
                <Button variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={() => setEditing(tag)} aria-label="ویرایش" />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 size={14} />}
                  onClick={() => setRemoving(tag)}
                  className="hover:text-red-500"
                  aria-label="حذف"
                />
              </div>
            </div>
          ))
        )}
      </Card>

      <TagForm
        key={editing?.id ?? (creating ? 'new' : 'idle')}
        open={creating || !!editing}
        tag={editing ?? undefined}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          mutate();
        }}
      />

      <MergeModal
        key={merging?.id ?? 'merge-idle'}
        open={!!merging}
        tag={merging}
        tags={items}
        onClose={() => setMerging(null)}
        onMerged={() => {
          setMerging(null);
          mutate();
        }}
      />

      <ConfirmModal
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        loading={busy}
        title="حذف برچسب"
        message={
          removing?.postCount
            ? `برچسب «${removing.name}» از ${formatNumber(removing.postCount)} مقاله برداشته می‌شود. مقاله‌ها حذف نمی‌شوند. اگر صفحه این برچسب در گوگل ایندکس شده، بهتر است جایش را با ادغام به برچسب دیگری بدهید.`
            : `برچسب «${removing?.name ?? ''}» حذف می‌شود.`
        }
        confirmLabel="حذف برچسب"
      />
    </div>
  );
}

function TagForm({
  open,
  tag,
  onClose,
  onSaved,
}: {
  open: boolean;
  tag?: Tag;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const editMode = !!tag;
  const [name, setName] = useState(tag?.name ?? '');
  const [slug, setSlug] = useState(tag?.slug ?? '');
  const [description, setDescription] = useState(tag?.description ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const payload = { name: name.trim(), slug: slug.trim() || undefined, description: description.trim() };
      const res = editMode
        ? await apiPatch<{ message: string }>(`/api/admin/blog/tags/${tag.id}`, payload)
        : await apiPost<{ message: string }>('/api/admin/blog/tags', payload);
      toast.success(res.message);
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editMode ? 'ویرایش برچسب' : 'برچسب تازه'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            انصراف
          </Button>
          <Button onClick={save} loading={busy} disabled={name.trim().length < 2}>
            {editMode ? 'ذخیره' : 'ساخت برچسب'}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="نام برچسب" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="سرور ابری" />
        </Field>
        <Field label="نشانی برچسب" hint="خالی بگذارید تا از نام ساخته شود. پس از ایندکس شدن تغییرش ندهید.">
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} className="ltr" placeholder="cloud-server" />
        </Field>
        <Field label="توضیح" hint="یک یا دو خط که بالای صفحه برچسب نشان داده می‌شود.">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={300} />
        </Field>
      </div>
    </Modal>
  );
}

function MergeModal({
  open,
  tag,
  tags,
  onClose,
  onMerged,
}: {
  open: boolean;
  tag: Tag | null;
  tags: Tag[];
  onClose: () => void;
  onMerged: () => void;
}) {
  const toast = useToast();
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);

  const options = tags.filter((t) => t.id !== tag?.id).sort((a, b) => b.postCount - a.postCount);

  async function merge() {
    if (!tag || !target) return;
    setBusy(true);
    try {
      const res = await apiPatch<{ message: string }>(`/api/admin/blog/tags/${tag.id}`, { mergeInto: target });
      toast.success(res.message);
      onMerged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ادغام برچسب"
      description="مقاله‌های این برچسب به برچسب مقصد منتقل و خودش حذف می‌شود."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            انصراف
          </Button>
          <Button onClick={merge} loading={busy} disabled={!target}>
            ادغام کن
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="rounded-xl p-3 text-xs leading-6 surface-2">
          <Sparkles size={13} className="ml-1 inline text-[var(--color-brand-600)]" />
          دو برچسب هم‌معنا، قدرت موضوعی را نصف می‌کنند. با ادغام، همه مقاله‌ها زیر یک برچسب جمع می‌شوند و آن صفحه
          شانس رتبه گرفتن پیدا می‌کند.
        </div>
        <Field label="برچسب مبدأ">
          <Input value={tag ? `${tag.name} (${formatNumber(tag.postCount)} مقاله)` : ''} disabled />
        </Field>
        <Field label="ادغام در" required>
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">— انتخاب کنید —</option>
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({new Intl.NumberFormat('fa-IR').format(t.postCount)} مقاله)
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
