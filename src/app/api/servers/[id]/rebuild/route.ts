import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireUser, clientIp, clientUserAgent, assertSameOrigin } from '@/lib/auth';
import { clientForServer } from '@/lib/hetzner-accounts';
import { getOwnedServer, assertOperable } from '@/lib/server-access';
import { rebuildSchema } from '@/lib/validation';
import { encrypt } from '@/lib/crypto';
import { enforceRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** نصب مجدد سیستم‌عامل — تمام داده‌های سرور پاک می‌شود */
export const POST = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireUser();
  const { id } = await ctx.params;

  await enforceRateLimit(`rebuild:${user.id}`, 6, 3600, { persistent: true });

  const server = await getOwnedServer(id, user, { requireHetzner: true });
  assertOperable(server);

  const { image } = await parseBody(req, rebuildSchema);

  const [serverType, imageRow] = await Promise.all([
    prisma.hetznerServerType.findUnique({ where: { name: server.serverTypeName } }),
    prisma.hetznerImage.findFirst({
      where: { enabled: true, OR: [{ name: image }, { description: image }] },
    }),
  ]);

  if (!imageRow) throw new ApiError('سیستم‌عامل انتخابی در دسترس نیست.', 400);
  if (serverType && imageRow.architecture !== serverType.architecture) {
    throw new ApiError(
      `این سیستم‌عامل با معماری ${serverType.architecture.toUpperCase()} سرور شما سازگار نیست.`,
      400,
    );
  }

  await prisma.server.update({ where: { id: server.id }, data: { status: 'REBUILDING' } });

  try {
    const res = await (await clientForServer(server)).rebuild(server.hetznerId!, String(imageRow.id));

    await prisma.server.update({
      where: { id: server.id },
      data: {
        imageName: imageRow.name ?? imageRow.description,
        imageLabel: imageRow.description,
        rootPasswordEnc: res.root_password ? encrypt(res.root_password) : server.rootPasswordEnc,
      },
    });

    await prisma.serverAction.create({
      data: {
        serverId: server.id,
        userId: user.id,
        action: 'rebuild',
        hetznerActionId: BigInt(res.action.id),
        status: 'RUNNING',
        meta: { image: imageRow.description },
      },
    });

    await audit({
      userId: user.id,
      action: 'server.rebuild',
      entity: 'server',
      entityId: server.id,
      ip: await clientIp(),
      userAgent: await clientUserAgent(),
      meta: { image: imageRow.description },
    });

    await notify(user.id, {
      type: 'warning',
      title: `نصب مجدد سرور ${server.name} آغاز شد`,
      body: `سیستم‌عامل ${imageRow.description} در حال نصب است. این فرآیند چند دقیقه طول می‌کشد.`,
      link: `/dashboard/servers/${server.id}`,
    });

    return ok({
      actionId: res.action.id,
      rootPassword: res.root_password ?? null,
      image: imageRow.description,
      message: 'نصب مجدد آغاز شد. رمز روت جدید را ذخیره کنید؛ پس از بستن این پیام دیگر نمایش داده نمی‌شود.',
    });
  } catch (err) {
    await prisma.server.update({ where: { id: server.id }, data: { status: server.status } });
    throw err;
  }
});
