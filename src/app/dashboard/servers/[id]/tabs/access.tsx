'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Terminal, KeyRound, LifeBuoy, ShieldAlert, Monitor } from 'lucide-react';
import { Alert, Button, CopyButton, Field, Input, Modal, SecretValue } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiPost, errorMessage } from '@/lib/client';
import type { ServerData } from '../detail';

export function AccessTab({
  server,
  onAction,
  busy,
}: {
  server: ServerData;
  onAction: (action: string, confirmMessage?: string) => void;
  busy: string | null;
}) {
  const toast = useToast();
  const [console_, setConsole] = useState<{ wssUrl: string; password: string } | null>(null);
  const [consoleLoading, setConsoleLoading] = useState(false);
  const [rdnsOpen, setRdnsOpen] = useState(false);

  async function openConsole() {
    setConsoleLoading(true);
    try {
      const res = await apiPost<{ wssUrl: string; password: string }>(`/api/servers/${server.id}/console`);
      setConsole(res);
    } catch (err) {
      toast.error('کنسول باز نشد', errorMessage(err));
    } finally {
      setConsoleLoading(false);
    }
  }

  const sshCommand = server.ipv4 ? `ssh root@${server.ipv4}` : '';

  return (
    <div className="space-y-6">
      {/* اتصال SSH */}
      <section>
        <h3 className="mb-1 text-xs font-bold">اتصال از راه دور (SSH)</h3>
        <p className="mb-3 text-[11px] leading-6 muted">
          از ترمینال لینوکس/مک یا PowerShell ویندوز دستور زیر را اجرا کنید.
        </p>
        <div className="flex items-center gap-2">
          <code className="mono ltr flex-1 overflow-x-auto whitespace-nowrap rounded-xl px-3 py-2.5 text-xs surface-2">
            {sshCommand || 'آدرس IP هنوز اختصاص نیافته است'}
          </code>
          {sshCommand ? <CopyButton value={sshCommand} label="کپی" /> : null}
        </div>

        {server.sshKeys.length > 0 ? (
          <div className="mt-3 rounded-xl p-3 text-xs surface-2">
            <div className="font-semibold">کلیدهای SSH نصب‌شده</div>
            <ul className="mt-2 space-y-1.5">
              {server.sshKeys.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-2">
                  <span>{k.name}</span>
                  <span className="mono ltr truncate text-[10px] muted">{k.fingerprint}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-3 text-[11px] leading-6 muted">
            کلید SSH روی این سرور نصب نشده است؛ ورود با رمز عبور روت انجام می‌شود.{' '}
            <Link href="/dashboard/ssh-keys" className="font-semibold text-[var(--color-brand-600)] hover:underline">
              افزودن کلید SSH
            </Link>
          </p>
        )}
      </section>

      {/* کنسول وب */}
      <section className="border-t pt-5">
        <h3 className="mb-1 text-xs font-bold">کنسول تحت وب (VNC)</h3>
        <p className="mb-3 text-[11px] leading-6 muted">
          اگر به هر دلیل به سرور دسترسی SSH ندارید، می‌توانید از کنسول گرافیکی استفاده کنید. این کنسول مستقیماً به
          صفحه‌نمایش مجازی سرور متصل می‌شود.
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={openConsole}
          loading={consoleLoading}
          icon={<Monitor size={14} />}
          disabled={server.status !== 'RUNNING' && server.status !== 'OFF'}
        >
          دریافت لینک کنسول
        </Button>

        {console_ ? (
          <div className="mt-4 space-y-3 rounded-xl border p-4">
            <Alert tone="warning" title="این اطلاعات یک‌بارمصرف است">
              رمز کنسول فقط چند دقیقه اعتبار دارد. برای اتصال به یک کلاینت noVNC نیاز دارید.
            </Alert>
            <Field label="آدرس WebSocket">
              <div className="flex items-center gap-1.5">
                <code className="mono ltr flex-1 truncate rounded-lg px-2 py-1.5 text-[11px] surface-2">
                  {console_.wssUrl}
                </code>
                <CopyButton value={console_.wssUrl} />
              </div>
            </Field>
            <Field label="رمز عبور کنسول">
              <SecretValue value={console_.password} />
            </Field>
          </div>
        ) : null}
      </section>

      {/* رمز روت */}
      <section className="border-t pt-5">
        <h3 className="mb-1 text-xs font-bold">رمز عبور کاربر روت</h3>
        <p className="mb-3 text-[11px] leading-6 muted">
          با بازنشانی رمز، سرور یک بار راه‌اندازی مجدد می‌شود و رمز جدید نمایش داده می‌شود.
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onAction('reset_password', 'رمز روت بازنشانی شود؟ سرور یک بار ریست خواهد شد.')}
          loading={busy === 'reset_password'}
          icon={<KeyRound size={14} />}
          disabled={server.status === 'SUSPENDED' || server.status === 'PROVISIONING'}
        >
          بازنشانی رمز روت
        </Button>
      </section>

      {/* حالت نجات */}
      <section className="border-t pt-5">
        <h3 className="mb-1 text-xs font-bold">حالت نجات (Rescue)</h3>
        <p className="mb-3 text-[11px] leading-6 muted">
          سیستم‌عامل موقتی لینوکس که از شبکه بوت می‌شود. برای تعمیر سیستم‌عاملی که بالا نمی‌آید یا بازیابی داده مفید
          است. پس از فعال‌سازی باید سرور را ریست کنید.
        </p>
        <div className="flex flex-wrap gap-2">
          {server.rescueMode ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onAction('disable_rescue')}
              loading={busy === 'disable_rescue'}
              icon={<ShieldAlert size={14} />}
            >
              غیرفعال کردن حالت نجات
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onAction('enable_rescue', 'حالت نجات فعال شود؟ پس از فعال‌سازی باید سرور را ریست کنید.')}
              loading={busy === 'enable_rescue'}
              icon={<ShieldAlert size={14} />}
              disabled={server.status === 'SUSPENDED'}
            >
              فعال کردن حالت نجات
            </Button>
          )}
          {server.rescueMode ? (
            <Button variant="secondary" size="sm" onClick={() => onAction('reset')} loading={busy === 'reset'}>
              ریست برای ورود به حالت نجات
            </Button>
          ) : null}
        </div>
      </section>

      {/* rDNS */}
      <section className="border-t pt-5">
        <h3 className="mb-1 text-xs font-bold">رکورد معکوس (rDNS)</h3>
        <p className="mb-3 text-[11px] leading-6 muted">
          اگر روی این سرور سرویس ایمیل راه‌اندازی می‌کنید، تنظیم rDNS برای جلوگیری از اسپم شدن ایمیل‌ها ضروری است.
        </p>
        <Button variant="secondary" size="sm" onClick={() => setRdnsOpen(true)} icon={<Terminal size={14} />}>
          تنظیم rDNS
        </Button>
        <RdnsModal open={rdnsOpen} onClose={() => setRdnsOpen(false)} server={server} />
      </section>

      <section className="border-t pt-5">
        <div className="rounded-xl p-4 text-xs leading-7 surface-2">
          <div className="flex items-center gap-1.5 font-semibold">
            <LifeBuoy size={14} /> به کمک نیاز دارید؟
          </div>
          <p className="mt-1.5 muted">
            اگر در اتصال به سرور مشکل دارید، ابتدا فایروال سرور و قوانین فایروال ابری را بررسی کنید. در صورت نیاز{' '}
            <Link
              href={`/dashboard/tickets/new?serverId=${server.id}`}
              className="font-semibold text-[var(--color-brand-600)] hover:underline"
            >
              تیکت پشتیبانی
            </Link>{' '}
            ثبت کنید.
          </p>
        </div>
      </section>
    </div>
  );
}

