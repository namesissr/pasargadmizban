'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { FolderTree, Plus, Pencil, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  NumberInput,
  Textarea,
  Toggle,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiDelete, apiPatch, apiPost, errorMessage, fetcher } from '@/lib/client';
import type { AdminCategory } from './types';

/**
 * دسته‌ها ستون فقرات ساختار موضوعی وبلاگ‌اند: هر دسته یک صفحه مستقل با
 * عنوان و توضیح متای خودش دارد و معمولاً روی عبارت‌های کلی‌تر (مثل «آموزش
 * لینوکس») رتبه می‌گیرد، در حالی که مقاله‌ها روی عبارت‌های دقیق‌تر.
 */
export function CategoriesPanel() {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<{ items: AdminCategory[] }>('/api/admin/blog/categories', fetcher);

  const [editing, setEditing] = useState<AdminCategory | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<AdminCategory | null>(null);
  const [busy, setBusy] = useState(false);

  const items = data?.items ?? [];

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      const res = await apiDelete<{ message: string }>(`/api/admin/blog/categories/${removing.id}`);
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
      <Card
        title="دسته‌های وبلاگ"
        description="برای هر دسته، عنوان و توضیح متای جدا بنویسید؛ صفحه دسته خودش یکی از صفحه‌های رتبه‌گیر سایت است."
        action={
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
            دسته تازه
          </Button>
        }
        bodyClassName={items.length ? 'space-y-2.5' : undefined}
      >
        {isLoading && !data ? (
          <LoadingBlock />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<FolderTree size={28} />}
            title="هنوز دسته‌ای نساخته‌اید"
            description="با سه تا پنج دسته شروع کنید؛ مثلاً «آموزش سرور»، «لینوکس»، «امنیت» و «راهنمای خرید»."
            action={
              <Button icon={<Plus size={15} />} onClick={() => setCreating(true)}>
                ساخت نخستین دسته
              </Button>
            }
          />
        ) : (
          items.map((c) => (
            <div key={c.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold">{c.name}</span>
                  <Badge tone="muted">{new Intl.NumberFormat('fa-IR').format(c.postCount)} مقاله</Badge>
                  {!c.active ? <Badge tone="bad">غیرفعال</Badge> : null}
                </div>
                <p className="ltr mt-1 text-[11px] muted">/blog/category/{c.slug}</p>
                {c.description ? <p className="mt-1.5 text-xs leading-6 muted">{c.description}</p> : null}
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={() => setEditing(c)} aria-label="ویرایش" />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 size={14} />}
                  onClick={() => setRemoving(c)}
                  className="hover:text-red-500"
                  aria-label="حذف"
                />
              </div>
            </div>
          ))
        )}
      </Card>

      <CategoryForm
        key={editing?.id ?? (creating ? 'new' : 'idle')}
        open={creating || !!editing}
        category={editing ?? undefined}
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

      <ConfirmModal
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        loading={busy}
        title="حذف دسته"
        message={`دسته «${removing?.name ?? ''}» حذف می‌شود. مقاله‌هایش حذف نمی‌شوند و فقط بی‌دسته می‌مانند.`}
        confirmLabel="حذف دسته"
      />
    </div>
  );
}

function CategoryForm({
  open,
  category,
  onClose,
  onSaved,
}: {
  open: boolean;
  category?: AdminCategory;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const editMode = !!category;

  const [name, setName] = useState(category?.name ?? '');
  const [slug, setSlug] = useState(category?.slug ?? '');
  const [description, setDescription] = useState(category?.description ?? '');
  const [metaTitle, setMetaTitle] = useState(category?.metaTitle ?? '');
  const [metaDescription, setMetaDescription] = useState(category?.metaDescription ?? '');
  const [order, setOrder] = useState(category?.order ?? 0);
  const [active, setActive] = useState(category?.active ?? true);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description.trim(),
        metaTitle: metaTitle.trim(),
        metaDescription: metaDescription.trim(),
        order,
        active,
      };
      const res = editMode
        ? await apiPatch<{ message: string }>(`/api/admin/blog/categories/${category.id}`, payload)
        : await apiPost<{ message: string }>('/api/admin/blog/categories', payload);
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
      title={editMode ? 'ویرایش دسته' : 'دسته تازه'}
      description="نام دسته را همان‌طور بنویسید که کاربر در گوگل جستجو می‌کند."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            انصراف
          </Button>
          <Button onClick={save} loading={busy} disabled={name.trim().length < 2}>
            {editMode ? 'ذخیره' : 'ساخت دسته'}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="نام دسته" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="آموزش سرور لینوکس" />
        </Field>

        <Field
          label="نشانی دسته"
          hint="خالی بگذارید تا از نام ساخته شود. پس از ایندکس شدن، تغییرش ندهید."
        >
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} className="ltr" placeholder="amoozesh-server" />
        </Field>

        <Field label="توضیح دسته" hint="دو سه خط که بالای صفحه دسته نشان داده می‌شود.">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={500} />
        </Field>

        <div className="space-y-3.5 border-t pt-3.5">
          <p className="text-xs font-bold">سئوی صفحه دسته</p>
          <Field label="عنوان سئو" hint="خالی بگذارید تا از نام دسته ساخته شود.">
            <Input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} maxLength={200} />
          </Field>
          <Field label="توضیحات متا" hint="۱۲۰ تا ۱۶۰ نویسه؛ همین متن در نتایج گوگل دیده می‌شود.">
            <Textarea value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} rows={2} maxLength={400} />
          </Field>
        </div>

        <div className="grid gap-3 border-t pt-3.5 sm:grid-cols-2">
          <Field label="ترتیب نمایش">
            <NumberInput value={order} onValueChange={setOrder} min={0} max={999} />
          </Field>
          <Toggle checked={active} onChange={setActive} label="فعال باشد" />
        </div>
      </div>
    </Modal>
  );
}
