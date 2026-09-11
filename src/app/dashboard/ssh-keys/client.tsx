'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  ConfirmModal,
  CopyButton,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Textarea,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiDelete, apiPost, errorFields, errorMessage, fetcher } from '@/lib/client';
import { faDate } from '@/lib/utils';

type Key = {
  id: string;
  name: string;
  fingerprint: string;
  publicKey: string;
  createdAt: string;
};

export function SshKeysClient() {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<{ items: Key[] }>('/api/ssh-keys', fetcher);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Key | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function create() {
    setSaving(true);
    setFields({});
    try {
      await apiPost('/api/ssh-keys', { name, publicKey });
      toast.success('کلید SSH اضافه شد.');
      setOpen(false);
      setName('');
      setPublicKey('');
      mutate();
    } catch (err) {
      toast.error('افزودن کلید انجام نشد', errorMessage(err));
      setFields(errorFields(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiDelete<{ warning: string | null }>(`/api/ssh-keys/${deleteTarget.id}`);
      toast.success('کلید حذف شد.', res.warning ?? undefined);
      setDeleteTarget(null);
      mutate();
    } catch (err) {
      toast.error('حذف کلید انجام نشد', errorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <Alert tone="info" title="کلید SSH چیست؟">
        یک جفت کلید رمزنگاری است که جایگزین رمز عبور می‌شود. کلید خصوصی روی رایانه شما می‌ماند و کلید عمومی روی سرور
        نصب می‌شود. برای ساخت کلید در ویندوز، لینوکس یا مک این دستور را اجرا کنید:
        <div className="mt-2 flex items-center gap-2">
          <code className="mono ltr flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-black/5 px-2 py-1.5 text-[11px]">
            ssh-keygen -t ed25519 -C &quot;my-key&quot;
          </code>
          <CopyButton value='ssh-keygen -t ed25519 -C "my-key"' />
        </div>
        <div className="mt-2 text-[11px]">
          سپس محتوای فایل <code className="mono ltr">~/.ssh/id_ed25519.pub</code> را در کادر زیر جای‌گذاری کنید.
        </div>
      </Alert>

      <Card
        title="کلیدهای من"
        action={
          <Button size="sm" onClick={() => setOpen(true)} icon={<Plus size={14} />}>
            افزودن کلید
          </Button>
        }
        bodyClassName={data?.items.length ? 'p-0' : undefined}
      >
        {isLoading && !data ? (
          <LoadingBlock />
        ) : !data?.items.length ? (
          <EmptyState
            icon={<KeyRound size={38} />}
            title="کلید SSH ندارید"
            description="بدون کلید SSH، هنگام ساخت سرور یک رمز روت برای شما ساخته می‌شود."
            action={
              <Button onClick={() => setOpen(true)} icon={<Plus size={16} />}>
                افزودن اولین کلید
              </Button>
            }
          />
        ) : (
          <div className="scroll-x">
            <table className="table table-cards">
              <thead>
                <tr>
                  <th>نام</th>
                  <th>اثر انگشت</th>
                  <th>تاریخ افزودن</th>
                  <th className="text-left">حذف</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((k) => (
                  <tr key={k.id}>
                    <td data-label="نام" className="text-xs font-semibold">{k.name}</td>
                    <td data-label="اثر انگشت" className="mono ltr text-[11px] muted">{k.fingerprint}</td>
                    <td data-label="تاریخ افزودن" className="text-xs muted">{faDate(k.createdAt)}</td>
                    <td data-label="حذف" className="text-left">
                      <button
                        onClick={() => setDeleteTarget(k)}
                        className="rounded-lg p-1.5 muted transition hover:text-red-500"
                        aria-label="حذف کلید"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="افزودن کلید SSH"
        description="کلید عمومی (فایل با پسوند .pub) را اینجا جای‌گذاری کنید."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              انصراف
            </Button>
            <Button onClick={create} loading={saving} disabled={!name.trim() || publicKey.trim().length < 30}>
              افزودن کلید
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="نام کلید" required error={fields.name} hint="برای شناسایی، مثلاً: لپ‌تاپ کاری">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="کلید عمومی" required error={fields.publicKey}>
            <Textarea
              value={publicKey}
              onChange={(e) => setPublicKey(e.target.value)}
              className="mono ltr min-h-32 text-[11px]"
              dir="ltr"
              placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA… user@host"
            />
          </Field>
          <p className="text-[11px] leading-6 muted">
            هرگز کلید خصوصی (فایل بدون پسوند .pub) را در اینجا وارد نکنید.
          </p>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        loading={deleting}
        title="حذف کلید SSH"
        confirmLabel="حذف کن"
        message={
          <>
            کلید «<b>{deleteTarget?.name}</b>» از حساب شما حذف می‌شود. سرورهایی که این کلید روی آن‌ها نصب شده همچنان
            آن را می‌پذیرند مگر اینکه دستی حذفش کنید.
          </>
        }
      />
    </div>
  );
}
