'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Save, Wallet, LogIn, Server as ServerIcon, Plus, Minus } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Select,
  Stat,
  Textarea,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/app/shell';
import { api, apiPost, errorMessage, fetcher } from '@/lib/client';
import { formatToman, formatNumber } from '@/lib/money';
import {
  faDate,
  faDateTime,
  ROLE_FA,
  SERVER_STATUS_FA,
  TICKET_STATUS_FA,
  TX_STATUS_FA,
  TX_TYPE_FA,
  USER_STATUS_FA,
  cn,
} from '@/lib/utils';

type UserDetailData = {
  id: string;
  email: string;
  emailVerifiedAt: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  nationalId: string | null;
  address: string | null;
  role: string;
  status: string;
  balance: number;
  creditLimit: number;
  discountPct: number;
  maxServers: number;
  notes: string | null;
  referralCode: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  servers: {
    id: string;
    name: string;
    status: string;
    serverTypeName: string;
    locationName: string;
    ipv4: string | null;
    billingCycle: string;
    priceMonthly: number;
    expiresAt: string | null;
  }[];
  transactions: {
    id: string;
    ref: string;
    type: string;
    direction: string;
    amount: number;
    status: string;
    description: string | null;
    createdAt: string;
  }[];
  tickets: { id: string; number: number; subject: string; status: string; lastReplyAt: string }[];
  _count: { servers: number; tickets: number; transactions: number; referrals: number };
};

