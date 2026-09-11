'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Alert, LoadingBlock, Button } from '@/components/ui';
import { apiPost, errorMessage } from '@/lib/client';

function VerifyInner() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setMessage('لینک تایید نامعتبر است.');
      return;
    }
    let cancelled = false;
    apiPost<{ message: string }>('/api/auth/verify-email', { token })
      .then((res) => {
        if (cancelled) return;
        setState('ok');
        setMessage(res.message);
      })
      .catch((err) => {
        if (cancelled) return;
        setState('error');
        setMessage(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === 'loading') return <LoadingBlock label="در حال تایید ایمیل…" />;

  return (
    <div className="text-center">
      {state === 'ok' ? (
        <>
          <CheckCircle2 size={48} className="mx-auto text-emerald-500" />
          <h2 className="mt-4 text-base font-bold">ایمیل شما تایید شد</h2>
          <p className="mt-2 text-xs leading-7 muted">{message}</p>
          <Link href="/dashboard" className="btn btn-primary mt-6 w-full">
            ورود به پنل کاربری
          </Link>
        </>
      ) : (
        <>
          <XCircle size={48} className="mx-auto text-red-500" />
          <h2 className="mt-4 text-base font-bold">تایید ایمیل انجام نشد</h2>
          <p className="mt-2 text-xs leading-7 muted">{message}</p>
          <div className="mt-6">
            <Alert tone="info">
              اگر لینک منقضی شده، پس از ورود به پنل از بخش حساب کاربری دوباره درخواست ارسال ایمیل تایید بدهید.
            </Alert>
          </div>
          <Link href="/login" className="mt-5 block">
            <Button variant="secondary" className="w-full">
              بازگشت به صفحه ورود
            </Button>
          </Link>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div>
      <Suspense fallback={<LoadingBlock />}>
        <VerifyInner />
      </Suspense>
    </div>
  );
}
