'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  Cloud,
  Plus,
  RefreshCw,
  Trash2,
  Pencil,
  ServerCog,
  ShieldAlert,
  CheckCircle2,
  PlugZap,
  Layers,
  ArrowUpDown,
} from 'lucide-react';
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
  Stat,
  Textarea,
  Toggle,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiDelete, apiPatch, apiPost, apiPut, errorMessage, fetcher } from '@/lib/client';
import { cn, faRelative } from '@/lib/utils';

type Account = {
  id: string;
  name: string;
  tokenHint: string;
  enabled: boolean;
  priority: number;
  maxServers: number;
  status: 'UNKNOWN' | 'OK' | 'LIMIT_REACHED' | 'ERROR' | 'DISABLED';
  serverCount: number;
  panelCount: number;
  activeServers: number;
  rateRemaining: number | null;
  lastCheckedAt: string | null;
  lastUsedAt: string | null;
  lastError: string | null;
  note: string | null;
  freeSlots: number;
  usagePercent: number;
  createdAt: string;
};

type Overview = {
  accounts: Account[];
  unassignedServers: number;
  totals: {
    accounts: number;
    enabled: number;
    totalSlots: number;
    usedSlots: number;
    freeSlots: number;
    usagePercent: number;
  };
};

const STATUS: Record<Account['status'], { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }> = {
  OK: { label: 'سالم', tone: 'ok' },
  LIMIT_REACHED: { label: 'ظرفیت تکمیل', tone: 'warn' },
  ERROR: { label: 'خطا', tone: 'bad' },
  DISABLED: { label: 'غیرفعال', tone: 'muted' },
  UNKNOWN: { label: 'بررسی‌نشده', tone: 'muted' },
};

const fa = (n: number) => new Intl.NumberFormat('fa-IR').format(n);

