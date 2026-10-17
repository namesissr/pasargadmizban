import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { env } from '@/lib/env';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'ورود به حساب کاربری' };
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    if (user.role === 'DEVELOPER') redirect('/dev');
    if (env.tasksOnly) redirect('/tasks');
    redirect(user.role === 'USER' ? '/dashboard' : user.role === 'EMPLOYER' ? '/tasks' : '/admin');
  }

  return (
    <div>
      <h1 className="text-xl font-extrabold">ورود به حساب کاربری</h1>
      <p className="mt-2 text-xs leading-6 muted">
        {env.tasksOnly ? 'برای ورود به میز کار تسک‌ها وارد شوید.' : 'برای مدیریت سرورها و کیف پول خود وارد شوید.'}
      </p>

      <div className="mt-7">
        <LoginForm />
      </div>

      <p className="mt-7 text-center text-xs muted">
        حساب کاربری ندارید؟{' '}
        <Link href="/register" className="font-semibold text-[var(--color-brand-600)] hover:underline">
          ثبت‌نام کنید
        </Link>
      </p>
    </div>
  );
}