export function UserDetail({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const { data: user, isLoading, mutate } = useSWR<UserDetailData>(`/api/admin/users/${userId}`, fetcher);

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    role?: string;
    status?: string;
    discountPct?: number;
    maxServers?: number;
    creditLimit?: number;
    notes?: string;
  }>({});

  const [balanceOpen, setBalanceOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [direction, setDirection] = useState<'add' | 'sub'>('add');
  const [balanceBusy, setBalanceBusy] = useState(false);

  if (isLoading && !user) return <LoadingBlock />;
  if (!user) return <Alert tone="error">کاربر یافت نشد.</Alert>;

  const current = {
    role: form.role ?? user.role,
    status: form.status ?? user.status,
    discountPct: form.discountPct ?? user.discountPct,
    maxServers: form.maxServers ?? user.maxServers,
    creditLimit: form.creditLimit ?? user.creditLimit,
    notes: form.notes ?? user.notes ?? '',
  };
  const dirty = Object.keys(form).length > 0;

  async function save() {
    setSaving(true);
    try {
      const res = await api<{ message: string }>(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: current,
      });
      toast.success(res.message);
      setForm({});
      mutate();
    } catch (err) {
      toast.error('ذخیره انجام نشد', errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function adjustBalance() {
    const value = Number(amount.replace(/[^\d]/g, ''));
    if (!value) return;
    setBalanceBusy(true);
    try {
      const res = await apiPost<{ message: string; balance: number }>(`/api/admin/users/${userId}/balance`, {
        amount: direction === 'add' ? value : -value,
        description: reason,
      });
      toast.success(res.message, `موجودی جدید: ${formatToman(res.balance)}`);
      setBalanceOpen(false);
      setAmount('');
      setReason('');
      mutate();
    } catch (err) {
      toast.error('تعدیل موجودی انجام نشد', errorMessage(err));
    } finally {
      setBalanceBusy(false);
    }
  }

  async function impersonate() {
    if (!window.confirm('به حساب این کاربر وارد می‌شوید. برای بازگشت باید دوباره وارد حساب خودتان شوید. ادامه؟')) return;
    try {
      const res = await apiPost<{ redirect: string; message: string }>(
        `/api/admin/users/${userId}/impersonate`,
      );
      toast.info(res.message);
      router.push(res.redirect);
    } catch (err) {
      toast.error('ورود به حساب کاربر ممکن نشد', errorMessage(err));
    }
  }

  const st = USER_STATUS_FA[user.status] ?? { label: user.status, tone: 'muted' as const };
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

  return (
    <>
      <PageHeader
        title={name}
        description={user.email}
        breadcrumb={[
          { href: '/admin', label: 'پنل مدیریت' },
          { href: '/admin/users', label: 'کاربران' },
        ]}
        action={
          <>
            <Badge tone={st.tone}>{st.label}</Badge>
            {isAdmin ? (
              <>
                <Button variant="secondary" size="sm" onClick={() => setBalanceOpen(true)} icon={<Wallet size={14} />}>
                  تعدیل موجودی
                </Button>
                <Button variant="ghost" size="sm" onClick={impersonate} icon={<LogIn size={14} />}>
                  ورود به حساب
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label="موجودی کیف پول" value={formatToman(user.balance)} tone={user.balance < 0 ? 'bad' : 'ok'} />
          <Stat label="سرورهای فعال" value={formatNumber(user.servers.length)} hint={`از ${formatNumber(user.maxServers)} مجاز`} />
          <Stat label="تیکت‌ها" value={formatNumber(user._count.tickets)} />
          <Stat label="تراکنش‌ها" value={formatNumber(user._count.transactions)} />
        </div>

        <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
          {/* تنظیمات حساب */}
          <Card title="تنظیمات حساب" className="lg:col-span-1">
            <div className="space-y-4">
              <Field label="نقش">
                <Select
                  value={current.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  disabled={!isAdmin}
                >
                  {Object.entries(ROLE_FA).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="وضعیت">
                <Select
                  value={current.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  disabled={!isAdmin}
                >
                  {Object.entries(USER_STATUS_FA).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="تخفیف اختصاصی (درصد)" hint="روی تمام قیمت‌های این کاربر اعمال می‌شود.">
                <Input
                  type="number"
                  min={0}
                  max={90}
                  value={current.discountPct}
                  onChange={(e) => setForm((f) => ({ ...f, discountPct: Number(e.target.value) }))}
                  className="ltr tabular"
                  dir="ltr"
                  disabled={!isAdmin}
                />
              </Field>

              <Field label="حداکثر تعداد سرور">
                <Input
                  type="number"
                  min={0}
                  value={current.maxServers}
                  onChange={(e) => setForm((f) => ({ ...f, maxServers: Number(e.target.value) }))}
                  className="ltr tabular"
                  dir="ltr"
                  disabled={!isAdmin}
                />
              </Field>

              <Field label="سقف اعتبار منفی (تومان)" hint="اجازه می‌دهد موجودی کاربر تا این مبلغ منفی شود.">
                <Input
                  type="number"
                  min={0}
                  value={current.creditLimit}
                  onChange={(e) => setForm((f) => ({ ...f, creditLimit: Number(e.target.value) }))}
                  className="ltr tabular"
                  dir="ltr"
                  disabled={!isAdmin}
                />
              </Field>

              <Field label="یادداشت داخلی" hint="فقط برای کارکنان قابل مشاهده است.">
                <Textarea
                  value={current.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="min-h-20 text-xs"
                  disabled={!isAdmin}
                />
              </Field>

              {isAdmin ? (
                <Button onClick={save} loading={saving} disabled={!dirty} icon={<Save size={15} />} className="w-full">
                  ذخیره تغییرات
                </Button>
              ) : (
                <Alert tone="info">فقط مدیر کل می‌تواند این تنظیمات را تغییر دهد.</Alert>
              )}
            </div>
          </Card>

          <div className="space-y-5 lg:col-span-2">
            {/* مشخصات */}
            <Card title="مشخصات">
              <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
                <Row label="ایمیل" value={user.email} ltr />
                <Row label="تایید ایمیل" value={user.emailVerifiedAt ? faDate(user.emailVerifiedAt) : 'تایید نشده'} />
                <Row label="موبایل" value={user.phone ?? '—'} ltr />
                <Row label="کد ملی" value={user.nationalId ?? '—'} ltr />
                <Row label="شرکت" value={user.company ?? '—'} />
                <Row label="کد معرف" value={user.referralCode ?? '—'} ltr />
                <Row label="تاریخ عضویت" value={faDateTime(user.createdAt)} />
                <Row label="آخرین ورود" value={user.lastLoginAt ? faDateTime(user.lastLoginAt) : '—'} />
                <Row label="آخرین IP" value={user.lastLoginIp ?? '—'} ltr />
                <Row label="زیرمجموعه‌ها" value={formatNumber(user._count.referrals)} />
                {user.address ? <Row label="نشانی" value={user.address} full /> : null}
              </dl>
            </Card>

            {/* سرورها */}
            <Card title={`سرورها (${formatNumber(user.servers.length)})`} bodyClassName={user.servers.length ? 'p-0' : undefined}>
              {user.servers.length === 0 ? (
                <p className="py-8 text-center text-xs muted">این کاربر سروری ندارد.</p>
              ) : (
                <div className="scroll-x">
                  <table className="table table-cards">
                    <thead>
                      <tr>
                        <th>نام</th>
                        <th>پلن</th>
                        <th>IP</th>
                        <th>وضعیت</th>
                        <th>هزینه ماهانه</th>
                      </tr>
                    </thead>
                    <tbody>
                      {user.servers.map((s) => {
                        const sst = SERVER_STATUS_FA[s.status] ?? { label: s.status, tone: 'muted' as const };
                        return (
                          <tr key={s.id}>
                            <td data-label="نام">
                              <Link
                                href={`/admin/servers?q=${encodeURIComponent(s.name)}`}
                                className="text-xs font-semibold hover:text-[var(--color-brand-600)]"
                              >
                                <ServerIcon size={12} className="ml-1 inline muted" />
                                {s.name}
                              </Link>
                            </td>
                            <td data-label="پلن" className="text-xs uppercase muted">
                              {s.serverTypeName} · {s.locationName}
                            </td>
                            <td data-label="IP" className="mono ltr text-[11px]">{s.ipv4 ?? '—'}</td>
                            <td data-label="وضعیت">
                              <Badge tone={sst.tone}>{sst.label}</Badge>
                            </td>
                            <td data-label="هزینه ماهانه" className="tabular text-xs">{formatToman(s.priceMonthly, { suffix: false })}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* تراکنش‌ها */}
            <Card title="آخرین تراکنش‌ها" bodyClassName={user.transactions.length ? 'p-0' : undefined}>
              {user.transactions.length === 0 ? (
                <p className="py-8 text-center text-xs muted">تراکنشی ثبت نشده است.</p>
              ) : (
                <div className="scroll-x">
                  <table className="table table-cards">
                    <thead>
                      <tr>
                        <th>شرح</th>
                        <th>نوع</th>
                        <th>مبلغ</th>
                        <th>وضعیت</th>
                        <th>تاریخ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {user.transactions.map((t) => {
                        const tst = TX_STATUS_FA[t.status] ?? { label: t.status, tone: 'muted' as const };
                        return (
                          <tr key={t.id}>
                            <td data-label="شرح" className="max-w-xs truncate text-xs">{t.description ?? '—'}</td>
                            <td data-label="نوع" className="whitespace-nowrap text-xs muted">{TX_TYPE_FA[t.type] ?? t.type}</td>
                            <td data-label="مبلغ"
                              className={cn(
                                'tabular whitespace-nowrap text-xs font-bold',
                                t.direction === 'CREDIT' ? 'text-emerald-600' : 'text-red-500',
                              )}
                            >
                              {t.direction === 'CREDIT' ? '+' : '−'}
                              {formatToman(t.amount, { suffix: false })}
                            </td>
                            <td data-label="وضعیت">
                              <Badge tone={tst.tone}>{tst.label}</Badge>
                            </td>
                            <td data-label="تاریخ" className="whitespace-nowrap text-xs muted">{faDateTime(t.createdAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* تیکت‌ها */}
            {user.tickets.length ? (
              <Card title="تیکت‌های اخیر" bodyClassName="p-0">
                <div className="scroll-x">
                  <table className="table table-cards">
                    <thead>
                      <tr>
                        <th>شماره</th>
                        <th>موضوع</th>
                        <th>وضعیت</th>
                        <th>آخرین فعالیت</th>
                      </tr>
                    </thead>
                    <tbody>
                      {user.tickets.map((t) => {
                        const tst = TICKET_STATUS_FA[t.status] ?? { label: t.status, tone: 'muted' as const };
                        return (
                          <tr key={t.id}>
                            <td data-label="شماره" className="tabular text-xs font-bold">{formatNumber(t.number)}</td>
                            <td data-label="موضوع" className="max-w-xs">
                              <Link
                                href={`/admin/tickets/${t.id}`}
                                className="block truncate text-xs hover:text-[var(--color-brand-600)]"
                              >
                                {t.subject}
                              </Link>
                            </td>
                            <td data-label="وضعیت">
                              <Badge tone={tst.tone}>{tst.label}</Badge>
                            </td>
                            <td data-label="آخرین فعالیت" className="whitespace-nowrap text-xs muted">{faDateTime(t.lastReplyAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : null}
          </div>
        </div>
      </div>

      <Modal
        open={balanceOpen}
        onClose={() => setBalanceOpen(false)}
        title="تعدیل دستی موجودی"
        description={`موجودی فعلی: ${formatToman(user.balance)}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBalanceOpen(false)} disabled={balanceBusy}>
              انصراف
            </Button>
            <Button
              onClick={adjustBalance}
              loading={balanceBusy}
              variant={direction === 'sub' ? 'danger' : 'primary'}
              disabled={!amount || reason.trim().length < 3}
            >
              {direction === 'add' ? 'افزایش موجودی' : 'کاهش موجودی'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDirection('add')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-semibold transition',
                direction === 'add'
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600'
                  : 'muted hover:bg-[var(--surface-2)]',
              )}
            >
              <Plus size={14} /> افزایش
            </button>
            <button
              type="button"
              onClick={() => setDirection('sub')}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-semibold transition',
                direction === 'sub' ? 'border-red-500 bg-red-500/10 text-red-600' : 'muted hover:bg-[var(--surface-2)]',
              )}
            >
              <Minus size={14} /> کاهش
            </button>
          </div>

          <Field label="مبلغ (تومان)" required>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
              className="ltr tabular text-center text-base font-bold"
              dir="ltr"
              inputMode="numeric"
              autoFocus
            />
          </Field>

          <Field label="علت" required hint="در دفتر ممیزی و تراکنش کاربر ثبت می‌شود.">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً جبران خسارت قطعی سرویس" />
          </Field>
        </div>
      </Modal>
    </>
  );
}

function Row({ label, value, ltr, full }: { label: string; value: string; ltr?: boolean; full?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-2 border-b py-1.5', full && 'sm:col-span-2')}>
      <dt className="shrink-0 muted">{label}</dt>
      <dd className={cn('text-left', ltr && 'ltr')}>{value}</dd>
    </div>
  );
}
