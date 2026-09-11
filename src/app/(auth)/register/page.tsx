import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import prisma from '@/lib/prisma';
import { Alert } from '@/components/ui';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'ثبت‌نام' };
export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === 'USER' ? '/dashboard' : '/admin');

  const settings = await getSettings();
  const userCount = await prisma.user.count().catch(() => 1);
  const isFirstUser = userCount === 0;

  if (!settings.registrationOpen && !isFirstUser) {
    return (
      <div>
        <h1 className="text-xl font-extrabold">ثبت‌نام بسته است</h1>
        <div className="mt-5">
          <Alert tone="warning" title="امکان ثبت‌نام جدید وجود ندارد">
            در حال حاضر ثبت‌نام کاربران جدید غیرفعال است. برای دریافت سرویس با پشتیبانی تماس بگیرید.
          </Alert>
        </div>
        <p className="mt-6 text-center text-xs muted">
          حساب دارید؟{' '}
          <Link href="/login" className="font-semibold text-[var(--color-brand-600)] hover:underline">
            وارد شوید
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-extrabold">{isFirstUser ? 'ساخت حساب مدیر سیستم' : 'ساخت حساب کاربری'}</h1>
      <p className="mt-2 text-xs leading-6 muted">
        {isFirstUser
          ? 'این اولین حساب سیستم است و به صورت خودکار دسترسی مدیر کل دریافت می‌کند.'
          : 'در کمتر از یک دقیقه ثبت‌نام کنید و اولین سرور خود را بسازید.'}
      </p>

      {isFirstUser ? (
        <div className="mt-5">
          <Alert tone="info" title="راه‌اندازی اولیه">
            پس از ثبت‌نام، به بخش تنظیمات بروید و توکن API هتزنر و نرخ یورو را وارد کنید.
          </Alert>
        </div>
      ) : null}

      <div className="mt-6">
        <RegisterForm requireEmailVerify={settings.requireEmailVerify} />
      </div>

      <p className="mt-6 text-center text-xs muted">
        حساب دارید؟{' '}
        <Link href="/login" className="font-semibold text-[var(--color-brand-600)] hover:underline">
          وارد شوید
        </Link>
      </p>
    </div>
  );
}
