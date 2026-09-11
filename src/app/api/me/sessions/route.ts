import prisma from '@/lib/prisma';
import { ok, route } from '@/lib/api';
import { requireUser, revokeAllSessions, clientIp, assertSameOrigin } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const user = await requireUser();
  const items = await prisma.session.findMany({
    where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, ip: true, userAgent: true, createdAt: true, expiresAt: true },
    take: 30,
  });
  return ok({ items });
});

/** خروج از همه دستگاه‌ها */
export const DELETE = route(async () => {
  await assertSameOrigin();
  const user = await requireUser();
  await revokeAllSessions(user.id);
  await audit({ userId: user.id, action: 'auth.sessions_revoked', ip: await clientIp() });
  return ok({ revoked: true, message: 'از همه دستگاه‌ها خارج شدید. باید دوباره وارد شوید.' });
});
