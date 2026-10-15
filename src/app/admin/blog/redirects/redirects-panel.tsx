'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Link2, Plus, Trash2, Search, ArrowLeft } from 'lucide-react';
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
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiDelete, apiPost, errorMessage, fetcher } from '@/lib/client';
import { formatNumber } from '@/lib/money';
import { faDate } from '@/lib/utils';
import { STATUS_FA, type AdminPostRow, type PostStatus } from '../types';

type Redirect = {
  id: string;
  slug: string;
  createdAt: string;
  post: { id: string; slug: string; title: string; status: PostStatus } | null;
};

/**
 * ریدایرکت‌های وبلاگ.
 *
 * نشانی عوض شده و ایندکس گوگل هنوز نشانی قبلی را می‌شناسد؟ تا وقتی ریدایرکت
 * ۳۰۱ سر جایش باشد، اعتباری که آن نشانی جمع کرده به نشانی تازه منتقل
 * می‌شود. اگر از سایت قبلی مهاجرت کرده‌اید، نشانی‌های قدیمی را هم همین‌جا
 * دستی وصل کنید تا لینک‌های بیرونی‌تان هدر نرود.
 */
export function RedirectsPanel() {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<{ items: Redirect[] }>('/api/admin/blog/redirects', fetcher);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Redirect | null>(null);
  const [busy, setBusy] = useState(false);

  const items = data?.items ?? [];
  const visible = useMemo(() => {
    const all = data?.items ?? [];
    const q = query.trim();
    if (!q) return all;
    return all.filter((r) => r.slug.includes(q) || r.post?.title.includes(q) || r.post?.slug.includes(q));
  }, [data, query]);

  const broken = items.filter((r) => !r.post);

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      const res = await apiDelete<{ message: string }>(`/api/admin/blog/redirects/${removing.id}`);
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
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="ریدایرکت‌های فعال" value={formatNumber(items.length)} icon={<Link2 size={16} />} />
        <Stat
          label="ریدایرکت بی‌مقصد"
          value={formatNumber(broken.length)}
          hint={broken.length ? 'مقاله مقصدشان حذف شده است' : 'همه مقصدها سالم‌اند'}
          tone={broken.length ? 'bad' : 'ok'}
        />
        <Stat
          label="تازه‌ترین"
          value={items[0] ? faDate(items[0].createdAt) : '—'}
          hint={items[0]?.slug}
        />
        <Stat label="کد ریدایرکت" value="۳۰۸" hint="انتقال دائمی، با نگه‌داشتن اعتبار نشانی قبلی" />
      </div>

      {broken.length > 0 ? (
        <Alert tone="error" title={`${formatNumber(broken.length)} ریدایرکت به مقاله حذف‌شده اشاره می‌کند`}>
          این نشانی‌ها الان به صفحه ۴۰۴ می‌خورند. یا مقاله مقصد را برگردانید یا ریدایرکت را حذف کنید.
        </Alert>
      ) : null}

      <Card
        title="نشانی‌های قدیمی"
        description="هر بار اسلاگ مقاله‌ای را عوض کنید، ردیف تازه‌ای خودکار اینجا ثبت می‌شود."
        action={
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 muted" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="جستجوی نشانی"
                className="h-9 w-40 pr-8 text-xs"
              />
            </div>
            <Button size="sm" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
              ریدایرکت دستی
            </Button>
          </div>
        }
        bodyClassName={visible.length ? 'p-0' : undefined}
      >
        {isLoading && !data ? (
          <LoadingBlock />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Link2 size={28} />}
            title={query ? 'ریدایرکتی با این نشانی نبود' : 'هنوز ریدایرکتی ثبت نشده'}
            description={
              query
                ? 'جستجو را خالی کنید.'
                : 'اگر از سایت قبلی مهاجرت کرده‌اید، نشانی‌های قدیمی را دستی به مقاله‌های تازه وصل کنید تا رتبه‌شان حفظ شود.'
            }
            action={
              <Button icon={<Plus size={15} />} onClick={() => setCreating(true)}>
                افزودن ریدایرکت
              </Button>
            }
          />
        ) : (
          <ul className="divide-y">
            {visible.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="ltr flex min-w-0 flex-wrap items-center gap-2 text-[11px]">
                    <code className="mono truncate rounded px-1.5 py-0.5 surface-2">/blog/{row.slug}</code>
                    <ArrowLeft size={12} className="shrink-0 muted" />
                    {row.post ? (
                      <code className="mono truncate rounded px-1.5 py-0.5 surface-2">/blog/{row.post.slug}</code>
                    ) : (
                      <Badge tone="bad">مقصد حذف شده</Badge>
                    )}
                  </div>
                  {row.post ? (
                    <Link href={`/admin/blog/${row.post.id}`} className="mt-1 block truncate text-xs font-semibold hover:underline">
                      {row.post.title}
                    </Link>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-[11px] muted">
                  {row.post ? <Badge tone={STATUS_FA[row.post.status].tone}>{STATUS_FA[row.post.status].label}</Badge> : null}
                  <span className="tabular">{faDate(row.createdAt)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 size={14} />}
                    onClick={() => setRemoving(row)}
                    className="hover:text-red-500"
                    aria-label="حذف ریدایرکت"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <RedirectForm
        key={creating ? 'new' : 'idle'}
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          mutate();
        }}
      />

      <ConfirmModal
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        loading={busy}
        title="حذف ریدایرکت"
        message={`نشانی /blog/${removing?.slug ?? ''} از این پس به صفحه ۴۰۴ می‌خورد. اگر لینکی از بیرون به آن مانده باشد، آن اعتبار از دست می‌رود.`}
        confirmLabel="حذف ریدایرکت"
      />
    </div>
  );
}

function RedirectForm({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { data } = useSWR<{ items: AdminPostRow[] }>(open ? '/api/admin/blog/posts?perPage=100' : null, fetcher);
  const [slug, setSlug] = useState('');
  const [postId, setPostId] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await apiPost<{ message: string }>('/api/admin/blog/redirects', { slug: slug.trim(), postId });
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
      title="ریدایرکت دستی"
      description="نشانی قدیمی را به مقاله تازه وصل کنید."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            انصراف
          </Button>
          <Button onClick={save} loading={busy} disabled={slug.trim().length < 2 || !postId}>
            ثبت ریدایرکت
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field
          label="نشانی قدیمی"
          required
          hint="فقط بخش آخر نشانی، بدون /blog/. مثال: kharid-server-majazi"
        >
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} className="ltr" placeholder="old-post-url" />
        </Field>
        <Field label="مقاله مقصد" required>
          <Select value={postId} onChange={(e) => setPostId(e.target.value)}>
            <option value="">— انتخاب مقاله —</option>
            {data?.items.map((post) => (
              <option key={post.id} value={post.id}>
                {post.title}
              </option>
            ))}
          </Select>
        </Field>
        <p className="rounded-xl p-3 text-[11px] leading-6 surface-2">
          پس از ثبت، بازدیدکننده و خزنده گوگل با کد ۳۰۸ به نشانی تازه فرستاده می‌شوند و اعتبار نشانی قبلی هم با
          خودش منتقل می‌شود.
        </p>
      </div>
    </Modal>
  );
}
