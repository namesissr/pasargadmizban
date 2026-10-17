'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Send, UserPlus } from 'lucide-react';
import { Alert, Badge, Button, Card, Field, Input, LoadingBlock, Select } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiPatch, apiPost, errorFields, errorMessage, fetcher } from '@/lib/client';
import { formatNumber } from '@/lib/money';
import { faRelative } from '@/lib/utils';
import { Avatar } from './ui';
import { personName } from './types';

type Member = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  telegram: boolean;
  sms: 'on' | 'off' | 'none';
  openTasks: number;
};

type Response = {
  me: { id: string; role: string };
  tasksOnly: boolean;
  canEdit: boolean;
  smsConfigured: boolean;
  items: Member[];
};

const ROLE_OPTIONS = [
  { id: 'USER', label: 'بدون دسترسی' },
  { id: 'EMPLOYER', label: 'کارفرما' },
  { id: 'DEVELOPER', label: 'برنامه‌نویس' },
  { id: 'SUPPORT', label: 'پشتیبان' },
];

const ROLE_LABEL: Record<string, string> = { ADMIN: 'مدیر (کارفرما)', EMPLOYER: 'کارفرما', DEVELOPER: 'برنامه‌نویس', SUPPORT: 'پشتیبان', USER: 'منتظر تعیین نقش' };

/** اعضای تیم: تعیین نقش کارفرما و برنامه‌نویس و غیرفعال کردن کسی که از تیم رفته */
export function Members() {
  const { data, mutate } = useSWR<Response>('/api/tasks/members', fetcher);
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('DEVELOPER');
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!data) return <LoadingBlock />;

  async function update(id: string, body: Record<string, unknown>, okMsg: string) {
    setBusy(id);
    try {
      await apiPatch(`/api/tasks/members/${id}`, body);
      toast.success(okMsg);
      await mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function add() {
    setBusy('add');
    setErrors({});
    try {
      await apiPost('/api/tasks/members', { email, role });
      toast.success('عضو اضافه شد و به او اطلاع داده شد.');
      setEmail('');
      await mutate();
    } catch (err) {
      setErrors(errorFields(err));
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const pending = data.items.filter((m) => m.role === 'USER');
  const team = data.items.filter((m) => m.role !== 'USER');
  const signup = typeof window !== 'undefined' ? `${window.location.origin}/register` : '/register';

  const row = (m: Member) => (
    <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Avatar person={m} size={34} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {personName(m)}
          {m.id === data.me.id ? <span className="text-[11px] font-normal muted">(خودتان)</span> : null}
          {m.status === 'SUSPENDED' ? <Badge tone="bad">غیرفعال</Badge> : null}
          {m.telegram ? <Badge tone="ok">تلگرام وصل</Badge> : <Badge tone="muted">تلگرام وصل نیست</Badge>}
          {data.smsConfigured ? (
            m.sms === 'on' ? (
              <Badge tone="ok">پیامک فعال</Badge>
            ) : m.sms === 'off' ? (
              <Badge tone="muted">پیامک خاموش</Badge>
            ) : (
              <Badge tone="warn">شماره موبایل ندارد</Badge>
            )
          ) : null}
        </div>
        <div className="ltr mt-0.5 text-right text-[11px] muted">{m.email}</div>
        <div className="mt-0.5 text-[11px] muted">
          {m.lastLoginAt ? `آخرین ورود ${faRelative(m.lastLoginAt)}` : `ثبت‌نام ${faRelative(m.createdAt)}`}
          {m.openTasks ? ` · ${formatNumber(m.openTasks)} کار باز` : ''}
        </div>
      </div>
      {data.canEdit && m.role !== 'ADMIN' && m.id !== data.me.id ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-40">
            <Select
              value={m.role}
              disabled={busy === m.id}
              onChange={(e) => update(m.id, { role: e.target.value }, 'نقش تغییر کرد.')}
              className="py-1.5 text-xs"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
          <Button
            size="sm"
            variant={m.status === 'SUSPENDED' ? 'secondary' : 'ghost'}
            loading={busy === m.id}
            onClick={() =>
              update(m.id, { active: m.status === 'SUSPENDED' }, m.status === 'SUSPENDED' ? 'حساب فعال شد.' : 'حساب غیرفعال و از همه دستگاه‌ها خارج شد.')
            }
          >
            {m.status === 'SUSPENDED' ? 'فعال کردن' : 'غیرفعال کردن'}
          </Button>
        </div>
      ) : (
        <Badge tone={m.role === 'USER' ? 'warn' : 'muted'}>{ROLE_LABEL[m.role] ?? m.role}</Badge>
      )}
    </li>
  );

  return (
    <div className="space-y-5">
      {!data.canEdit ? (
        <Alert tone="info">فقط مدیر سایت (نخستین حساب ثبت‌شده) می‌تواند نقش اعضا را تغییر دهد.</Alert>
      ) : null}

      <Card title="دعوت عضو تازه" description="کارفرمای دوم یا برنامه‌نویس جدید اول با این پیوند ثبت‌نام می‌کند، بعد اینجا نقشش را تعیین کنید.">
        <div className="flex flex-wrap items-center gap-2 rounded-lg p-3 text-xs surface-2">
          <Send size={14} className="muted" />
          پیوند ثبت‌نام: <code className="ltr mono select-all">{signup}</code>
        </div>
        {data.canEdit && !data.tasksOnly ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
            <Field label="ایمیل کسی که ثبت‌نام کرده" error={errors.email}>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} className="ltr text-left" placeholder="name@example.com" />
            </Field>
            <Field label="نقش">
              <Select value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLE_OPTIONS.filter((r) => r.id !== 'USER').map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button onClick={add} loading={busy === 'add'} disabled={!email} icon={<UserPlus size={15} />}>
              افزودن
            </Button>
          </div>
        ) : null}
      </Card>

      {pending.length ? (
        <Card title={`منتظر تعیین نقش (${formatNumber(pending.length)})`} bodyClassName="p-0">
          <ul className="divide-y">{pending.map(row)}</ul>
        </Card>
      ) : null}

      <Card title={`اعضای تیم (${formatNumber(team.length)})`} bodyClassName="p-0">
        <ul className="divide-y">{team.map(row)}</ul>
      </Card>

      <p className="text-[11px] leading-6 muted">
        «کارفرما» تسک تعریف و تأیید می‌کند و پنل کارفرما را می‌بیند. «برنامه‌نویس» فقط پنل برنامه‌نویس را می‌بیند. «پشتیبان» می‌تواند تسک ثبت و
        نظر بدهد. غیرفعال کردن، حساب را از همه دستگاه‌ها خارج می‌کند؛ تسک‌های بازش سر جایشان می‌مانند تا به نفر دیگری بسپارید.
      </p>
    </div>
  );
}
