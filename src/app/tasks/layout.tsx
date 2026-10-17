import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { Shell } from '@/components/app/shell';

export const dynamic = 'force-dynamic';

export default async function TasksLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/tasks');
  if (user.role !== 'ADMIN' && user.role !== 'SUPPORT' && user.role !== 'DEVELOPER') redirect('/dashboard');

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
