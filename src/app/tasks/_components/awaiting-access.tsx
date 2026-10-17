'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, LogOut } from 'lucide-react';
import { Button } from '@/components/ui';
import { apiPost } from '@/lib/client';

/**
 * در حالت «فقط سیستم تسک»، کسی که ثبت‌نام کرده ولی هنوز نقشی ندارد به اینجا می‌رسد
 * تا مدیر او را کارفرما یا برنامه‌نویس کند.
 */
export function AwaitingAccess({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="card w-full max-w-md p-6 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-500/15 text-amber-600">
          <Clock size={26} />
        </span>
        <h1 className="mt-4 text-lg font-extrabold">منتظر تعیین نقش</h1>
        <p className="mt-2 text-sm leading-7 muted">
          {name} عزیز، ثبت‌نام شما انجام شد. مدیر باید از بخش «اعضای تیم» نقش شما را «کارفرما» یا «برنامه‌نویس» کند؛ بعد از آن
          با ورود دوباره به میز کار تسک‌ها دسترسی دارید.
        </p>
        <p className="ltr mt-3 text-xs muted">{email}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="secondary" onClick={() => router.refresh()}>
            بررسی دوباره
          </Button>
          <Button
            variant="ghost"
            loading={busy}
            icon={<LogOut size={15} />}
            onClick={async () => {
              setBusy(true);
              await apiPost('/api/auth/logout').catch(() => null);
              router.push('/login');
              router.refresh();
            }}
          >
            خروج
          </Button>
        </div>
      </div>
    </div>
  );
}
