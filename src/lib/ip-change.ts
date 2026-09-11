import prisma from './prisma';
import type { Server } from '@prisma/client';
import { HetznerError, deletePrimaryIpWithRetry, type HPrimaryIp } from './hetzner';
import { clientForServer } from './hetzner-accounts';
import { getSettings } from './settings';
import { debit, credit, canAfford } from './wallet';
import { ApiError } from './errors';
import { audit } from './audit';
import { notify, notifyStaff } from './notify';
import { formatToman } from './money';
import { syncServer } from './provisioning';
import { recordPrefixResult } from './ip-prefix';

/**
 * تعویض آدرس IPv4 سرور.
 *
 * چرا لازم است: آدرس سرورهای خارج از کشور برای کاربران ایرانی زود مسدود می‌شود.
 * به جای ساخت سرور جدید و از دست دادن داده‌ها، فقط آدرس عوض می‌شود.
 *
 * روش کار (Primary IP API هتزنر):
 *   ۱. آدرس تازه در همان دیتاسنتر رزرو می‌شود
 *   ۲. سرور خاموش می‌شود (هتزنر برای جدا کردن آدرس این را لازم دارد)
 *   ۳. آدرس قدیمی جدا و آدرس جدید متصل می‌شود
 *   ۴. سرور به وضعیت قبلی برمی‌گردد
 *   ۵. آدرس قدیمی آزاد می‌شود تا هزینه‌ای نداشته باشد
 *
 * اگر هر مرحله شکست بخورد، تلاش می‌شود سرور به وضعیت قبل برگردد و وجه بازگردد.
 */

export type IpChangeResult = {
  id: string;
  oldIp: string | null;
  newIp: string;
  fee: bigint;
  downtimeSeconds: number;
};

/** وضعیت و شرایط تعویض آدرس برای نمایش در پنل */
export async function ipChangeStatus(server: Server) {
  const settings = await getSettings();

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [usedThisMonth, history] = await Promise.all([
    prisma.serverIpChange.count({
      where: {
        serverId: server.id,
        status: 'SUCCESS',
        countsToQuota: true,
        startedAt: { gte: monthStart },
      },
    }),
    prisma.serverIpChange.findMany({
      where: { serverId: server.id },
      orderBy: { startedAt: 'desc' },
      take: 20,
    }),
  ]);

  const inProgress = history.some((h) => h.status === 'RUNNING' || h.status === 'PENDING');
  const remaining = Math.max(0, settings.ipChangeMaxPerMonth - usedThisMonth);

  // پنجره رایگان پس از ساخت: فیلترینگ ایران روزبه‌روز عوض می‌شود، پس روزهای اول
  // تعویض نباید هزینه یا سهمیه داشته باشد.
  const freeUntil =
    settings.ipChangeFreeHours > 0 && server.provisionedAt
      ? new Date(server.provisionedAt.getTime() + settings.ipChangeFreeHours * 3600_000)
      : null;
  const isFree = Boolean(freeUntil && freeUntil.getTime() > Date.now());
  const fee = isFree ? 0n : BigInt(settings.ipChangeFee);

  const blockers: string[] = [];
  if (!settings.ipChangeEnabled) blockers.push('تعویض آدرس در حال حاضر غیرفعال است.');
  if (!server.ipv4) blockers.push('این سرور آدرس IPv4 ندارد.');
  if (server.status === 'SUSPENDED') blockers.push('سرور تعلیق شده است.');
  if (server.status === 'PROVISIONING') blockers.push('سرور هنوز در حال ساخت است.');
  if (server.status === 'DELETED' || server.deletedAt) blockers.push('این سرور حذف شده است.');
  if (inProgress) blockers.push('یک درخواست تعویض آدرس در حال انجام است.');
  // در پنجره رایگان، سقف ماهانه مانع نمی‌شود
  if (!isFree && settings.ipChangeMaxPerMonth > 0 && remaining <= 0) {
    blockers.push(`سقف ${settings.ipChangeMaxPerMonth} بار تعویض در ماه برای این سرور پر شده است.`);
  }

  return {
    enabled: settings.ipChangeEnabled,
    fee: Number(fee),
    normalFee: Number(settings.ipChangeFee),
    free: isFree,
    freeUntil,
    freeHours: settings.ipChangeFreeHours,
    maxPerMonth: settings.ipChangeMaxPerMonth,
    usedThisMonth,
    remaining: settings.ipChangeMaxPerMonth > 0 ? remaining : null,
    currentIp: server.ipv4,
    reachState: server.ipReachState,
    reachCheckedAt: server.ipCheckedAt,
    autoSwaps: server.ipAutoSwaps,
    canChange: blockers.length === 0,
    blockers,
    estimatedDowntimeSeconds: 90,
    history: history.map((h) => ({
      id: h.id,
      oldIp: h.oldIp,
      newIp: h.newIp,
      status: h.status,
      fee: Number(h.fee),
      refunded: h.refunded,
      automatic: h.automatic,
      error: h.error,
      startedAt: h.startedAt,
      finishedAt: h.finishedAt,
    })),
  };
}

