'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { KeyRound, ArrowRight } from 'lucide-react';
import { Button, Field, PasswordInput, Alert, LoadingBlock } from '@/components/ui';
import { apiPost, errorFields, errorMessage } from '@/lib/client';

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <Alert tone="error" title="لینک نامعتبر است">
        این صفحه فقط از طریق لینک ارسال‌شده به ایمیل شما قابل دسترسی است.
      </Alert>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setFields({ confirm: 'تکرار رمز عبور مطابقت ندارد.' });
      return;
    }
    setLoading(true);
    setError('');
    setFields({});
    try {
      await apiPost('/api/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (err) {
      setError(errorMessage(err));
      setFields(errorFields(err));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <Alert tone="success" title="رمز عبور تغییر کرد">
        در حال انتقال به صفحه ورود…
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Field label="رمز عبور جدید" error={fields.password} required hint="حداقل ۸ کاراکتر، شامل حرف انگلیسی و عدد.">
        <PasswordInput
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="ltr"
          dir="ltr"
          autoComplete="new-password"
          required
          autoFocus
        />
      </Field>

      <Field label="تکرار رمز عبور جدید" error={fields.confirm} required>
        <PasswordInput
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="ltr"
          dir="ltr"
          autoComplete="new-password"
          required
        />
      </Field>

      <Button type="submit" loading={loading} icon={<KeyRound size={16} />} className="w-full">
        ثبت رمز جدید
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div>
      <h1 className="text-xl font-extrabold">تعیین رمز عبور جدید</h1>
      <p className="mt-2 text-xs leading-6 muted">
        رمز جدید خود را وارد کنید. پس از تغییر، از همه دستگاه‌ها خارج می‌شوید.
      </p>

      <div className="mt-7">
        <Suspense fallback={<LoadingBlock />}>
          <ResetForm />
        </Suspense>
      </div>

      <p className="mt-7 text-center text-xs">
        <Link href="/login" className="inline-flex items-center gap-1 muted hover:underline">
          <ArrowRight size={13} /> بازگشت به صفحه ورود
        </Link>
      </p>
    </div>
  );
}
