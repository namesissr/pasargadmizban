import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireUser, clientIp, assertSameOrigin } from '@/lib/auth';
import { sshKeySchema } from '@/lib/validation';
import { sshFingerprint } from '@/lib/crypto';
import { audit } from '@/lib/audit';
import { enforceRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const user = await requireUser();
  const items = await prisma.sshKey.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      fingerprint: true,
      publicKey: true,
      createdAt: true,
      _count: { select: { remotes: true } },
    },
  });
  return ok({ items });
});

export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const user = await requireUser();
  await enforceRateLimit(`sshkey:${user.id}`, 20, 3600, { persistent: true });

  const input = await parseBody(req, sshKeySchema);
  const publicKey = input.publicKey.replace(/\s+/g, ' ').trim();

  const fingerprint = sshFingerprint(publicKey);
  if (!fingerprint) {
    throw new ApiError('کلید عمومی قابل خواندن نیست.', 400, { fields: { publicKey: 'کلید نامعتبر است.' } });
  }

  const count = await prisma.sshKey.count({ where: { userId: user.id } });
  if (count >= 25) throw new ApiError('حداکثر ۲۵ کلید SSH می‌توانید ذخیره کنید.', 400);

  const duplicate = await prisma.sshKey.findFirst({ where: { userId: user.id, fingerprint } });
  if (duplicate) {
    throw new ApiError('این کلید قبلاً اضافه شده است.', 409, { fields: { publicKey: 'کلید تکراری است.' } });
  }

  const key = await prisma.sshKey.create({
    data: { userId: user.id, name: input.name, publicKey, fingerprint },
    select: { id: true, name: true, fingerprint: true, createdAt: true },
  });

  await audit({
    userId: user.id,
    action: 'sshkey.create',
    entity: 'ssh_key',
    entityId: key.id,
    ip: await clientIp(),
    meta: { fingerprint },
  });

  return ok(key, { status: 201 });
});
