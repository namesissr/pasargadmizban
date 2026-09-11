'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { Button, Field, Input, PasswordInput, Alert } from '@/components/ui';
import { apiPost, errorFields, errorMessage } from '@/lib/client';

export function RegisterForm({ requireEmailVerify }: { requireEmailVerify: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    referralCode: '',
  });
  const [accept, setAccept] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setFields({});
    try {
      const res = await apiPost<{ verifyRequired: boolean; isFirstUser: boolean }>('/api/auth/register', {
        ...form,
        referralCode: form.referralCode || undefined,
        acceptTerms: accept,
      });
      router.push(res.isFirstUser ? '/admin/settings' : '/dashboard');
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setFields(errorFields(err));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="نام" error={fields.firstName} required>
          <Input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} autoComplete="given-name" required />
        </Field>
        <Field label="نام خانوادگی" error={fields.lastName} required>
          <Input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} autoComplete="family-name" required />
        </Field>
      </div>

      <Field label="ایمیل" error={fields.email} required hint="لینک تایید و اطلاعات سرور به این ایمیل ارسال می‌شود.">
        <Input
          type="email"
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
          placeholder="you@example.com"
          className="ltr"
          dir="ltr"
          autoComplete="email"
          required
        />
      </Field>

      <Field label="شماره موبایل" error={fields.phone} required>
        <Input
          value={form.phone}
          onChange={(e) => set('phone', e.target.value)}
          placeholder="09121234567"
          className="ltr"
          dir="ltr"
          inputMode="numeric"
          autoComplete="tel"
          required
        />
      </Field>

      <Field
        label="رمز عبور"
        error={fields.password}
        required
        hint="حداقل ۸ کاراکتر، شامل حرف انگلیسی و عدد."
      >
        <PasswordInput
          value={form.password}
          onChange={(e) => set('password', e.target.value)}
          className="ltr"
          dir="ltr"
          autoComplete="new-password"
          required
        />
      </Field>

      <Field label="کد معرف (اختیاری)" error={fields.referralCode}>
        <Input
          value={form.referralCode}
          onChange={(e) => set('referralCode', e.target.value.toUpperCase())}
          className="ltr"
          dir="ltr"
          placeholder="مثلاً AB12CD34"
        />
      </Field>

      <label className="flex items-start gap-2 text-xs leading-6">
        <input
          type="checkbox"
          checked={accept}
          onChange={(e) => setAccept(e.target.checked)}
          className="mt-1.5 h-4 w-4 accent-[var(--color-brand-600)]"
          required
        />
        <span className="muted">
          قوانین و شرایط استفاده از سرویس را می‌پذیرم و متعهد می‌شوم از سرور برای فعالیت‌های غیرقانونی استفاده نکنم.
        </span>
      </label>
      {fields.acceptTerms ? <p className="text-xs text-red-500">{fields.acceptTerms}</p> : null}

      <Button type="submit" loading={loading} icon={<UserPlus size={16} />} className="w-full" disabled={!accept}>
        ساخت حساب کاربری
      </Button>

      {requireEmailVerify ? (
        <p className="text-center text-[11px] leading-6 muted">
          پس از ثبت‌نام، یک ایمیل تایید برای شما ارسال می‌شود.
        </p>
      ) : null}
    </form>
  );
}
