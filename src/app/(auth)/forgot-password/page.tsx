'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowRight } from 'lucide-react';
import { Button, Field, Input, Alert } from '@/components/ui';
import { apiPost, errorMessage } from '@/lib/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await apiPost('/api/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-extrabold">بازیابی رمز عبور</h1>
      <p className="mt-2 text-xs leading-6 muted">
        ایمیل حساب خود را وارد کنید تا لینک تعیین رمز جدید برایتان ارسال شود.
      </p>

      <div className="mt-7">
        {sent ? (
          <Alert tone="success" title="ایمیل ارسال شد">
            اگر این ایمیل در سیستم ثبت شده باشد، لینک بازیابی برای آن ارسال شد. صندوق ورودی و پوشه اسپم را بررسی کنید.
            لینک تا یک ساعت معتبر است.
          </Alert>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            {error ? <Alert tone="error">{error}</Alert> : null}
            <Field label="ایمیل" required>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="ltr"
                dir="ltr"
                autoComplete="email"
                required
                autoFocus
              />
            </Field>
            <Button type="submit" loading={loading} icon={<Mail size={16} />} className="w-full">
              ارسال لینک بازیابی
            </Button>
          </form>
        )}
      </div>

      <p className="mt-7 text-center text-xs">
        <Link href="/login" className="inline-flex items-center gap-1 muted hover:underline">
          <ArrowRight size={13} /> بازگشت به صفحه ورود
        </Link>
      </p>
    </div>
  );
}
