'use client';

import { useState } from 'react';
import { Save, Trash2, AlertTriangle } from 'lucide-react';
import { Alert, Button, ConfirmModal, Field, Input } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, apiDelete, errorFields, errorMessage } from '@/lib/client';
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
