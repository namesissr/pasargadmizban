import prisma from './prisma';
import { ApiError } from './errors';
import { audit } from './audit';
import { notify } from './notify';
import type { SessionUser } from './auth';

/**
 * انتقال مالکیت سرور بین کاربران — با تأیید گیرنده.
 *
 * سناریو: فرستنده با ایمیل گیرنده یک درخواست می‌سازد؛ سرور تا تأیید گیرنده سر جای
 * خودش می‌ماند و کار می‌کند. با تأیید، مالکیت سرور و همه رکوردهای وابسته به گیرنده
 * منتقل می‌شود. هیچ پولی جابه‌جا نمی‌شود؛ سرور با همان سررسید فعلی منتقل می‌شود و
 * هزینه‌های بعدی از کیف پول گیرنده کسر می‌گردد.
 */

const TRANSFER_TTL_HOURS = 72;

/** وضعیت‌هایی که سرور در آن‌ها قابل انتقال است */
function assertTransferable(status: string) {
  if (status === 'PROVISIONING') {
    throw new ApiError('سرور هنوز در حال ساخت است؛ پس از آماده شدن قابل انتقال است.', 409);
  }
  if (status === 'DELETING' || status === 'DELETED') {
    throw new ApiError('این سرور در حال حذف است و قابل انتقال نیست.', 409);
  }
}

/** درخواست انتقال یک سرور به کاربر دیگر */
export async function createTransfer(params: {
  serverId: string;
  fromUser: SessionUser;
  toEmail: string;
  note?: string;
}): Promise<{ id: string; toName: string }> {
  const { serverId, fromUser } = params;
  const toEmail = params.toEmail.trim().toLowerCase();

  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) throw new ApiError('سرور یافت نشد.', 404);
  if (server.userId !== fromUser.id) throw new ApiError('این سرور متعلق به شما نیست.', 403);
  if (server.deletedAt || server.status === 'DELETED') throw new ApiError('این سرور حذف شده است.', 410);
  assertTransferable(server.status);
  if (server.protection) {
    throw new ApiError('برای انتقال، ابتدا محافظت حذف سرور را از بخش تنظیمات خاموش کنید.', 400);
  }

  const recipient = await prisma.user.findUnique({ where: { email: toEmail } });
  if (!recipient) throw new ApiError('کاربری با این ایمیل در سایت وجود ندارد.', 404, { fields: { toEmail: 'کاربر یافت نشد.' } });
  if (recipient.id === fromUser.id) throw new ApiError('نمی‌توانید سرور را به خودتان منتقل کنید.', 400, { fields: { toEmail: 'ایمیل خودتان است.' } });
  if (recipient.deletedAt) throw new ApiError('حساب این کاربر غیرفعال است.', 400, { fields: { toEmail: 'حساب غیرفعال است.' } });
  if (recipient.status !== 'ACTIVE') throw new ApiError('حساب گیرنده هنوز فعال نشده است.', 400, { fields: { toEmail: 'حساب گیرنده فعال نیست.' } });

  // درخواست فعال تکراری برای همین سرور نباشد
  const existing = await prisma.serverTransfer.findFirst({
    where: { serverId, status: 'PENDING' },
  });
  if (existing) {
    throw new ApiError('برای این سرور یک درخواست انتقال در حال انتظار وجود دارد. ابتدا آن را لغو کنید.', 409);
  }

  const transfer = await prisma.serverTransfer.create({
    data: {
      serverId,
      fromUserId: fromUser.id,
      toUserId: recipient.id,
      note: params.note?.slice(0, 500) || null,
      expiresAt: new Date(Date.now() + TRANSFER_TTL_HOURS * 3600_000),
    },
  });

  await audit({
    userId: fromUser.id,
    action: 'server.transfer.create',
    entity: 'server',
    entityId: serverId,
    meta: { transferId: transfer.id, toUserId: recipient.id, toEmail },
  });

  await notify(recipient.id, {
    kind: 'server',
    type: 'info',
    title: 'درخواست انتقال سرور برای شما',
    body: `${fromUser.email} می‌خواهد سرور «${server.name}» را به شما منتقل کند. برای پذیرش یا رد به بخش «انتقال‌ها» بروید.`,
    link: '/dashboard/transfers',
  });

  const toName = [recipient.firstName, recipient.lastName].filter(Boolean).join(' ') || recipient.email;
  return { id: transfer.id, toName };
}

