import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { Shell } from '@/components/app/shell';
import { panelMode } from '@/lib/panel-mode';
import { BrandStyle } from '@/components/site/brand-style';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, mode, settings] = await Promise.all([getCurrentUser(), panelMode(), getSettings()]);
  if (!user) redirect('/login?next=/admin');
  if (user.role !== 'ADMIN' && user.role !== 'SUPPORT') redirect('/dashboard');

  return (
    <>
      {/* رنگ برند پنل هم از همان تنظیماتی می‌آید که رنگ وبلاگ را می‌سازد */}
      <BrandStyle color={settings.brandColor} />
      <Shell
        area="admin"
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
    </>
  );
}
