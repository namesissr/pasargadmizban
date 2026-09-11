'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { HardDrive, AlertTriangle } from 'lucide-react';
import { Alert, Button, ConfirmModal, LoadingBlock, SecretValue } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiPost, errorMessage, fetcher } from '@/lib/client';
import { cn, osFa } from '@/lib/utils';
import type { ServerData } from '../detail';

type Catalog = {
  images: {
    id: number;
    name: string | null;
    description: string;
    osFlavor: string;
    architecture: string;
  }[];
  plans: { name: string; architecture: string }[];
};

export function RebuildTab({ server, onDone }: { server: ServerData; onDone: () => void }) {
  const toast = useToast();
  const { data: catalog } = useSWR<Catalog>('/api/catalog', fetcher, { revalidateOnFocus: false });

  const [selected, setSelected] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState<string | null>(null);

  const architecture = useMemo(
    () => catalog?.plans.find((p) => p.name === server.serverTypeName)?.architecture ?? 'x86',
    [catalog, server.serverTypeName],
  );

  const images = useMemo(
    () => catalog?.images.filter((i) => i.architecture === architecture) ?? [],
    [catalog, architecture],
  );

  const selectedImage = images.find((i) => String(i.id) === selected);
  const blocked = server.status === 'SUSPENDED' || server.status === 'PROVISIONING' || server.status === 'REBUILDING';

  async function rebuild() {
    if (!selectedImage) return;
    setLoading(true);
    try {
      const res = await apiPost<{ rootPassword: string | null; message: string }>(
        `/api/servers/${server.id}/rebuild`,
        { image: selectedImage.name ?? selectedImage.description },
      );
      toast.success(res.message);
      if (res.rootPassword) setNewPassword(res.rootPassword);
      setConfirmOpen(false);
      onDone();
    } catch (err) {
      toast.error('نصب مجدد انجام نشد', errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (!catalog) return <LoadingBlock />;

  return (
    <div className="space-y-5">
      <Alert tone="error" title="هشدار: تمام داده‌های سرور پاک می‌شود">
        با نصب مجدد، دیسک سرور کاملاً فرمت شده و سیستم‌عامل جدید نصب می‌شود. پیش از ادامه، از داده‌های مهم خود نسخه
        پشتیبان بگیرید. این عمل قابل بازگشت نیست.
      </Alert>

      {newPassword ? (
        <div className="card border-emerald-500/40 p-4">
          <div className="mb-2 text-xs font-bold">رمز روت جدید</div>
          <SecretValue value={newPassword} />
          <p className="mt-2 text-[11px] leading-6 muted">
            این رمز فقط همین یک بار نمایش داده می‌شود. آن را در جای امنی ذخیره کنید.
          </p>
        </div>
      ) : null}

      {blocked ? (
        <Alert tone="warning">
          در وضعیت فعلی سرور امکان نصب مجدد وجود ندارد.
        </Alert>
      ) : null}

      <div>
        <h3 className="mb-3 text-xs font-bold">
          انتخاب سیستم‌عامل جدید
          {architecture === 'arm' ? <span className="mr-2 font-normal muted">(سازگار با ARM)</span> : null}
        </h3>
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {images.map((img) => {
            const os = osFa(img.osFlavor);
            const active = selected === String(img.id);
            const current = server.imageName === img.name || server.imageLabel === img.description;
            return (
              <button
                key={img.id}
                type="button"
                onClick={() => setSelected(String(img.id))}
                disabled={blocked}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl border p-3 text-right transition disabled:opacity-50',
                  active
                    ? 'border-[var(--color-brand-500)] bg-[color-mix(in_srgb,var(--color-brand-500)_8%,transparent)]'
                    : 'hover:bg-[var(--surface-2)]',
                )}
              >
                <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: os.color }} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{img.description}</span>
                  <span className="block text-[10px] muted">
                    {os.label}
                    {current ? ' · نصب فعلی' : ''}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t pt-4">
        <Button
          variant="danger"
          onClick={() => setConfirmOpen(true)}
          disabled={!selected || blocked}
          icon={<HardDrive size={16} />}
        >
          نصب مجدد سیستم‌عامل
        </Button>
      </div>

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={rebuild}
        loading={loading}
        title="نصب مجدد سیستم‌عامل"
        confirmLabel="بله، نصب مجدد کن"
        requireText={server.name}
        message={
          <div className="space-y-3">
            <p className="flex items-start gap-2 text-red-600">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              تمام فایل‌ها، دیتابیس‌ها و تنظیمات روی این سرور برای همیشه حذف می‌شوند.
            </p>
            <p>
              سیستم‌عامل جدید: <b>{selectedImage?.description}</b>
            </p>
            <p className="text-xs muted">آدرس IP سرور تغییری نمی‌کند و صورتحساب ادامه پیدا می‌کند.</p>
          </div>
        }
      />
    </div>
  );
}
