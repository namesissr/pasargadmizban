import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { Shell } from '@/components/app/shell';

export const dynamic = 'force-dynamic';

export default async function DevLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/dev');
  // پنل برنامه‌نویس جداست؛ کارفرما و پشتیبان به پنل کارفرما می‌روند
  if (user.role === 'ADMIN' || user.role === 'EMPLOYER' || user.role === 'SUPPORT') redirect('/tasks');
  if (user.role !== 'DEVELOPER') redirect('/dashboard');

  return (
    <Shell
      area="dev"
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
