'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Trash2, ShieldCheck, Plus } from 'lucide-react';
import { Alert, Button, ConfirmModal, Field, Input, LoadingBlock, Modal, Toggle } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiDelete, apiPost, errorMessage, fetcher } from '@/lib/client';
import { formatToman, formatNumber } from '@/lib/money';
import { faDateTime } from '@/lib/utils';
import type { ServerData } from '../detail';

type SnapshotsResponse = {
  snapshots: {
    id: string;
    hetznerImageId: number;
    description: string;
    sizeGb: number;
    priceMonthly: number;
    createdAt: string;
  }[];
  backups: { id: number; description: string; created: string; sizeGb: number }[];
  pricePerGbMonth: number;
  backupsEnabled: boolean;
};

export function SnapshotsTab({ server, onDone }: { server: ServerData; onDone: () => void }) {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<SnapshotsResponse>(
    `/api/servers/${server.id}/snapshots`,
    fetcher,
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; description: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);

  async function create() {
    setCreating(true);
    try {
      const res = await apiPost<{ message: string }>(`/api/servers/${server.id}/snapshots`, { description });
      toast.success(res.message);
      setCreateOpen(false);
      setDescription('');
      mutate();
    } catch (err) {
      toast.error('ساخت اسنپ‌شات انجام نشد', errorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiDelete<{ message: string }>(`/api/servers/${server.id}/snapshots`, {
        snapshotId: deleteTarget.id,
      });
      toast.success(res.message);
      setDeleteTarget(null);
      mutate();
    } catch (err) {
      toast.error('حذف انجام نشد', errorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  async function toggleBackup(enabled: boolean) {
    setBackupBusy(true);
    try {
      const res = await apiPost<{ message: string }>(`/api/servers/${server.id}/actions`, {
        action: enabled ? 'enable_backup' : 'disable_backup',
      });
      toast.success(res.message);
      onDone();
      mutate();
    } catch (err) {
      toast.error('تغییر وضعیت پشتیبان‌گیری انجام نشد', errorMessage(err));
    } finally {
      setBackupBusy(false);
    }
  }

  if (isLoading && !data) return <LoadingBlock />;

  return (
    <div className="space-y-6">
      {/* پشتیبان‌گیری خودکار */}
      <section>
        <h3 className="mb-3 text-xs font-bold">پشتیبان‌گیری خودکار</h3>
        <div className="rounded-xl border p-4">
          <Toggle
            checked={server.backupsEnabled}
            onChange={toggleBackup}
            disabled={backupBusy || server.status === 'SUSPENDED'}
            label="پشتیبان‌گیری روزانه خودکار"
            description={`هتزنر هر روز یک نسخه پشتیبان می‌گیرد و ۷ نسخه آخر را نگه می‌دارد. هزینه: ${formatToman(server.backupPriceMonthly)} در ماه (۲۰٪ قیمت سرور).`}
          />
          {server.backupsEnabled ? (
            <p className="mt-3 border-t pt-3 text-[11px] leading-6 muted">
              با غیرفعال کردن پشتیبان‌گیری، تمام نسخه‌های پشتیبان موجود برای همیشه حذف می‌شوند.
            </p>
          ) : null}
        </div>

        {data?.backups.length ? (
          <div className="mt-3 scroll-x">
            <table className="table table-cards">
              <thead>
                <tr>
                  <th>نسخه پشتیبان</th>
                  <th>حجم</th>
                  <th>زمان</th>
                </tr>
              </thead>
              <tbody>
                {data.backups.map((b) => (
                  <tr key={b.id}>
                    <td data-label="نسخه پشتیبان" className="text-xs">{b.description}</td>
                    <td data-label="حجم" className="tabular text-xs">{formatNumber(b.sizeGb, 1)} گیگ</td>
                    <td data-label="زمان" className="text-xs muted">{faDateTime(b.created)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : server.backupsEnabled ? (
          <p className="mt-3 text-[11px] muted">
            هنوز نسخه پشتیبانی ساخته نشده است. اولین نسخه در بازه پشتیبان‌گیری بعدی ساخته می‌شود.
          </p>
        ) : null}
      </section>

      {/* اسنپ‌شات‌ها */}
      <section className="border-t pt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold">اسنپ‌شات‌های دستی</h3>
            <p className="mt-1 text-[11px] leading-6 muted">
              تصویر کامل دیسک سرور در یک لحظه مشخص. هزینه نگهداری:{' '}
              {formatToman(data?.pricePerGbMonth ?? 0)} به ازای هر گیگابایت در ماه.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            icon={<Plus size={14} />}
            disabled={server.status === 'SUSPENDED' || server.status === 'PROVISIONING'}
          >
            اسنپ‌شات جدید
          </Button>
        </div>

        {!data?.snapshots.length ? (
          <p className="rounded-xl border border-dashed py-8 text-center text-xs muted">
            هنوز اسنپ‌شاتی نساخته‌اید.
          </p>
        ) : (
          <div className="scroll-x">
            <table className="table table-cards">
              <thead>
                <tr>
                  <th>توضیح</th>
                  <th>حجم</th>
                  <th>هزینه ماهانه</th>
                  <th>زمان ساخت</th>
                  <th className="text-left">حذف</th>
                </tr>
              </thead>
              <tbody>
                {data.snapshots.map((s) => (
                  <tr key={s.id}>
                    <td data-label="توضیح" className="text-xs font-medium">{s.description}</td>
                    <td data-label="حجم" className="tabular text-xs">{formatNumber(s.sizeGb, 1)} گیگ</td>
                    <td data-label="هزینه ماهانه" className="tabular text-xs">{formatToman(s.priceMonthly)}</td>
                    <td data-label="زمان ساخت" className="text-xs muted">{faDateTime(s.createdAt)}</td>
                    <td data-label="حذف" className="text-left">
                      <button
                        onClick={() => setDeleteTarget({ id: s.id, description: s.description })}
                        className="rounded-lg p-1.5 muted transition hover:text-red-500"
                        aria-label="حذف اسنپ‌شات"
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

        <Alert tone="info" title="بازیابی از اسنپ‌شات">
          برای بازگرداندن سرور به وضعیت یک اسنپ‌شات، تیکت پشتیبانی ثبت کنید تا کارشناسان ما آن را برای شما انجام دهند.
        </Alert>
      </section>

      {/* مودال ساخت */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="ساخت اسنپ‌شات جدید"
        description="یک نسخه کامل از دیسک فعلی سرور ذخیره می‌شود."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={creating}>
              انصراف
            </Button>
            <Button onClick={create} loading={creating} disabled={description.trim().length < 2}>
              ساخت اسنپ‌شات
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="توضیح" required hint="مثلاً: قبل از ارتقای نسخه وردپرس">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="نسخه پایدار پیش از تغییرات"
              autoFocus
            />
          </Field>
          <div className="rounded-xl p-3 text-[11px] leading-6 surface-2">
            <ShieldCheck size={13} className="ml-1 inline" />
            هزینه تخمینی نگهداری: حدود{' '}
            <b>{formatToman((data?.pricePerGbMonth ?? 0) * Math.max(1, Math.round(server.disk * 0.3)))}</b> در ماه.
            هزینه واقعی بر اساس حجم داده‌های اشغال‌شده محاسبه می‌شود، نه کل دیسک.
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        loading={deleting}
        title="حذف اسنپ‌شات"
        confirmLabel="حذف کن"
        message={
          <>
            اسنپ‌شات «<b>{deleteTarget?.description}</b>» برای همیشه حذف می‌شود و هزینه نگهداری آن متوقف می‌گردد. این
            عمل قابل بازگشت نیست.
          </>
        }
      />
    </div>
  );
}