export function HetznerAccountsClient() {
  const toast = useToast();
  const { data, error, isLoading, mutate } = useSWR<Overview>('/api/admin/hetzner', fetcher, {
    refreshInterval: 120_000,
  });

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [removing, setRemoving] = useState<Account | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [refreshingAll, setRefreshingAll] = useState(false);

  async function refreshAll() {
    if (!data?.accounts.length) return;
    setRefreshingAll(true);
    try {
      await Promise.all(data.accounts.map((a) => apiPost(`/api/admin/hetzner/${a.id}`).catch(() => null)));
      await mutate();
      toast.success('ظرفیت همه حساب‌ها از هتزنر خوانده شد.');
    } finally {
      setRefreshingAll(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setRemoveBusy(true);
    try {
      const res = await apiDelete<{ message: string }>(`/api/admin/hetzner/${removing.id}`);
      toast.success(res.message);
      setRemoving(null);
      mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRemoveBusy(false);
    }
  }

  if (isLoading) return <LoadingBlock label="در حال خواندن حساب‌ها…" />;
  if (error) return <Alert tone="error" title="خطا در بارگذاری">{errorMessage(error)}</Alert>;

  const totals = data?.totals;
  const accounts = data?.accounts ?? [];

  return (
    <div className="space-y-4">
      {/* ── خلاصه ظرفیت ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="حساب‌های فعال"
          value={`${fa(totals?.enabled ?? 0)} از ${fa(totals?.accounts ?? 0)}`}
          icon={<Cloud size={15} />}
        />
        <Stat label="کل ظرفیت" value={fa(totals?.totalSlots ?? 0)} hint="مجموع سقف ساخت سرور" icon={<Layers size={15} />} />
        <Stat
          label="ظرفیت آزاد"
          value={fa(totals?.freeSlots ?? 0)}
          tone={(totals?.freeSlots ?? 0) === 0 ? 'bad' : (totals?.freeSlots ?? 0) < 5 ? 'warn' : 'ok'}
          hint="تعداد سروری که هنوز می‌توان ساخت"
          icon={<ServerCog size={15} />}
        />
        <Stat
          label="درصد اشغال"
          value={`${fa(totals?.usagePercent ?? 0)}٪`}
          tone={(totals?.usagePercent ?? 0) >= 90 ? 'bad' : (totals?.usagePercent ?? 0) >= 70 ? 'warn' : 'ok'}
          hint={`${fa(totals?.usedSlots ?? 0)} سرور ساخته شده`}
        />
      </div>

      {(totals?.freeSlots ?? 0) === 0 && (totals?.accounts ?? 0) > 0 ? (
        <Alert tone="error" title="ظرفیت ساخت سرور تمام شده است">
          تا وقتی حساب تازه‌ای اضافه نکنید یا سقف حساب‌های موجود را بالا نبرید، کاربران نمی‌توانند سرور جدید بسازند.
        </Alert>
      ) : (totals?.usagePercent ?? 0) >= 80 && (totals?.accounts ?? 0) > 0 ? (
        <Alert tone="warning" title="ظرفیت رو به اتمام است">
          تنها {fa(totals?.freeSlots ?? 0)} جای خالی باقی مانده. بهتر است همین حالا حساب هتزنر تازه‌ای اضافه کنید.
        </Alert>
      ) : null}

      {data?.unassignedServers ? (
        <Alert tone="info" title="سرورهای بدون حساب">
          {fa(data.unassignedServers)} سرور در پنل به هیچ حسابی نسبت داده نشده‌اند. اینها سرورهایی هستند که پیش از
          فعال شدن حالت چندحسابی ساخته شده‌اند و روی نخستین حساب فعال مدیریت می‌شوند.
        </Alert>
      ) : null}

      {/* ── فهرست حساب‌ها ── */}
      <Card
        title="حساب‌های Hetzner Cloud"
        description="ترتیب استفاده بر اساس «اولویت» است؛ عدد کوچک‌تر یعنی زودتر امتحان می‌شود."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={14} className={refreshingAll ? 'spin' : ''} />}
              onClick={refreshAll}
              disabled={refreshingAll || accounts.length === 0}
            >
              به‌روزرسانی ظرفیت
            </Button>
            <Button size="sm" icon={<Plus size={14} />} onClick={() => setAddOpen(true)}>
              افزودن حساب
            </Button>
          </div>
        }
        bodyClassName={accounts.length ? 'space-y-3' : undefined}
      >
        {accounts.length === 0 ? (
          <EmptyState
            icon={<Cloud size={28} />}
            title="هنوز حسابی اضافه نکرده‌اید"
            description="برای ساخت سرور، دست‌کم یک توکن API از پروژه Hetzner Cloud خود اضافه کنید. توکن باید دسترسی Read & Write داشته باشد."
            action={
              <Button icon={<Plus size={15} />} onClick={() => setAddOpen(true)}>
                افزودن نخستین حساب
              </Button>
            }
          />
        ) : (
          accounts.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              onChanged={mutate}
              onEdit={() => setEditing(account)}
              onRemove={() => setRemoving(account)}
            />
          ))
        )}
      </Card>

      <Card title="راهنمای ساخت توکن" bodyClassName="text-xs leading-7 muted space-y-1.5">
        <p>۱. وارد کنسول هتزنر شوید و پروژه مورد نظر را باز کنید.</p>
        <p>۲. از منوی Security به بخش API tokens بروید و روی Generate API token بزنید.</p>
        <p>۳. دسترسی را روی Read &amp; Write بگذارید؛ با توکن فقط‌خواندنی ساخت سرور ممکن نیست.</p>
        <p>۴. توکن فقط یک بار نمایش داده می‌شود. آن را کپی کنید و همین‌جا ثبت کنید.</p>
        <p className="pt-1">
          هر پروژه هتزنر سقف مستقل خودش را دارد. برای بالا بردن سقف می‌توانید از پشتیبانی هتزنر درخواست افزایش
          بدهید یا پروژه و حساب تازه بسازید و اینجا اضافه کنید.
        </p>
      </Card>

      <AccountFormModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          setAddOpen(false);
          mutate();
        }}
      />
      <AccountFormModal
        key={editing?.id ?? 'edit'}
        open={!!editing}
        account={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          mutate();
        }}
      />

      <ConfirmModal
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        loading={removeBusy}
        title={`حذف حساب «${removing?.name ?? ''}»`}
        message={
          <>
            توکن این حساب از پنل پاک می‌شود. سرورهای ساخته‌شده روی این حساب در هتزنر باقی می‌مانند اما پنل دیگر
            نمی‌تواند آنها را مدیریت کند. اگر سرور فعالی روی این حساب هست، ابتدا آن را منتقل یا حذف کنید.
          </>
        }
        confirmLabel="حذف حساب"
      />
    </div>
  );
}