/** لغو درخواست توسط فرستنده */
export async function cancelTransfer(transferId: string, user: SessionUser): Promise<void> {
  const transfer = await prisma.serverTransfer.findUnique({ where: { id: transferId } });
  if (!transfer) throw new ApiError('درخواست انتقال یافت نشد.', 404);
  if (transfer.fromUserId !== user.id) throw new ApiError('این درخواست متعلق به شما نیست.', 403);
  if (transfer.status !== 'PENDING') throw new ApiError('این درخواست دیگر در حال انتظار نیست.', 409);

  await prisma.serverTransfer.update({
    where: { id: transferId },
    data: { status: 'CANCELED', respondedAt: new Date() },
  });

  await audit({ userId: user.id, action: 'server.transfer.cancel', entity: 'server', entityId: transfer.serverId, meta: { transferId } });
}

/** رد درخواست توسط گیرنده */
export async function rejectTransfer(transferId: string, user: SessionUser): Promise<void> {
  const transfer = await prisma.serverTransfer.findUnique({ where: { id: transferId } });
  if (!transfer) throw new ApiError('درخواست انتقال یافت نشد.', 404);
  if (transfer.toUserId !== user.id) throw new ApiError('این درخواست برای شما نیست.', 403);
  if (transfer.status !== 'PENDING') throw new ApiError('این درخواست دیگر در حال انتظار نیست.', 409);

  await prisma.serverTransfer.update({
    where: { id: transferId },
    data: { status: 'REJECTED', respondedAt: new Date() },
  });

  const server = await prisma.server.findUnique({ where: { id: transfer.serverId }, select: { name: true } });
  await notify(transfer.fromUserId, {
    kind: 'server',
    type: 'warning',
    title: 'درخواست انتقال سرور رد شد',
    body: `گیرنده درخواست انتقال سرور «${server?.name ?? ''}» را رد کرد.`,
    link: '/dashboard/transfers',
  });

  await audit({ userId: user.id, action: 'server.transfer.reject', entity: 'server', entityId: transfer.serverId, meta: { transferId } });
}

