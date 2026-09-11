import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireUser, clientIp, clientUserAgent, assertSameOrigin } from '@/lib/auth';
import { clientForServer } from '@/lib/hetzner-accounts';
import { keyIdsForServer } from '@/lib/ssh-sync';
import { getOwnedServer, assertOperable } from '@/lib/server-access';
import { serverActionSchema } from '@/lib/validation';
import type { HAction } from '@/lib/hetzner';
import { enforceRateLimit, LIMITS } from '@/lib/rate-limit';
import { encrypt } from '@/lib/crypto';
import { audit } from '@/lib/audit';
import { syncServer } from '@/lib/provisioning';
import { SERVER_ACTION_FA } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** تاریخچه عملیات سرور */
export const GET = route(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const server = await getOwnedServer(id, user, { allowDeleted: true });

  const actions = await prisma.serverAction.findMany({
    where: { serverId: server.id },
    orderBy: { createdAt: 'desc' },
    take: 40,
  });

  return ok({
    items: actions.map((a) => ({
      ...a,
      label: SERVER_ACTION_FA[a.action] ?? a.action,
    })),
  });
});

export const POST = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireUser();
  const { id } = await ctx.params;

  await enforceRateLimit(`server-action:${user.id}`, LIMITS.serverAction.limit, LIMITS.serverAction.window);

  const server = await getOwnedServer(id, user, { requireHetzner: true });
  const { action } = await parseBody(req, serverActionSchema);

  // در حالت تعلیق فقط اجازه خاموش کردن می‌دهیم
  if (server.status === 'SUSPENDED' && action !== 'poweroff') {
    throw new ApiError('سرور تعلیق است. برای استفاده مجدد کیف پول خود را شارژ کنید.', 409, { code: 'suspended' });
  }
  if (server.status !== 'SUSPENDED') assertOperable(server);

  const client = await clientForServer(server);
  const hid = server.hetznerId!;

  let hAction: HAction | undefined;
  let rootPassword: string | undefined;

  switch (action) {
    case 'poweron':
      hAction = (await client.powerOn(hid)).action;
      break;
    case 'poweroff':
      hAction = (await client.powerOff(hid)).action;
      break;
    case 'shutdown':
      hAction = (await client.shutdown(hid)).action;
      break;
    case 'reboot':
      hAction = (await client.reboot(hid)).action;
      break;
    case 'reset':
      hAction = (await client.reset(hid)).action;
      break;
    case 'reset_password': {
      const res = await client.resetPassword(hid);
      hAction = res.action;
      rootPassword = res.root_password;
      await prisma.server.update({
        where: { id: server.id },
        data: { rootPasswordEnc: encrypt(res.root_password) },
      });
      break;
    }
    case 'enable_rescue': {
      const keyIds = Array.isArray(server.sshKeyIds) ? (server.sshKeyIds as string[]) : [];
      const remoteIds = await keyIdsForServer(keyIds, server.hetznerAccountId);
      const res = await client.enableRescue(hid, remoteIds);
      hAction = res.action;
      rootPassword = res.root_password;
      await prisma.server.update({ where: { id: server.id }, data: { rescueMode: 'linux64' } });
      break;
    }
    case 'disable_rescue':
      hAction = (await client.disableRescue(hid)).action;
      await prisma.server.update({ where: { id: server.id }, data: { rescueMode: null } });
      break;
    case 'enable_backup':
      hAction = (await client.enableBackup(hid)).action;
      await prisma.server.update({ where: { id: server.id }, data: { backupsEnabled: true } });
      break;
    case 'disable_backup':
      hAction = (await client.disableBackup(hid)).action;
      await prisma.server.update({ where: { id: server.id }, data: { backupsEnabled: false } });
      break;
    case 'detach_iso':
      hAction = (await client.detachIso(hid)).action;
      await prisma.server.update({ where: { id: server.id }, data: { isoName: null } });
      break;
    default:
      throw new ApiError('عملیات نامعتبر است.', 400);
  }

  await prisma.serverAction.create({
    data: {
      serverId: server.id,
      userId: user.id,
      action,
      hetznerActionId: hAction ? BigInt(hAction.id) : null,
      status: hAction?.status === 'error' ? 'ERROR' : hAction?.status === 'success' ? 'SUCCESS' : 'RUNNING',
      error: hAction?.error?.message ?? null,
    },
  });

  await audit({
    userId: user.id,
    action: 'server.action',
    entity: 'server',
    entityId: server.id,
    ip: await clientIp(),
    userAgent: await clientUserAgent(),
    meta: { operation: action },
  });

  // برای عملیات سریع، وضعیت را فوراً به‌روز کن
  if (['poweron', 'poweroff', 'shutdown', 'reboot', 'reset'].includes(action)) {
    void syncServer(server.id).catch(() => null);
  }

  return ok({
    action,
    label: SERVER_ACTION_FA[action] ?? action,
    actionId: hAction?.id ?? null,
    status: hAction?.status ?? 'running',
    rootPassword: rootPassword ?? null,
    message: successMessage(action),
  });
});

function successMessage(action: string): string {
  const messages: Record<string, string> = {
    poweron: 'دستور روشن کردن سرور ارسال شد.',
    poweroff: 'دستور قطع برق سرور ارسال شد.',
    shutdown: 'دستور خاموش کردن نرم ارسال شد. اگر سیستم‌عامل پاسخ ندهد، از «قطع برق» استفاده کنید.',
    reboot: 'دستور راه‌اندازی مجدد ارسال شد.',
    reset: 'دستور ریست سخت ارسال شد.',
    reset_password: 'رمز روت جدید ساخته شد. آن را در جای امنی ذخیره کنید.',
    enable_rescue: 'حالت نجات فعال شد. برای ورود به آن، سرور را ریست کنید.',
    disable_rescue: 'حالت نجات غیرفعال شد.',
    enable_backup: 'پشتیبان‌گیری خودکار فعال شد. هزینه آن ۲۰٪ قیمت سرور است.',
    disable_backup: 'پشتیبان‌گیری خودکار غیرفعال شد و نسخه‌های پشتیبان موجود حذف می‌شوند.',
    detach_iso: 'ISO از سرور جدا شد.',
  };
  return messages[action] ?? 'عملیات انجام شد.';
}
