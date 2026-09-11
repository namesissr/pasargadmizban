'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  Mail,
  MessageSquare,
  PlugZap,
  Send,
  Save,
  CheckCircle2,
  XCircle,
  SkipForward,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Pagination,
  Select,
  Stat,
  Toggle,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiPost, errorMessage, errorFields, fetcher } from '@/lib/client';
import { faDateTime, cn } from '@/lib/utils';

type LogRow = {
  id: string;
  to: string;
  subject: string;
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  error: string | null;
  smtpHost: string | null;
  createdAt: string;
};

type Data = {
  smtp: {
    configured: boolean;
    source: 'db' | 'env' | null;
    host: string;
    port: number;
    secure: boolean;
    user: string;
    from: string;
    hasPass: boolean;
    envHost: string | null;
  };
  sms: { configured: boolean; provider: string; sender: string | null };
  stats: { sent30: number; failed30: number; skipped30: number; lastFailedAt: string | null };
  logs: { items: LogRow[]; meta: { page: number; totalPages: number; total: number } };
};

const fa = (n: number) => new Intl.NumberFormat('fa-IR').format(n);

const STATUS_FA: Record<LogRow['status'], { label: string; tone: 'ok' | 'bad' | 'muted'; icon: React.ReactNode }> = {
  SENT: { label: 'ارسال شد', tone: 'ok', icon: <CheckCircle2 size={11} /> },
  FAILED: { label: 'ناموفق', tone: 'bad', icon: <XCircle size={11} /> },
  SKIPPED: { label: 'پیکربندی نبود', tone: 'muted', icon: <SkipForward size={11} /> },
};

