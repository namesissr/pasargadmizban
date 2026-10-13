import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { Shell } from '@/components/app/shell';
import { panelMode } from '@/lib/panel-mode';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, mode] = await Promise.all([getCurrentUser(), panelMode()]);
  if (!user) redirect('/login?next=/dashboard');

  return (
    <Shell
      area="user"
      mode={mode}
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