export async function changeServerIp(params: {
  server: Server;
  userId: string;
  reason?: string;
  ip?: string;
  userAgent?: string;
  /**
   * تعویض به ابتکار خود پنل، نه درخواست کاربر — مثل وقتی آدرس تازه از ایران
   * باز نمی‌شود. رایگان است، سهمیه ماهانه را مصرف نمی‌کند و وضعیت «در حال
   * ساخت» را هم مانع نمی‌داند.
   */
  automatic?: boolean;
}): Promise<IpChangeResult> {
  const { server, automatic = false } = params;

  // ── بررسی شرایط ──
  const status = await ipChangeStatus(server);
  if (!status.canChange) {
    // تعویض خودکار فقط پیش از دو مانع واقعی می‌ایستد: نبود آدرس و درخواست در جریان
    const hardBlockers = status.blockers.filter(
      (b) => b.includes('IPv4 ندارد') || b.includes('در حال انجام') || b.includes('حذف شده'),
    );
    if (!automatic || hardBlockers.length) {
      throw new ApiError(
        (automatic ? hardBlockers[0] : status.blockers[0]) ?? 'در حال حاضر امکان تعویض آدرس نیست.',
        409,
        { code: 'not_allowed' },
      );
    }
  }
  if (!server.hetznerId) {
    throw new ApiError('این سرور هنوز در زیرساخت ثبت نشده است.', 409, { code: 'provisioning' });
  }

  const fee = automatic ? 0n : BigInt(status.fee);
  if (fee > 0n && !(await canAfford(params.userId, fee))) {
    throw new ApiError(
      `برای تعویض آدرس باید ${formatToman(fee)} موجودی داشته باشید. کیف پول خود را شارژ کنید.`,
      402,
      { code: 'insufficient_funds' },
    );
  }

  const client = await clientForServer(server);
  const startedAt = Date.now();

  // ── ثبت درخواست ──
  const record = await prisma.serverIpChange.create({
    data: {
      serverId: server.id,
      userId: params.userId,
      accountId: server.hetznerAccountId,
      oldIp: server.ipv4,
      oldIpId: server.primaryIpId,
      status: 'RUNNING',
      fee,
      automatic,
      countsToQuota: !automatic && fee > 0n,
      reason: params.reason?.slice(0, 200) ?? null,
    },
  });

  // ── کسر هزینه پیش از عملیات ──
  let chargeId: string | null = null;
  if (fee > 0n) {
    const tx = await debit({
      userId: params.userId,
      amount: fee,
      type: 'CHARGE',
      serverId: server.id,
      description: `تعویض آدرس IP سرور ${server.name}`,
      meta: { ipChangeId: record.id, oldIp: server.ipv4 },
    });
    chargeId = tx.id;
  }

  await prisma.server.update({ where: { id: server.id }, data: { status: 'MIGRATING' } });

  const wasRunning = server.status === 'RUNNING';
  let newPrimaryIp: HPrimaryIp | null = null;
  let oldIpId = server.primaryIpId ? Number(server.primaryIpId) : null;
  let detached = false;

  try {
    // ── شناسایی آدرس فعلی اگر ثبت نشده ──
    if (!oldIpId) {
      const current = await client.listPrimaryIps({ assignee_id: Number(server.hetznerId) });
      const ipv4 = current.find((p) => p.type === 'ipv4');
      oldIpId = ipv4?.id ?? null;
    }
    if (!oldIpId) {
      throw new ApiError('آدرس فعلی سرور در هتزنر پیدا نشد.', 500, { code: 'no_primary_ip' });
    }

    const datacenter = server.datacenterName ?? (await client.getServer(server.hetznerId)).datacenter.name;

    // ── ۱) رزرو آدرس جدید ──
    // auto_delete روشن است تا اگر روزی سرور حذف شد، هتزنر این آدرس را هم با آن
    // حذف کند و هزینه اضافه‌ای روی حساب نماند.
    const created = await client.createPrimaryIp({
      type: 'ipv4',
      name: `${server.name}-${Date.now().toString(36)}`.slice(0, 60),
      datacenter,
      auto_delete: true,
      labels: { panel: 'pasargad-mizban', server_id: server.id },
    });
    newPrimaryIp = created.primary_ip;

    // ── ۲) خاموش کردن سرور ──
    if (wasRunning) {
      await client.powerOff(server.hetznerId);
      await waitForStatus(client, server.hetznerId, 'off', 90_000);
    }

    // ── ۳) جابه‌جایی آدرس ──
    await client.unassignPrimaryIp(oldIpId);
    detached = true;

    const assignAction = await client.assignPrimaryIp(newPrimaryIp.id, server.hetznerId);
    await client.waitForAction(assignAction.action.id, 120_000).catch(() => null);

    // ── ۴) بازگشت به وضعیت قبل ──
    if (wasRunning) {
      await client.powerOn(server.hetznerId);
    }

    // ── ۵) آزاد کردن آدرس قدیمی ──
    // آدرس قدیمی اگر در هتزنر بماند، ماهانه هزینه دارد. پس چند بار تلاش می‌کنیم
    // و اگر باز هم نشد، جاروب دوره‌ای (cleanupOrphanIps) بعداً پاکش می‌کند و به
    // تیم هم خبر داده می‌شود تا چیزی پنهانی هزینه نسازد.
    const oldIpDeleted = await deletePrimaryIpWithRetry(client, oldIpId);
    if (!oldIpDeleted) {
      await notifyStaff({
        title: `آدرس قدیمی سرور ${server.name} از هتزنر حذف نشد`,
        body: `شناسه Primary IP: ${oldIpId} · آدرس: ${server.ipv4 ?? '—'}
جاروب ساعتی دوباره تلاش می‌کند؛ در صورت ماندن، از کنسول هتزنر دستی حذفش کنید.`,
        type: 'warning',
        wait: true,
      }).catch(() => null);
    }

    const downtimeSeconds = Math.round((Date.now() - startedAt) / 1000);

    await prisma.server.update({
      where: { id: server.id },
      data: {
        ipv4: newPrimaryIp.ip,
        primaryIpId: BigInt(newPrimaryIp.id),
        status: wasRunning ? 'RUNNING' : 'OFF',
      },
    });

    await prisma.serverIpChange.update({
      where: { id: record.id },
      data: {
        status: 'SUCCESS',
        newIp: newPrimaryIp.ip,
        newIpId: BigInt(newPrimaryIp.id),
        finishedAt: new Date(),
      },
    });

    // ── یادگیری: آدرس قبلی احتمالاً سوخته بوده ──
    // وقتی کاربر خودش آدرس را عوض می‌کند، تقریباً همیشه علتش مسدود بودن آن از
    // داخل ایران است. این مشاهده روی بلوک /24 ثبت می‌شود تا سرورهای بعدی روی
    // همان رنج تحویل داده نشوند. برای علامت خوردن یک بلوک، چند مشاهده لازم است.
    await recordPrefixResult({
      ip: server.ipv4,
      ok: false,
      locationName: server.locationName,
      datacenter: server.datacenterName,
    }).catch(() => null);

    // آدرس تازه هنوز آزمایش نشده؛ کار پس‌زمینه بررسی‌اش می‌کند
    await prisma.server
      .update({
        where: { id: server.id },
        data: { ipReachState: 'UNKNOWN', ipCheckRounds: 0, ipCheckedAt: null },
      })
      .catch(() => null);

    // پایش با آدرس جدید از نو شروع شود
    await prisma.serverMonitor
      .updateMany({
        where: { serverId: server.id },
        data: { status: 'UNKNOWN', consecutiveFails: 0, lastError: null, downSince: null },
      })
      .catch(() => null);

    void syncServer(server.id).catch(() => null);

    await audit({
      userId: params.userId,
      action: 'server.ip_change',
      entity: 'server',
      entityId: server.id,
      ip: params.ip,
      userAgent: params.userAgent,
      meta: { oldIp: server.ipv4, newIp: newPrimaryIp.ip, fee: fee.toString(), downtimeSeconds },
    });

    await notify(params.userId, {
      kind: 'server',
      type: 'success',
      title: `آدرس سرور ${server.name} تعویض شد`,
      body: [
        `آدرس جدید: ${newPrimaryIp.ip}`,
        server.ipv4 ? `آدرس قبلی: ${server.ipv4}` : '',
        'حتماً تنظیمات DNS و اتصال‌های خود را با آدرس جدید به‌روز کنید.',
      ]
        .filter(Boolean)
        .join('\n'),
      link: `/dashboard/servers/${server.id}`,
      email: true,
      urgent: true,
    });

    return {
      id: record.id,
      oldIp: server.ipv4,
      newIp: newPrimaryIp.ip,
      fee,
      downtimeSeconds,
    };
  } catch (err) {
    const message =
      err instanceof HetznerError || err instanceof ApiError
        ? err.message
        : 'تعویض آدرس با خطای غیرمنتظره مواجه شد.';

    // ── تلاش برای بازگرداندن وضعیت ──
    try {
      if (detached && oldIpId) {
        // آدرس قدیمی جدا شده ولی جدید وصل نشده — قدیمی را برگردان
        const stillFree = await client
          .getPrimaryIp(oldIpId)
          .then((p) => p.assignee_id === null)
          .catch(() => false);
        if (stillFree) {
          await client.assignPrimaryIp(oldIpId, server.hetznerId!).catch(() => null);
        }
      }
      if (newPrimaryIp && newPrimaryIp.assignee_id === null) {
        await client.deletePrimaryIp(newPrimaryIp.id).catch(() => null);
      }
      if (wasRunning) {
        await client.powerOn(server.hetznerId!).catch(() => null);
      }
    } catch (restoreErr) {
      console.error('[ip-change] بازگرداندن وضعیت ناموفق بود:', restoreErr);
    }

    // ── بازگشت وجه ──
    if (chargeId && fee > 0n) {
      await credit({
        userId: params.userId,
        amount: fee,
        type: 'REFUND',
        serverId: server.id,
        description: `بازگشت هزینه تعویض ناموفق آدرس سرور ${server.name}`,
        meta: { ipChangeId: record.id, originalTransaction: chargeId },
      }).catch(() => null);
    }

    await prisma.serverIpChange.update({
      where: { id: record.id },
      data: { status: 'FAILED', error: message.slice(0, 500), refunded: fee > 0n, finishedAt: new Date() },
    });

    await prisma.server.update({
      where: { id: server.id },
      data: { status: wasRunning ? 'RUNNING' : 'OFF' },
    });

    void syncServer(server.id).catch(() => null);

    await notify(params.userId, {
      kind: 'server',
      type: 'error',
      title: `تعویض آدرس سرور ${server.name} انجام نشد`,
      body: `${message} ${fee > 0n ? 'مبلغ پرداختی به کیف پول شما بازگردانده شد.' : ''}`.trim(),
      link: `/dashboard/servers/${server.id}`,
      email: true,
    });

    throw err instanceof ApiError ? err : new ApiError(message, 502, { code: 'ip_change_failed' });
  }
}

/** انتظار تا رسیدن سرور به وضعیت مشخص */
async function waitForStatus(
  client: Awaited<ReturnType<typeof clientForServer>>,
  hetznerId: bigint,
  target: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let delay = 2000;
  for (;;) {
    const server = await client.getServer(hetznerId).catch(() => null);
    if (server?.status === target) return;
    if (Date.now() > deadline) {
      throw new ApiError(`سرور در مهلت مقرر ${target === 'off' ? 'خاموش' : target} نشد.`, 504, { code: 'timeout' });
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.3, 6000);
  }
}
