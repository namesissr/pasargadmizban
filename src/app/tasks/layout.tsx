import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { Shell } from '@/components/app/shell';
import { env } from '@/lib/env';
import { AwaitingAccess } from './_components/awaiting-access';

export const dynamic = 'force-dynamic';

export default async function TasksLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/tasks');
  // پنل کارفرما جداست؛ برنامه‌نویس به پنل خودش می‌رود
  if (user.role === 'DEVELOPER') redirect('/dev');
  if (user.role !== 'ADMIN' && user.role !== 'EMPLOYER' && user.role !== 'SUPPORT') {
    // در حالت «فقط سیستم تسک» پنل مشتری وجود ندارد؛ عضو تازه منتظر تعیین نقش می‌ماند
    if (env.tasksOnly) {
      return <AwaitingAccess name={user.firstName ?? ''} email={user.email} />;
    }
    redirect('/dashboard');
  }

  return (
    <Shell
      area="tasks"
      tasksOnly={env.tasksOnly}
      user={{
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        balance: Number(user.balance),
      }}
    >
      {children}
    </Shell>
  );
}
