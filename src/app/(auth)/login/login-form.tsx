'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LogIn, ShieldCheck, ArrowRight } from 'lucide-react';
import { Button, Field, Input, PasswordInput, Alert } from '@/components/ui';
import { apiPost, errorFields, errorMessage } from '@/lib/client';

type LoginResponse =
  | { requiresTwoFactor: true; challenge: string; message: string }
  | { requiresTwoFactor?: false; redirect: string };

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextUrl = params.get('next');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});

  // مرحله دوم
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);

  function goTo(redirect: string) {
    const target = nextUrl && nextUrl.startsWith('/') ? nextUrl : redirect;
    router.push(target);
    router.refresh();
  }

  async function submitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setFields({});
    try {
      const res = await apiPost<LoginResponse>('/api/auth/login', { email, password });
      if ('requiresTwoFactor' in res && res.requiresTwoFactor) {
        setChallenge(res.challenge);
        setCode('');
        setLoading(false);
        return;
      }
      goTo((res as { redirect: string }).redirect);
    } catch (err) {
      setError(errorMessage(err));
      setFields(errorFields(err));
      setLoading(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setFields({});
    try {
      const res = await apiPost<{ redirect: string }>('/api/auth/login', { challenge, code });
      goTo(res.redirect);
    } catch (err) {
      setError(errorMessage(err));
      setFields(errorFields(err));
      setLoading(false);
      // اگر مهلت چالش تمام شده، کاربر باید از اول وارد شود
      if (errorFields(err).challenge || errorMessage(err).includes('مهلت')) {
        setChallenge(null);
        setPassword('');
      }
    }
  }

  // ── مرحله دوم: کد احراز هویت ──
  if (challenge) {
    return (
      <form onSubmit={submitCode} className="space-y-4" noValidate>
        <div className="rounded-xl border border-[var(--color-brand-500)]/35 bg-[color-mix(in_srgb,var(--color-brand-500)_8%,transparent)] px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-brand-700)]">
            <ShieldCheck size={16} /> تایید دو مرحله‌ای
          </div>
          <p className="mt-1.5 text-xs leading-6 muted">
            {useRecovery
              ? 'یکی از کدهای بازیابی خود را وارد کنید. هر کد فقط یک بار قابل استفاده است.'
              : 'کد ۶ رقمی نمایش‌داده‌شده در اپلیکیشن احراز هویت خود را وارد کنید.'}
          </p>
        </div>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <Field label={useRecovery ? 'کد بازیابی' : 'کد تایید'} error={fields.code} required>
          <Input
            value={code}
            onChange={(e) =>
              setCode(useRecovery ? e.target.value.toUpperCase().slice(0, 12) : e.target.value.replace(/[^0-9]/g, '').slice(0, 6))
            }
            className="ltr tabular text-center text-lg font-bold tracking-widest"
            dir="ltr"
            inputMode={useRecovery ? 'text' : 'numeric'}
            placeholder={useRecovery ? 'XXXXX-XXXXX' : '000000'}
            autoFocus
            required
          />
        </Field>

        <Button
          type="submit"
          loading={loading}
          icon={<LogIn size={16} />}
          className="w-full"
          disabled={useRecovery ? code.length < 8 : code.length !== 6}
        >
          ورود
        </Button>

        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => {
              setUseRecovery((v) => !v);
              setCode('');
              setError('');
            }}
            className="text-[var(--color-brand-600)] hover:underline"
          >
            {useRecovery ? 'استفاده از اپلیکیشن احراز هویت' : 'دسترسی به اپلیکیشن ندارم'}
          </button>
          <button
            type="button"
            onClick={() => {
              setChallenge(null);
              setPassword('');
              setError('');
            }}
            className="inline-flex items-center gap-1 muted hover:underline"
          >
            <ArrowRight size={13} /> بازگشت
          </button>
        </div>
      </form>
    );
  }

  // ── مرحله اول: ایمیل و رمز ──
  return (
    <form onSubmit={submitCredentials} className="space-y-4" noValidate>
      {params.get('registered') ? (
        <Alert tone="success" title="ثبت‌نام انجام شد">
          حالا با ایمیل و رمز عبور خود وارد شوید.
        </Alert>
      ) : null}

      {error ? <Alert tone="error">{error}</Alert> : null}

      <Field label="ایمیل" error={fields.email} required>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="ltr"
          autoComplete="email"
          dir="ltr"
          required
          autoFocus
        />
      </Field>

      <Field label="رمز عبور" error={fields.password} required>
        <PasswordInput
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="ltr"
          dir="ltr"
          required
        />
      </Field>

      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-xs text-[var(--color-brand-600)] hover:underline">
          رمز عبور را فراموش کرده‌اید؟
        </Link>
      </div>

      <Button type="submit" loading={loading} icon={<LogIn size={16} />} className="w-full">
        ورود
      </Button>
    </form>
  );
}
