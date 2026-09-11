import prisma from './prisma';
import { ApiError } from './errors';
import type { SessionUser } from './auth';
import type { Server } from '@prisma/client';

/**
 * بارگذاری سرور با بررسی مالکیت.
 * مدیر و پشتیبان به همه سرورها دسترسی دارند.
 */
export async function getOwnedServer(
  serverId: string,
  user: SessionUser,
  opts: { allowDeleted?: boolean; requireHetzner?: boolean } = {},
): Promise<Server> {
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) throw new ApiError('سرور یافت نشد.', 404, { code: 'not_found' });

  const isStaff = user.role === 'ADMIN' || user.role === 'SUPPORT';
  if (!isStaff && server.userId !== user.id) {
    throw new ApiError('به این سرور دسترسی ندارید.', 403, { code: 'forbidden' });
  }

  if (!opts.allowDeleted && (server.status === 'DELETED' || server.deletedAt)) {
    throw new ApiError('این سرور حذف شده است.', 410, { code: 'deleted' });
  }

  if (opts.requireHetzner && !server.hetznerId) {
    throw new ApiError('سرور هنوز در حال آماده‌سازی است. چند لحظه دیگر تلاش کنید.', 409, { code: 'provisioning' });
  }

  return server;
}

/** بررسی اینکه سرور در وضعیتی هست که بتوان عملیات انجام داد */
export function assertOperable(server: Server) {
  if (server.status === 'SUSPENDED') {
    throw new ApiError('این سرور تعلیق شده است. برای رفع تعلیق کیف پول خود را شارژ کنید.', 409, {
      code: 'suspended',
    });
  }
  if (server.status === 'PROVISIONING') {
    throw new ApiError('سرور هنوز در حال ساخت است. چند لحظه دیگر تلاش کنید.', 409, { code: 'provisioning' });
  }
  if (server.status === 'DELETING' || server.status === 'DELETED') {
    throw new ApiError('این سرور در حال حذف است.', 409, { code: 'deleting' });
  }
}