export function MessagingClient() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('ALL');

  const key = `/api/admin/messaging?page=${page}${statusFilter !== 'ALL' ? `&status=${statusFilter}` : ''}`;
  const { data, isLoading, mutate } = useSWR<Data>(key, fetcher, { refreshInterval: 60_000 });

  if (isLoading && !data) return <LoadingBlock label="در حال خواندن وضعیت…" />;
  if (!data) return <Alert tone="error">دریافت اطلاعات ممکن نشد.</Alert>;

  return (
    <div className="space-y-4">
      {/* ── وضعیت کلی ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="ارسال موفق (۳۰ روز)"
          value={fa(data.stats.sent30)}
          icon={<Mail size={15} />}
          tone="ok"
        />
        <Stat
          label="ناموفق (۳۰ روز)"
          value={fa(data.stats.failed30)}
          tone={data.stats.failed30 > 0 ? 'bad' : undefined}
          hint={data.stats.lastFailedAt ? `آخرین شکست: ${faDateTime(data.stats.lastFailedAt)}` : undefined}
          icon={<XCircle size={15} />}
        />
        <Stat
          label="بدون پیکربندی (۳۰ روز)"
          value={fa(data.stats.skipped30)}
          tone={data.stats.skipped30 > 0 ? 'warn' : undefined}
          hint="ایمیل‌هایی که چون SMTP تنظیم نبود ارسال نشدند"
          icon={<SkipForward size={15} />}
        />
        <Stat
          label="سرویس پیامک"
          value={data.sms.configured ? 'فعال' : 'تنظیم نشده'}
          tone={data.sms.configured ? 'ok' : undefined}
          hint={data.sms.configured ? `${data.sms.provider}${data.sms.sender ? ` · ${data.sms.sender}` : ''}` : 'SMS_API_KEY در .env'}
          icon={<MessageSquare size={15} />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <SmtpCard smtp={data.smtp} onSaved={mutate} />
        <div className="space-y-4">
          <TestCard smtpConfigured={data.smtp.configured} smsConfigured={data.sms.configured} onDone={mutate} />
        </div>
      </div>

      {/* ── لاگ ارسال‌ها ── */}
      <Card
        title="لاگ ایمیل‌های ارسال‌شده"
        description="محتوای ایمیل ذخیره نمی‌شود؛ فقط گیرنده، موضوع و نتیجه. لاگ‌های قدیمی‌تر از ۹۰ روز خودکار پاک می‌شوند."
        action={
          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-40 text-xs"
          >
            <option value="ALL">همه وضعیت‌ها</option>
            <option value="SENT">ارسال موفق</option>
            <option value="FAILED">ناموفق</option>
            <option value="SKIPPED">بدون پیکربندی</option>
          </Select>
        }
        bodyClassName="p-0"
      >
        {data.logs.items.length === 0 ? (
          <EmptyState
            icon={<Mail size={26} />}
            title="هنوز ایمیلی ثبت نشده"
            description="از کارت «ارسال آزمایشی» یک ایمیل بفرستید تا نخستین ردیف اینجا ظاهر شود."
          />
        ) : (
          <>
            <div className="scroll-x">
              <table className="table table-cards">
                <thead>
                  <tr>
                    <th>گیرنده</th>
                    <th>موضوع</th>
                    <th>وضعیت</th>
                    <th>زمان</th>
                  </tr>
                </thead>
                <tbody>
                  {data.logs.items.map((row) => {
                    const st = STATUS_FA[row.status];
                    return (
                      <tr key={row.id}>
                        <td data-label="گیرنده" className="ltr mono text-xs">
                          {row.to}
                        </td>
                        <td data-label="موضوع" className="max-w-xs">
                          <div className="truncate text-xs">{row.subject}</div>
                        </td>
                        <td data-label="وضعیت">
                          <Badge tone={st.tone}>
                            {st.icon} {st.label}
                          </Badge>
                          {row.error ? (
                            <div className="ltr mt-1 max-w-sm truncate text-[10px] text-red-500">{row.error}</div>
                          ) : null}
                        </td>
                        <td data-label="زمان" className="whitespace-nowrap text-xs muted">
                          {faDateTime(row.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={data.logs.meta.page} totalPages={data.logs.meta.totalPages} onChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}

// ─────────────  تنظیمات SMTP  ─────────────

function SmtpCard({ smtp, onSaved }: { smtp: Data['smtp']; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    user: smtp.user,
    pass: '',
    from: smtp.from,
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function save() {
    setSaving(true);
    setFields({});
    try {
      const res = await apiPost<{ message: string }>('/api/admin/messaging', { action: 'save-smtp', ...form });
      toast.success(res.message);
      setForm((f) => ({ ...f, pass: '' }));
      onSaved();
    } catch (err) {
      toast.error('ذخیره انجام نشد', errorMessage(err));
      setFields(errorFields(err));
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await apiPost<{ ok: boolean; message: string }>('/api/admin/messaging', { action: 'test-smtp' });
      setTestResult(res);
    } catch (err) {
      setTestResult({ ok: false, message: errorMessage(err) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card
      title="سرور ایمیل (SMTP)"
      description="بدون دست زدن به سرور، از همین‌جا تنظیم کنید. رمز با AES-256 رمزنگاری می‌شود."
      action={
        smtp.configured ? (
          <Badge tone="ok">{smtp.source === 'db' ? 'از پنل' : 'از .env'}</Badge>
        ) : (
          <Badge tone="bad">تنظیم نشده</Badge>
        )
      }
    >
      <div className="space-y-3.5">
        {!smtp.configured ? (
          <Alert tone="warning" title="ایمیلی ارسال نمی‌شود">
            تا سرور ایمیل تنظیم نشود، هیچ ایمیلی (تحویل سرور، هشدار اعتبار، گزارش هفتگی و…) به کاربران نمی‌رسد.
          </Alert>
        ) : null}
        {!smtp.host && smtp.envHost ? (
          <Alert tone="info">
            در حال حاضر از مقادیر فایل .env استفاده می‌شود ({smtp.envHost}). با پر کردن این فرم، تنظیمات پنل
            جایگزین می‌شود.
          </Alert>
        ) : null}

        <div className="grid gap-3.5 sm:grid-cols-[1fr_7rem]">
          <Field label="میزبان (Host)" error={fields.host} hint="مثلاً mail.pasargadmizban.ir">
            <Input
              value={form.host}
              onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
              className="ltr"
              dir="ltr"
              placeholder="mail.example.com"
            />
          </Field>
          <Field label="پورت">
            <Input
              type="number"
              value={form.port}
              onChange={(e) => setForm((f) => ({ ...f, port: Number(e.target.value) }))}
              className="ltr tabular"
              dir="ltr"
            />
          </Field>
        </div>

        <Toggle
          checked={form.secure}
          onChange={(v) => setForm((f) => ({ ...f, secure: v }))}
          label="اتصال امن مستقیم (SSL/TLS)"
          description="برای پورت ۴۶۵ روشن باشد؛ پورت ۵۸۷ معمولاً خاموش (STARTTLS خودکار)."
        />

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="نام کاربری">
            <Input
              value={form.user}
              onChange={(e) => setForm((f) => ({ ...f, user: e.target.value }))}
              className="ltr"
              dir="ltr"
              autoComplete="off"
              placeholder="no-reply@example.com"
            />
          </Field>
          <Field label="رمز عبور" hint={smtp.hasPass ? 'رمزی ذخیره شده؛ برای تغییر، رمز تازه بنویسید.' : undefined}>
            <Input
              type="password"
              value={form.pass}
              onChange={(e) => setForm((f) => ({ ...f, pass: e.target.value }))}
              className="ltr"
              dir="ltr"
              autoComplete="new-password"
              placeholder={smtp.hasPass ? '••••••••' : ''}
            />
          </Field>
        </div>

        <Field label="آدرس فرستنده (From)" hint="ایمیلی که کاربر به عنوان فرستنده می‌بیند.">
          <Input
            value={form.from}
            onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))}
            className="ltr"
            dir="ltr"
            placeholder="no-reply@pasargadmizban.ir"
          />
        </Field>

        {testResult ? (
          <Alert tone={testResult.ok ? 'success' : 'error'}>{testResult.message}</Alert>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={save} loading={saving} icon={<Save size={15} />} className="flex-1">
            ذخیره تنظیمات
          </Button>
          <Button variant="secondary" onClick={test} loading={testing} icon={<PlugZap size={15} />}>
            آزمایش اتصال
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ─────────────  ارسال آزمایشی  ─────────────

function TestCard({
  smtpConfigured,
  smsConfigured,
  onDone,
}: {
  smtpConfigured: boolean;
  smsConfigured: boolean;
  onDone: () => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingSms, setSendingSms] = useState(false);

  async function testEmail() {
    setSendingEmail(true);
    try {
      const res = await apiPost<{ message: string }>('/api/admin/messaging', { action: 'test-email', to: email.trim() });
      toast.success('ارسال شد', res.message);
      onDone();
    } catch (err) {
      toast.error('ارسال نشد', errorMessage(err));
      onDone();
    } finally {
      setSendingEmail(false);
    }
  }

  async function testSms() {
    setSendingSms(true);
    try {
      const res = await apiPost<{ message: string }>('/api/admin/messaging', { action: 'test-sms', to: phone.trim() });
      toast.success('ارسال شد', res.message);
    } catch (err) {
      toast.error('ارسال نشد', errorMessage(err));
    } finally {
      setSendingSms(false);
    }
  }

  return (
    <Card title="ارسال آزمایشی" description="مطمئن شوید پیام‌ها واقعاً به دست کاربر می‌رسند.">
      <div className="space-y-4">
        <Field label="ایمیل آزمایشی" hint="یک ایمیل کامل با قالب پنل فرستاده می‌شود؛ پوشه اسپم را هم چک کنید.">
          <div className="flex gap-2">
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="ltr"
              dir="ltr"
              type="email"
            />
            <Button
              onClick={testEmail}
              loading={sendingEmail}
              disabled={!email.includes('@')}
              icon={<Send size={15} />}
            >
              ارسال
            </Button>
          </div>
          {!smtpConfigured ? (
            <p className="mt-1.5 text-[11px] text-amber-600">سرور ایمیل هنوز تنظیم نشده؛ ارسال شکست می‌خورد.</p>
          ) : null}
        </Field>

        <div className={cn('border-t pt-4', !smsConfigured && 'opacity-70')}>
          <Field
            label="پیامک آزمایشی"
            hint={smsConfigured ? 'یک پیامک کوتاه به این شماره فرستاده می‌شود.' : 'برای فعال شدن، SMS_API_KEY را در فایل .env تنظیم کنید.'}
          >
            <div className="flex gap-2">
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09121234567"
                className="ltr tabular"
                dir="ltr"
                inputMode="tel"
                disabled={!smsConfigured}
              />
              <Button
                onClick={testSms}
                loading={sendingSms}
                disabled={!smsConfigured || phone.trim().length < 10}
                icon={<Send size={15} />}
              >
                ارسال
              </Button>
            </div>
          </Field>
        </div>
      </div>
    </Card>
  );
}
