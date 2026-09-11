'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Smartphone } from 'lucide-react';
import { Alert, Badge, Button, Card, CopyButton, Field, Input, Modal, PasswordInput } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, apiDelete, apiPost, errorMessage, fetcher } from '@/lib/client';
import { formatNumber } from '@/lib/money';

/**
 * ورود دو مرحله‌ای با اپلیکیشن احراز هویت (TOTP).
 * سه مرحله دارد: ساخت کلید و QR، تایید کد، و نمایش کدهای بازیابی.
 */
export function TwoFactorCard() {
  const toast = useToast();
  const { data, mutate } = useSWR<{ enabled: boolean; recoveryCodesLeft: number }>('/api/profile/2fa', fetcher);

  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; qrDataUrl: string; otpauthUrl: string } | null>(null);
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  async function startSetup() {
    setBusy(true);
    try {
      const res = await api<{ secret: string; qrDataUrl: string; otpauthUrl: string }>('/api/profile/2fa', {
        method: 'PUT',
      });
      setSetup(res);
      setToken('');
      setSetupOpen(true);
    } catch (err) {
      toast.error('شروع فعال‌سازی ممکن نشد', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup() {
    setBusy(true);
    try {
      const res = await apiPost<{ recoveryCodes: string[]; message: string }>('/api/profile/2fa', { token });
      setRecoveryCodes(res.recoveryCodes);
      setSetupOpen(false);
      toast.success(res.message);
      mutate();
    } catch (err) {
      toast.error('کد تایید نشد', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const res = await apiDelete<{ message: string }>('/api/profile/2fa', { password });
      toast.success(res.message);
      setDisableOpen(false);
      setPassword('');
      mutate();
    } catch (err) {
      toast.error('غیرفعال‌سازی ممکن نشد', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card
        title="ورود دو مرحله‌ای"
        description="حتی اگر رمز عبور شما لو برود، بدون کد اپلیکیشن کسی نمی‌تواند وارد حسابتان شود."
        action={data?.enabled ? <Badge tone="ok">فعال</Badge> : <Badge tone="muted">غیرفعال</Badge>}
      >
        {data?.enabled ? (
          <div className="space-y-3">
            <Alert tone="success" title="حساب شما محافظت می‌شود">
              {data.recoveryCodesLeft > 0
                ? `${formatNumber(data.recoveryCodesLeft)} کد بازیابی استفاده‌نشده دارید.`
                : 'هیچ کد بازیابی باقی نمانده است. در صورت از دست دادن دسترسی به اپلیکیشن، با پشتیبانی تماس بگیرید.'}
            </Alert>
            <Button variant="ghost" size="sm" onClick={() => setDisableOpen(true)}>
              غیرفعال کردن ورود دو مرحله‌ای
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs leading-7 muted">
              با اپلیکیشن‌هایی مثل Google Authenticator یا Authy کار می‌کند. فعال‌سازی کمتر از یک دقیقه طول می‌کشد.
            </p>
            <Button onClick={startSetup} loading={busy} icon={<Smartphone size={15} />}>
              فعال‌سازی ورود دو مرحله‌ای
            </Button>
          </div>
        )}
      </Card>

      {/* مرحله اسکن و تایید */}
      <Modal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        title="فعال‌سازی ورود دو مرحله‌ای"
        description="کد QR را با اپلیکیشن احراز هویت اسکن کنید."
        footer={
          <>
            <Button variant="secondary" onClick={() => setSetupOpen(false)} disabled={busy}>
              انصراف
            </Button>
            <Button onClick={confirmSetup} loading={busy} disabled={token.length !== 6}>
              تایید و فعال‌سازی
            </Button>
          </>
        }
      >
        {setup ? (
          <div className="space-y-4">
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={setup.qrDataUrl}
                alt="کد QR ورود دو مرحله‌ای"
                className="rounded-xl border bg-white p-2"
                width={220}
                height={220}
              />
            </div>

            <Field label="اگر نمی‌توانید اسکن کنید، این کلید را دستی وارد کنید">
              <div className="flex items-center gap-1.5">
                <code className="mono ltr flex-1 truncate rounded-lg px-2 py-1.5 text-xs surface-2">
                  {setup.secret}
                </code>
                <CopyButton value={setup.secret} />
              </div>
            </Field>

            <Field label="کد ۶ رقمی نمایش‌داده‌شده در اپلیکیشن" required>
              <Input
                value={token}
                onChange={(e) => setToken(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                className="ltr tabular text-center text-lg font-bold tracking-widest"
                dir="ltr"
                inputMode="numeric"
                placeholder="000000"
                autoFocus
              />
            </Field>
          </div>
        ) : (
          <div className="py-6 text-center text-xs muted">در حال آماده‌سازی…</div>
        )}
      </Modal>

      {/* نمایش کدهای بازیابی */}
      <Modal
        open={Boolean(recoveryCodes)}
        onClose={() => setRecoveryCodes(null)}
        title="کدهای بازیابی"
        description="اگر به اپلیکیشن احراز هویت دسترسی نداشتید، با این کدها وارد می‌شوید. هر کد فقط یک بار کار می‌کند."
        footer={<Button onClick={() => setRecoveryCodes(null)}>ذخیره کردم</Button>}
      >
        <div className="space-y-4">
          <Alert tone="warning" title="این کدها فقط همین یک بار نمایش داده می‌شوند">
            آن‌ها را چاپ کنید یا در جای امنی بیرون از این دستگاه نگه دارید.
          </Alert>
          <div className="grid grid-cols-2 gap-2">
            {(recoveryCodes ?? []).map((code) => (
              <code key={code} className="mono ltr rounded-lg px-2 py-2 text-center text-xs font-bold surface-2">
                {code}
              </code>
            ))}
          </div>
          <CopyButton value={(recoveryCodes ?? []).join('\n')} label="کپی همه کدها" />
        </div>
      </Modal>

      {/* غیرفعال‌سازی */}
      <Modal
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        title="غیرفعال کردن ورود دو مرحله‌ای"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDisableOpen(false)} disabled={busy}>
              انصراف
            </Button>
            <Button variant="danger" onClick={disable} loading={busy} disabled={!password}>
              غیرفعال کن
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="warning">با غیرفعال کردن این قابلیت، امنیت حساب شما کاهش پیدا می‌کند.</Alert>
          <Field label="برای تایید، رمز عبور خود را وارد کنید" required>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="ltr"
              dir="ltr"
              autoFocus
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
