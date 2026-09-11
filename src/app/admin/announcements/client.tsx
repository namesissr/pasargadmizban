'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Megaphone, Plus, Pencil, Trash2, Pin } from 'lucide-react';
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
  Textarea,
  Toggle,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiDelete, apiPatch, apiPost, errorMessage, fetcher } from '@/lib/client';
import { faDateTime, cn } from '@/lib/utils';

type Announcement = {
  id: string;
  title: string;
  body: string;
  level: 'info' | 'success' | 'warning' | 'error';
  pinned: boolean;
  active: boolean;
  createdAt: string;
};

const LEVELS: { value: Announcement['level']; label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }[] = [
  { value: 'info', label: 'اطلاع‌رسانی', tone: 'muted' },
  { value: 'success', label: 'خبر خوب', tone: 'ok' },
  { value: 'warning', label: 'هشدار', tone: 'warn' },
  { value: 'error', label: 'اختلال', tone: 'bad' },
];

const levelOf = (v: string) => LEVELS.find((l) => l.value === v) ?? LEVELS[0];

export function AnnouncementsClient() {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<{ items: Announcement[] }>('/api/admin/announcements', fetcher);

  const [editing, setEditing] = useState<Announcement | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Announcement | null>(null);
  const [busy, setBusy] = useState(false);

  if (isLoading && !data) return <LoadingBlock />;

  const items = data?.items ?? [];
  const pinned = items.find((a) => a.pinned && a.active);

  async function patch(id: string, body: Partial<Announcement>) {
    setBusy(true);
    try {
      const res = await apiPatch<{ message: string }>(`/api/admin/announcements/${id}`, body);
      toast.success(res.message);
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
      const res = await apiDelete<{ message: string }>(`/api/admin/announcements/${removing.id}`);
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
      {pinned ? (
        <Alert tone={pinned.level} title={`همین حالا روی داشبورد کاربران: ${pinned.title}`}>
          {pinned.body}
        </Alert>
      ) : (
        <Alert tone="info" title="هیچ اعلانی روی داشبورد کاربران نیست">
          برای نمایش یک پیام بالای داشبورد همه کاربران، اعلانی بسازید و کلید «سنجاق» آن را روشن کنید.
        </Alert>
      )}

      <Card
        title="اعلان‌ها"
        description="در هر لحظه فقط یک اعلان سنجاق‌شده به کاربران نشان داده می‌شود."
        action={
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
            اعلان تازه
          </Button>
        }
        bodyClassName={items.length ? 'space-y-3' : undefined}
      >
        {items.length === 0 ? (
          <EmptyState
            icon={<Megaphone size={28} />}
            title="هنوز اعلانی نساخته‌اید"
            description="اعلان‌ها برای خبر دادن از قطعی برنامه‌ریزی‌شده، تخفیف یا تغییر سرویس به کار می‌آیند."
            action={
              <Button icon={<Plus size={15} />} onClick={() => setCreating(true)}>
                ساخت نخستین اعلان
              </Button>
            }
          />
        ) : (
          items.map((item) => {
            const level = levelOf(item.level);
            return (
              <div key={item.id} className={cn('rounded-xl border p-3.5', !item.active && 'opacity-60')}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold">{item.title}</span>
                      <Badge tone={level.tone}>{level.label}</Badge>
                      {item.pinned ? (
                        <Badge tone="ok">
                          <Pin size={11} /> سنجاق‌شده
                        </Badge>
                      ) : null}
                      {!item.active ? <Badge tone="muted">غیرفعال</Badge> : null}
                    </div>
                    <p className="mt-1.5 whitespace-pre-line text-xs leading-7 muted">{item.body}</p>
                    <div className="mt-1.5 text-[11px] muted">{faDateTime(item.createdAt)}</div>
                  </div>

                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Pencil size={14} />}
                      onClick={() => setEditing(item)}
                      aria-label="ویرایش"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={14} />}
                      onClick={() => setRemoving(item)}
                      className="hover:text-red-500"
                      aria-label="حذف"
                    />
                  </div>
                </div>

                <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-2">
                  <Toggle
                    checked={item.active}
                    disabled={busy}
                    onChange={(v) => patch(item.id, { active: v })}
                    label="فعال"
                    description="اعلان غیرفعال به هیچ کاربری نشان داده نمی‌شود."
                  />
                  <Toggle
                    checked={item.pinned}
                    disabled={busy}
                    onChange={(v) => patch(item.id, { pinned: v })}
                    label="سنجاق روی داشبورد"
                    description="با روشن کردن این کلید، سنجاق اعلان قبلی برداشته می‌شود."
                  />
                </div>
              </div>
            );
          })
        )}
      </Card>

      <AnnouncementForm
        key={editing?.id ?? (creating ? 'new' : 'idle')}
        open={creating || !!editing}
        announcement={editing ?? undefined}
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
        title="حذف اعلان"
        message={`اعلان «${removing?.title ?? ''}» برای همیشه حذف می‌شود.`}
        confirmLabel="حذف اعلان"
      />
    </div>
  );
}

function AnnouncementForm({
  open,
  announcement,
  onClose,
  onSaved,
}: {
  open: boolean;
  announcement?: Announcement;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const editMode = !!announcement;

  const [title, setTitle] = useState(announcement?.title ?? '');
  const [body, setBody] = useState(announcement?.body ?? '');
  const [level, setLevel] = useState<Announcement['level']>(announcement?.level ?? 'info');
  const [pinned, setPinned] = useState(announcement?.pinned ?? false);
  const [active, setActive] = useState(announcement?.active ?? true);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const payload = { title: title.trim(), body: body.trim(), level, pinned, active };
      const res = editMode
        ? await apiPatch<{ message: string }>(`/api/admin/announcements/${announcement.id}`, payload)
        : await apiPost<{ message: string }>('/api/admin/announcements', payload);
      toast.success(res.message);
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const canSave = title.trim().length >= 3 && body.trim().length >= 5;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editMode ? 'ویرایش اعلان' : 'اعلان تازه'}
      description="این پیام بالای داشبورد کاربران نمایش داده می‌شود."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            انصراف
          </Button>
          <Button onClick={save} loading={busy} disabled={!canSave}>
            {editMode ? 'ذخیره تغییرات' : 'ساخت اعلان'}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="عنوان" required>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="قطعی برنامه‌ریزی‌شده شبکه"
          />
        </Field>

        <Field label="متن" required hint="می‌توانید چند خط بنویسید؛ خطوط حفظ می‌شوند.">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={2000} />
        </Field>

        <Field label="نوع پیام" hint="رنگ و آیکون اعلان را تعیین می‌کند.">
          <Select value={level} onChange={(e) => setLevel(e.target.value as Announcement['level'])}>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="space-y-3 border-t pt-3.5">
          <Toggle checked={active} onChange={setActive} label="فعال باشد" />
          <Toggle
            checked={pinned}
            onChange={setPinned}
            label="روی داشبورد کاربران سنجاق شود"
            description="فقط یک اعلان می‌تواند سنجاق باشد؛ سنجاق قبلی خودکار برداشته می‌شود."
          />
        </div>

        {/* پیش‌نمایش */}
        {title.trim() || body.trim() ? (
          <div>
            <div className="label">پیش‌نمایش</div>
            <Alert tone={level} title={title.trim() || 'عنوان اعلان'}>
              {body.trim() || 'متن اعلان اینجا نمایش داده می‌شود.'}
            </Alert>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
