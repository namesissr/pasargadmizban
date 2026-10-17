import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { isTaskRole, taskPath } from '@/lib/dev-tasks-shared';

export const dynamic = 'force-dynamic';

/**
 * پیوند کوتاه تسک که در اعلان‌ها، تلگرام و ایمیل می‌رود. چون کارفرما و
 * برنامه‌نویس هر کدام پنل جدا دارند، هر نفر به صفحه تسک در پنل خودش می‌رود.
 */
export default async function TaskShortLink({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const n = Number(number);
  if (!Number.isInteger(n) || n <= 0) notFound();

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/t/${n}`);
  if (!isTaskRole(user.role)) redirect('/dashboard');
  redirect(taskPath(user.role, n));
}
