'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertOctagon, RotateCw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app] خطای رندر:', error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <AlertOctagon size={52} className="mx-auto text-red-500 opacity-80" />
        <h1 className="mt-5 text-lg font-extrabold">مشکلی پیش آمد</h1>
        <p className="mt-2 text-xs leading-7 muted">
          در نمایش این صفحه خطایی رخ داد. اگر مشکل ادامه داشت با پشتیبانی تماس بگیرید.
        </p>
        {error.digest ? (
          <p className="mono ltr mt-3 text-[10px] muted">کد خطا: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button onClick={reset} className="btn btn-primary">
            <RotateCw size={15} /> تلاش مجدد
          </button>
          <Link href="/dashboard" className="btn btn-secondary">
            بازگشت به داشبورد
          </Link>
        </div>
      </div>
    </div>
  );
}