function AccountRow({
  account,
  onChanged,
  onEdit,
  onRemove,
}: {
  account: Account;
  onChanged: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const status = STATUS[account.status] ?? STATUS.UNKNOWN;
  const used = Math.max(account.serverCount, account.panelCount);
  const percent = Math.min(100, account.usagePercent);

  const barTone =
    percent >= 100 ? 'bg-red-500' : percent >= 80 ? 'bg-amber-500' : 'bg-[var(--color-brand-500)]';

  async function refresh() {
    setBusy(true);
    try {
      const res = await apiPost<{ message: string }>(`/api/admin/hetzner/${account.id}`);
      toast.success(res.message);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(enabled: boolean) {
    setBusy(true);
    try {
      await apiPatch(`/api/admin/hetzner/${account.id}`, { enabled });
      toast.success(enabled ? 'حساب فعال شد.' : 'حساب غیرفعال شد و دیگر سرور تازه روی آن ساخته نمی‌شود.');
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn('rounded-xl border p-3.5 sm:p-4', !account.enabled && 'opacity-70')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold">{account.name}</span>
            <Badge tone={status.tone}>{status.label}</Badge>
            <span className="badge badge-muted tabular">اولویت {fa(account.priority)}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] muted">
            <span className="mono ltr">…{account.tokenHint}</span>
            <span>
              بررسی: {account.lastCheckedAt ? faRelative(account.lastCheckedAt) : 'هرگز'}
            </span>
            {account.lastUsedAt ? <span>آخرین ساخت: {faRelative(account.lastUsedAt)}</span> : null}
            {account.rateRemaining !== null ? (
              <span className="tabular">سهمیه API: {fa(account.rateRemaining)}</span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw size={14} className={busy ? 'spin' : ''} />}
            onClick={refresh}
            disabled={busy}
            aria-label="به‌روزرسانی"
          >
            <span className="hidden sm:inline">بررسی</span>
          </Button>
          <Button variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={onEdit} aria-label="ویرایش">
            <span className="hidden sm:inline">ویرایش</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 size={14} />}
            onClick={onRemove}
            className="hover:text-red-500"
            aria-label="حذف"
          />
        </div>
      </div>

      {/* نوار ظرفیت */}
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="muted">ظرفیت مصرف‌شده</span>
          <span className="tabular font-semibold">
            {fa(used)} از {fa(account.maxServers)}
            <span className="mr-1.5 muted">({fa(percent)}٪)</span>
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full surface-2">
          <div className={cn('h-full rounded-full transition-all', barTone)} style={{ width: `${percent}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] muted">
          <span className="tabular">در هتزنر: {fa(account.serverCount)}</span>
          <span className="tabular">در پنل: {fa(account.activeServers)}</span>
          <span className={cn('tabular', account.freeSlots === 0 && 'font-semibold text-red-500')}>
            جای خالی: {fa(account.freeSlots)}
          </span>
        </div>
      </div>

      {account.lastError ? (
        <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-red-500/8 px-3 py-2 text-[11px] leading-6 text-red-600">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" />
          {account.lastError}
        </p>
      ) : null}

      {account.note ? <p className="mt-2 text-[11px] leading-6 muted">{account.note}</p> : null}

      <div className="mt-3 border-t pt-3">
        <Toggle
          checked={account.enabled}
          disabled={busy}
          onChange={toggleEnabled}
          label="استفاده برای ساخت سرور جدید"
          description="با خاموش کردن این کلید، سرورهای فعلی دست‌نخورده می‌مانند اما سرور تازه‌ای روی این حساب ساخته نمی‌شود."
        />
      </div>
    </div>
  );
}

function AccountFormModal({
  open,
  account,
  onClose,
  onSaved,
}: {
  open: boolean;
  account?: Account;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const editMode = !!account;

  const [name, setName] = useState(account?.name ?? '');
  const [token, setToken] = useState('');
  const [maxServers, setMaxServers] = useState(String(account?.maxServers ?? 10));
  const [priority, setPriority] = useState(String(account?.priority ?? 0));
  const [note, setNote] = useState(account?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function test() {
    if (token.trim().length < 20) {
      setTestResult({ ok: false, message: 'توکن را کامل وارد کنید.' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiPut<{ ok: boolean; message: string }>('/api/admin/hetzner', { token: token.trim() });
      setTestResult(res);
    } catch (err) {
      setTestResult({ ok: false, message: errorMessage(err) });
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      if (editMode) {
        const res = await apiPatch<{ message: string }>(`/api/admin/hetzner/${account.id}`, {
          name: name.trim(),
          token: token.trim() || undefined,
          maxServers: Number(maxServers),
          priority: Number(priority),
          note: note.trim(),
        });
        toast.success(res.message);
      } else {
        const res = await apiPost<{ message: string }>('/api/admin/hetzner', {
          name: name.trim(),
          token: token.trim(),
          maxServers: Number(maxServers),
          priority: Number(priority),
          note: note.trim(),
        });
        toast.success(res.message);
      }
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const canSave = name.trim().length >= 2 && (editMode || token.trim().length >= 20);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editMode ? `ویرایش حساب «${account.name}»` : 'افزودن حساب هتزنر'}
      description={
        editMode
          ? 'اگر فیلد توکن را خالی بگذارید، توکن فعلی دست‌نخورده می‌ماند.'
          : 'توکن API با رمزنگاری AES-256 ذخیره می‌شود و پس از ثبت دیگر قابل نمایش نیست.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            انصراف
          </Button>
          <Button onClick={save} loading={busy} disabled={!canSave}>
            {editMode ? 'ذخیره تغییرات' : 'افزودن حساب'}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="نام حساب" required hint="یک نام دلخواه برای شناسایی، مثلاً «هتزنر اصلی» یا «پروژه دوم».">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="هتزنر اصلی" maxLength={60} />
        </Field>

        <Field
          label={editMode ? 'توکن جدید (اختیاری)' : 'توکن API'}
          required={!editMode}
          hint={editMode ? `توکن فعلی: …${account.tokenHint}` : 'توکن Read & Write از بخش Security پروژه هتزنر.'}
        >
          <div className="flex gap-2">
            <Input
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setTestResult(null);
              }}
              placeholder={editMode ? 'برای تغییر، توکن تازه را بچسبانید' : 'توکن ۶۴ کاراکتری هتزنر'}
              className="ltr mono"
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              variant="secondary"
              onClick={test}
              loading={testing}
              disabled={token.trim().length < 20}
              icon={<PlugZap size={15} />}
            >
              آزمایش
            </Button>
          </div>
        </Field>

        {testResult ? (
          <Alert tone={testResult.ok ? 'success' : 'error'}>
            <span className="flex items-start gap-1.5">
              {testResult.ok ? (
                <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
              ) : (
                <ShieldAlert size={14} className="mt-0.5 shrink-0" />
              )}
              {testResult.message}
            </span>
          </Alert>
        ) : null}

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field
            label="سقف تعداد سرور"
            hint="سقف پروژه هتزنر. پیش‌فرض حساب‌های تازه ۱۰ است."
          >
            <Input
              type="number"
              min={1}
              max={1000}
              value={maxServers}
              onChange={(e) => setMaxServers(e.target.value)}
              className="tabular"
            />
          </Field>
          <Field label="اولویت" hint="عدد کوچک‌تر زودتر امتحان می‌شود.">
            <div className="relative">
              <Input
                type="number"
                min={0}
                max={1000}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="tabular"
              />
              <ArrowUpDown size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 muted" />
            </div>
          </Field>
        </div>

        <Field label="یادداشت" hint="اختیاری — مثلاً ایمیل حساب یا نام پروژه در کنسول هتزنر.">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} />
        </Field>
      </div>
    </Modal>
  );
}
