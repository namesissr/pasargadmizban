import { ok, route } from '@/lib/api';
import { destroySession, getCurrentUser, clientIp } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = route(async () => {
  const user = await getCurrentUser();
  await destroySession();
  if (user) {
    await audit({ userId: user.id, action: 'auth.logout', ip: await clientIp() });
  }
  return ok({ loggedOut: true });
});