/** پذیرش درخواست توسط گیرنده — انتقال واقعی مالکیت */
export async function acceptTransfer(transferId: string, user: SessionUser): Promise<{ serverId: string; serverName: string }> {
  const transfer = await prisma.serverTransfer.findUnique({ where: { id: transferId } });
  if (!transfer) throw new ApiError('درخواست انتقال یافت نشد.', 404);
  if (transfer.toUserId !== user.id) throw new ApiError('این درخواست برای شما نیست.', 403);
  if (transfer.status !== 'PENDING') throw new ApiError('این درخواست دیگر در حال انتظار نیست.', 409);
  if (transfer.expiresAt < new Date()) {
    await prisma.serverTransfer.update({ where: { id: transferId }, data: { status: 'EXPIRED', respondedAt: new Date() } });
    throw new ApiError('این درخواست منقضی شده است. از فرستنده بخواهید دوباره درخواست دهد.', 410);
  }

  const server = await prisma.server.findUnique({ where: { id: transfer.serverId } });
  if (!server) throw new ApiError('سرور دیگر وجود ندارد.', 404);
  if (server.deletedAt || server.status === 'DELETED') throw new ApiError('این سرور حذف شده است.', 410);
  if (server.userId !== transfer.fromUserId) {
    // مالکیت از زمان درخواست عوض شده (مثلاً انتقال دیگری زودتر انجام شده)
    await prisma.serverTransfer.update({ where: { id: transferId }, data: { status: 'CANCELED', respondedAt: new Date() } });
    throw new ApiError('این سرور دیگر در اختیار فرستنده نیست.', 409);
  }

  // سقف تعداد سرور گیرنده بررسی می‌شود
  const recipient = await prisma.user.findUnique({ where: { id: user.id }, select: { maxServers: true, email: true } });
  if (!recipient) throw new ApiError('کاربر یافت نشد.', 404);
  const activeCount = await prisma.server.count({
    where: { userId: user.id, deletedAt: null, status: { notIn: ['DELETED'] } },
  });
  if (activeCount >= recipient.maxServers) {
    throw new ApiError(`سقف تعداد سرور شما (${recipient.maxServers} عدد) پر است؛ نمی‌توانید سرور جدیدی بپذیرید.`, 409);
  }

  const fromUserId = transfer.fromUserId;

  // انتقال اتمی مالکیت سرور و همه رکوردهای وابسته
  await prisma.$transaction(async (tx) => {
    // کلیدهای SSH متعلق به مالک قبلی بودند؛ لیست را خالی می‌کنیم تا گمراه‌کننده نباشد
    await tx.server.update({
      where: { id: server.id },
      data: {
        userId: user.id,
        sshKeyIds: [],
        meta: { ...(server.meta as object), transferredFrom: fromUserId, transferredAt: new Date().toISOString() },
      },
    });
    await tx.serverAction.updateMany({ where: { serverId: server.id }, data: { userId: user.id } });
    await tx.snapshot.updateMany({ where: { serverId: server.id }, data: { userId: user.id } });
    await tx.serverMonitor.updateMany({ where: { serverId: server.id }, data: { userId: user.id } });
    await tx.serverIpChange.updateMany({ where: { serverId: server.id }, data: { userId: user.id } });
    await tx.floatingIp.updateMany({ where: { serverId: server.id }, data: { userId: user.id } });
    await tx.serverTransfer.update({
      where: { id: transferId },
      data: { status: 'ACCEPTED', respondedAt: new Date() },
    });
    // درخواست‌های در انتظار دیگرِ همین سرور بی‌اعتبار می‌شوند
    await tx.serverTransfer.updateMany({
      where: { serverId: server.id, status: 'PENDING', id: { not: transferId } },
      data: { status: 'CANCELED', respondedAt: new Date() },
    });
  });

  await audit({
    userId: user.id,
    action: 'server.transfer.accept',
    entity: 'server',
    entityId: server.id,
    meta: { transferId, fromUserId, toUserId: user.id },
  });

  await notify(fromUserId, {
    kind: 'server',
    type: 'success',
    title: 'انتقال سرور انجام شد',
    body: `سرور «${server.name}» به ${recipient.email} منتقل شد و دیگر در حساب شما نیست.`,
  });
  await notify(user.id, {
    kind: 'server',
    type: 'success',
    title: 'سرور جدید به حساب شما اضافه شد',
    body: `سرور «${server.name}» با موفقیت به شما منتقل شد. هزینه‌های بعدی از کیف پول شما کسر می‌شود.`,
    link: `/dashboard/servers/${server.id}`,
  });

  return { serverId: server.id, serverName: server.name };
}

/** فهرست درخواست‌های ورودی و خروجی کاربر */
export async function listTransfers(userId: string) {
  const [incoming, outgoing] = await Promise.all([
    prisma.serverTransfer.findMany({
      where: { toUserId: userId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: {
        server: { select: { id: true, name: true, serverTypeName: true, locationName: true } },
        fromUser: { select: { email: true, firstName: true, lastName: true } },
      },
    }),
    prisma.serverTransfer.findMany({
      where: { fromUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        server: { select: { id: true, name: true } },
        toUser: { select: { email: true, firstName: true, lastName: true } },
      },
    }),
  ]);
  return { incoming, outgoing };
}

/** منقضی کردن درخواست‌های قدیمی — برای کار زمان‌بندی‌شده */
export async function expireStaleTransfers(): Promise<number> {
  const res = await prisma.serverTransfer.updateMany({
    where: { status: 'PENDING', expiresAt: { lt: new Date() } },
    data: { status: 'EXPIRED', respondedAt: new Date() },
  });
  return res.count;
}