function RdnsModal({ open, onClose, server }: { open: boolean; onClose: () => void; server: ServerData }) {
  const toast = useToast();
  const [ip, setIp] = useState(server.ipv4 ?? '');
  const [ptr, setPtr] = useState('');
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);
    try {
      const res = await apiPost<{ message: string }>(`/api/servers/${server.id}/rdns`, {
        ip,
        dnsPtr: ptr || null,
      });
      toast.success(res.message);
      onClose();
    } catch (err) {
      toast.error('ثبت rDNS انجام نشد', errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="تنظیم رکورد معکوس"
      description="نام دامنه‌ای که این IP باید به آن اشاره کند."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            انصراف
          </Button>
          <Button onClick={save} loading={loading}>
            ذخیره
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="آدرس IP">
          <select className="input cursor-pointer ltr" value={ip} onChange={(e) => setIp(e.target.value)}>
            {server.ipv4 ? <option value={server.ipv4}>{server.ipv4}</option> : null}
            {server.ipv6 ? <option value={server.ipv6}>{server.ipv6}</option> : null}
          </select>
        </Field>
        <Field
          label="نام دامنه (PTR)"
          hint="برای حذف رکورد، این فیلد را خالی بگذارید. اعمال تغییرات ممکن است چند ساعت طول بکشد."
        >
          <Input
            value={ptr}
            onChange={(e) => setPtr(e.target.value)}
            placeholder="mail.example.com"
            className="ltr mono"
            dir="ltr"
          />
        </Field>
      </div>
    </Modal>
  );
}
