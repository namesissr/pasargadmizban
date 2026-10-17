import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { Shell } from '@/components/app/shell';

export const dynamic = 'force-dynamic';

export default async function TasksLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/tasks');
  // پنل کارفرما جداست؛ برنامه‌نویس به پنل خودش می‌رود
  if (user.role === 'DEVELOPER') redirect('/dev');
  if (user.role !== 'ADMIN' && user.role !== 'EMPLOYER' && user.role !== 'SUPPORT') redirect('/dashboard');

  return (
    <Shell
      area="tasks"
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
