'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Save, Trash2, AlertTriangle, Send } from 'lucide-react';
import { Alert, Button, ConfirmModal, Field, Input } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, apiPost, apiDelete, errorFields, errorMessage } from '@/lib/client';
import { formatToman } from '@/lib/money';
import { faDateTime } from '@/lib/utils';
import type { ServerData } from '../detail';

export function SettingsTab({
  server,
  onDone,
  onDeleted,
}: {
  server: ServerData;
  onDone: () => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(server.name);
  const [label, setLabel] = useState(server.label ?? '');
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [toEmail, setToEmail] = useState('');
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [transferFields, setTransferFields] = useState<Record<string, string>>({});

  const dirty = name !== server.name || label !== (server.label ?? '');

  async function save() {
    setSaving(true);
    setFields({});
    try {
      await api(`/api/servers/${server.id}`, { method: 'PATCH', body: { name, label } });
      toast.success('اطلاعات سرور ذخیره شد.');
      onDone();
    } catch (err) {
      toast.error('ذخیره انجام نشد', errorMessage(err));
      setFields(errorFields(err));
    } finally {
      setSaving(false);
    }
  }

  async function destroy() {
    setDeleting(true);
    try {
      await apiDelete(`/api/servers/${server.id}`, { confirmName: server.name });
      toast.success('سرور حذف شد', 'صورتحساب این سرور متوقف شد.');
      onDeleted();
    } catch (err) {
      toast.error('حذف انجام نشد', errorMessage(err));
      setDeleting(false);
    }
  }

  async function submitTransfer() {
    setTransferring(true);
    setTransferFields({});
    try {
      const res = await apiPost<{ message: string; toName: string }>(`/api/servers/${server.id}/transfer`, {
        toEmail,
        note: '',
      });
      toast.success('درخواست ارسال شد', res.message);
      setTransferOpen(false);
      setToEmail('');
    } catch (err) {
      toast.error('ارسال درخواست انجام نشد', errorMessage(err));
      setTransferFields(errorFields(err));
      setTransferOpen(false);
    } finally {
      setTransferring(false);
    }
  }

  const refundEstimate =
    server.billingCycle === 'MONTHLY' && server.expiresAt
      ? Math.max(
          0,
          Math.floor(
            (server.priceMonthly * (new Date(server.expiresAt).getTime() - Date.now())) /
              (30 * 24 * 3600_000),
          ),
        )
      : 0;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 text-xs font-bold">نام و برچسب</h3>
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <Field label="نام سرور" error={fields.name} hint="فقط حروف انگلیسی، عدد، نقطه و خط تیره.">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="ltr mono" dir="ltr" />
          </Field>
          <Field label="برچسب" hint="برای شناسایی راحت‌تر در لیست سرورها.">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="مثلاً سرور فروشگاه" />
          </Field>
        </div>
        <Button className="mt-4" size="sm" onClick={save} loading={saving} disabled={!dirty} icon={<Save size={14} />}>
          ذخیره تغییرات
        </Button>
      </section>

      <section className="border-t pt-5">
        <h3 className="mb-3 text-xs font-bold">اطلاعات فنی</h3>
        <dl className="max-w-2xl space-y-2 text-xs">
          <div className="flex justify-between border-b pb-2">
            <dt className="muted">شناسه داخلی</dt>
            <dd className="mono ltr">{server.id}</dd>
          </div>
          <div className="flex justify-between border-b pb-2">
            <dt className="muted">شناسه زیرساخت</dt>
            <dd className="mono ltr">{server.hetznerId ?? '—'}</dd>
          </div>
          <div className="flex justify-between border-b pb-2">
            <dt className="muted">وضعیت زیرساخت</dt>
            <dd className="ltr">{server.hetznerStatus ?? '—'}</dd>
          </div>
          <div className="flex justify-between border-b pb-2">
            <dt className="muted">دیتاسنتر</dt>
            <dd className="ltr">{server.datacenterName ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="muted">تاریخ ساخت</dt>
            <dd>{faDateTime(server.createdAt)}</dd>
          </div>
        </dl>
      </section>

      {/* انتقال مالکیت */}
      <section className="border-t pt-5">
        <h3 className="mb-3 text-xs font-bold">انتقال مالکیت سرور</h3>
        <div className="rounded-xl border p-4">
          <p className="text-[11px] leading-6 muted">
            می‌توانید این سرور را به کاربر دیگری در پاسارگاد میزبان منتقل کنید. ایمیل گیرنده را وارد کنید؛ سرور تا
            زمان تأیید گیرنده در حساب شما می‌ماند و کار می‌کند. پس از تأیید، مالکیت کامل سرور به او منتقل می‌شود و
            هزینه‌های بعدی از کیف پول او کسر می‌گردد. (هیچ پولی جابه‌جا نمی‌شود.)
          </p>
          <div className="mt-3 grid max-w-2xl gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
            <Field label="ایمیل گیرنده" error={transferFields.toEmail}>
              <Input
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                placeholder="user@example.com"
                className="ltr"
                dir="ltr"
                type="email"
              />
            </Field>
            <Button
              className="sm:mt-6"
              variant="secondary"
              size="sm"
              onClick={() => setTransferOpen(true)}
              disabled={!toEmail.trim() || server.protection}
              icon={<Send size={14} />}
            >
              ارسال درخواست انتقال
            </Button>
          </div>
          {server.protection ? (
            <p className="mt-2 text-[11px] text-amber-600">
              محافظت حذف این سرور روشن است؛ برای انتقال ابتدا باید خاموش شود (از طریق تیکت پشتیبانی).
            </p>
          ) : null}
          <Link href="/dashboard/transfers" className="mt-3 inline-block text-[11px] text-[var(--color-brand-600)] hover:underline">
            مشاهده درخواست‌های انتقال
          </Link>
        </div>
      </section>

      {/* منطقه خطر */}
      <section className="border-t pt-5">
        <h3 className="mb-3 text-xs font-bold text-red-600">منطقه خطر</h3>
        <div className="rounded-xl border border-red-500/35 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-bold">حذف کامل سرور</div>
              <p className="mt-1.5 text-[11px] leading-6 muted">
                سرور و تمام داده‌های آن برای همیشه حذف می‌شود و صورتحساب متوقف می‌گردد. این عمل قابل بازگشت نیست و
                امکان بازیابی داده وجود ندارد.
                {refundEstimate > 0 ? (
                  <>
                    {' '}
                    مبلغ حدود <b>{formatToman(refundEstimate)}</b> بابت دوره استفاده‌نشده به کیف پول شما بازگردانده
                    می‌شود.
                  </>
                ) : null}
              </p>
            </div>
            <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)} icon={<Trash2 size={14} />}>
              حذف سرور
            </Button>
          </div>
        </div>

        {server.protection ? (
          <Alert tone="info" title="محافظت حذف فعال است">
            برای حذف این سرور ابتدا باید محافظت آن غیرفعال شود. برای این کار تیکت پشتیبانی ثبت کنید.
          </Alert>
        ) : null}
      </section>

      <ConfirmModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        onConfirm={submitTransfer}
        loading={transferring}
        danger={false}
        title="انتقال سرور"
        confirmLabel="ارسال درخواست انتقال"
        message={
          <div className="space-y-2 text-xs leading-6">
            <p>
              درخواست انتقال سرور <span className="mono">{server.name}</span> به{' '}
              <span className="ltr mono">{toEmail}</span> ارسال شود؟
            </p>
            <p className="muted">
              سرور تا زمان تأیید گیرنده در حساب شما می‌ماند. پس از تأیید، دیگر به این سرور دسترسی نخواهید داشت.
            </p>
          </div>
        }
      />

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={destroy}
        loading={deleting}
        title="حذف کامل سرور"
        confirmLabel="بله، برای همیشه حذف کن"
        requireText={server.name}
        message={
          <div className="space-y-3">
            <p className="flex items-start gap-2 text-red-600">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              تمام فایل‌ها، دیتابیس‌ها، اسنپ‌شات‌ها و آدرس IP این سرور از بین می‌رود.
            </p>
            <p className="text-xs muted">
              اگر فقط می‌خواهید هزینه‌ها کم شود، به جای حذف می‌توانید پلن سرور را کاهش دهید.
            </p>
          </div>
        }
      />
    </div>
  );
}
