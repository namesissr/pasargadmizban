import prisma from './prisma';
import type { Prisma, Server } from '@prisma/client';
import { HetznerError, deletePrimaryIpWithRetry, type HServer, type HetznerClient } from './hetzner';
import {
  candidateAccounts,
  clientForServer,
  markLimitReached,
  markAccountError,
  noteServerCreated,
  noteServerDeleted,
  accountToken,
} from './hetzner-accounts';
import { ensureKeysOnAccount } from './ssh-sync';
import { refreshUserLoyalty } from './loyalty';
import { HetznerClient as HClient } from './hetzner';
import { priceFor, backupPrice, HOURS_PER_MONTH } from './pricing';
import { getSettings } from './settings';
import { isAvailable, pickDatacenter } from './catalog';
import { debit, credit, canAfford, InsufficientFundsError, txRef } from './wallet';
import { encrypt } from './crypto';
import { ApiError } from './errors';
import { audit } from './audit';
import { notify, notifyStaff } from './notify';
import { sendMail, serverReadyTemplate } from './mail';
import { findTemplate, templateCompatible } from './app-templates';
import { suggestedPort } from './monitoring';

/**
 * ساخت، همگام‌سازی و حذف سرور.
 * تمام تغییرات مالی داخل همین ماژول و از طریق wallet انجام می‌شود تا
 * هیچ سروری بدون پرداخت ساخته نشود و هیچ پولی بدون سرور کسر نشود.
 */

export type ProvisionInput = {
  userId: string;
  name: string;
  serverType: string;
  location: string;
  image: string;
  billingCycle: 'HOURLY' | 'MONTHLY';
  months?: number;
  sshKeyIds?: string[];
  enableBackups?: boolean;
  enableIpv4?: boolean;
  userData?: string;
  label?: string;
  /** شناسه قالب نصب یک‌کلیکه */
  appTemplate?: string;
  /** فعال‌سازی خودکار پایش در دسترس بودن */
  enableMonitoring?: boolean;
  ip?: string;
  userAgent?: string;
};

/** نگاشت وضعیت هتزنر به وضعیت داخلی */
export function mapHetznerStatus(hStatus: string): Server['status'] {
  switch (hStatus) {
    case 'running':
      return 'RUNNING';
    case 'off':
    case 'stopping':
      return 'OFF';
    case 'initializing':
    case 'starting':
      return 'PROVISIONING';
    case 'rebuilding':
      return 'REBUILDING';
    case 'migrating':
      return 'MIGRATING';
    case 'deleting':
      return 'DELETING';
    case 'unknown':
    default:
      return 'ERROR';
  }
}

/** محاسبه مبلغی که باید هنگام ساخت کسر یا رزرو شود */
export async function quoteServer(input: {
  userId: string;
  serverType: string;
  location: string;
  billingCycle: 'HOURLY' | 'MONTHLY';
  months?: number;
  enableBackups?: boolean;
  userDiscountPct?: number;
}) {
  const settings = await getSettings();
  const price = await priceFor(input.serverType, input.location, input.userId, input.userDiscountPct ?? 0);
  const backup = backupPrice(price);

  const months = Math.max(1, Math.min(12, input.months ?? 1));
  const withBackup = input.enableBackups ?? false;

  const hourly = price.hourly + (withBackup ? backup.hourly : 0n);
  const monthly = price.monthly + (withBackup ? backup.monthly : 0n);

  if (input.billingCycle === 'MONTHLY') {
    return {
      price,
      backup,
      hourly,
      monthly,
      /** مبلغی که همین حالا کسر می‌شود */
      dueNow: monthly * BigInt(months),
      months,
      /** حداقل موجودی لازم */
      minBalance: monthly * BigInt(months),
      prepayHours: 0,
    };
  }

  const prepayHours = settings.hourlyPrepayHours;
  return {
    price,
    backup,
    hourly,
    monthly,
    // در حالت ساعتی، اولین ساعت بلافاصله کسر می‌شود
    dueNow: hourly,
    months: 0,
    minBalance: hourly * BigInt(Math.max(1, prepayHours)),
    prepayHours,
  };
}

export async function provisionServer(input: ProvisionInput): Promise<Server> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, firstName: true, lastName: true, discountPct: true, loyaltyPct: true, maxServers: true, status: true, role: true },
  });
  if (!user) throw new ApiError('کاربر یافت نشد.', 404);
  if (user.status !== 'ACTIVE') {
    throw new ApiError('برای ساخت سرور ابتدا حساب کاربری خود را فعال کنید.', 403);
  }

  // ── بررسی سقف تعداد سرور ──
  const activeCount = await prisma.server.count({
    where: { userId: user.id, deletedAt: null, status: { notIn: ['DELETED'] } },
  });
  if (activeCount >= user.maxServers) {
    throw new ApiError(`سقف تعداد سرور شما (${user.maxServers} عدد) پر شده است. برای افزایش با پشتیبانی تماس بگیرید.`, 403);
  }

  // ── نام تکراری ──
  // سرورهای حذف‌شده یا ناموفق نباید نام را اشغال کنند
  const duplicate = await prisma.server.findFirst({
    where: { userId: user.id, name: input.name, deletedAt: null, status: { notIn: ['DELETED'] } },
    select: { id: true },
  });
  if (duplicate) {
    throw new ApiError('سروری با این نام از قبل دارید. نام دیگری انتخاب کنید.', 409, {
      fields: { name: 'این نام قبلاً استفاده شده است.' },
    });
  }

  // ── اعتبارسنجی کاتالوگ ──
  const [serverType, location, image] = await Promise.all([
    prisma.hetznerServerType.findUnique({ where: { name: input.serverType } }),
    prisma.hetznerLocation.findUnique({ where: { name: input.location } }),
    prisma.hetznerImage.findFirst({ where: { OR: [{ name: input.image }, { description: input.image }] } }),
  ]);

  if (!serverType || !serverType.enabled) throw new ApiError('پلن انتخابی در دسترس نیست.', 400);
  if (!location || !location.enabled) throw new ApiError('لوکیشن انتخابی در دسترس نیست.', 400);
  if (!image || !image.enabled) throw new ApiError('سیستم‌عامل انتخابی در دسترس نیست.', 400);

  if (image.architecture !== serverType.architecture) {
    throw new ApiError(
      `سیستم‌عامل «${image.description}» با معماری ${serverType.architecture.toUpperCase()} این پلن سازگار نیست.`,
      400,
    );
  }

  if (!(await isAvailable(input.serverType, input.location))) {
    throw new ApiError('این پلن در لوکیشن انتخابی موجودی ندارد. لوکیشن یا پلن دیگری انتخاب کنید.', 409);
  }

  // ── قالب نصب یک‌کلیکه ──
  const template = findTemplate(input.appTemplate);
  if (template) {
    const compat = templateCompatible(template, {
      memory: serverType.memory,
      architecture: serverType.architecture,
      osFlavor: image.osFlavor,
    });
    if (!compat.ok) throw new ApiError(compat.reason ?? 'این قالب با انتخاب شما سازگار نیست.', 400);
  }

  // ── قیمت‌گذاری ──
  const quote = await quoteServer({
    userId: user.id,
    serverType: input.serverType,
    location: input.location,
    billingCycle: input.billingCycle,
    months: input.months,
    enableBackups: input.enableBackups,
    // تخفیف مؤثر: دستی یا سطح باشگاه، هر کدام بیشتر است
    userDiscountPct: Math.max(user.discountPct, user.loyaltyPct),
  });

  if (!(await canAfford(user.id, quote.minBalance))) {
    throw new ApiError(
      input.billingCycle === 'HOURLY'
        ? `برای ساخت سرور ساعتی باید حداقل معادل ${quote.prepayHours} ساعت اعتبار داشته باشید. کیف پول خود را شارژ کنید.`
        : 'موجودی کیف پول برای پرداخت هزینه این سرور کافی نیست. کیف پول خود را شارژ کنید.',
      402,
      { code: 'insufficient_funds' },
    );
  }

  // ── کلیدهای SSH ──
  const sshKeys = input.sshKeyIds?.length
    ? await prisma.sshKey.findMany({
        where: { id: { in: input.sshKeyIds }, userId: user.id },
      })
    : [];

  // ── انتخاب حساب هتزنر دارای ظرفیت ──
  const accounts = await candidateAccounts();
  if (!accounts.length) {
    const total = await prisma.hetznerAccount.count();
    throw new ApiError(
      total === 0
        ? 'هنوز هیچ حساب هتزنری در پنل تنظیم نشده است. با پشتیبانی تماس بگیرید.'
        : 'ظرفیت ساخت سرور در حال حاضر تکمیل است. کمی بعد تلاش کنید یا با پشتیبانی تماس بگیرید.',
      503,
      { code: 'no_capacity' },
    );
  }

  const datacenter = await pickDatacenter(input.serverType, input.location);
  const months = quote.months || 1;

  // اسکریپت راه‌اندازی: قالب انتخابی، و اگر کاربر اسکریپت خودش را داده، آن اولویت دارد
  const cloudInit = input.userData?.trim()
    ? input.userData
    : template
      ? template.cloudInit({ hostname: input.name })
      : undefined;

  // ── ثبت اولیه در دیتابیس ──
  const server = await prisma.server.create({
    data: {
      userId: user.id,
      name: input.name,
      label: input.label || null,
      serverTypeName: serverType.name,
      locationName: location.name,
      datacenterName: datacenter,
      imageName: image.name ?? image.description,
      imageLabel: image.description,
      billingCycle: input.billingCycle,
      status: 'PROVISIONING',
      cores: serverType.cores,
      memory: serverType.memory,
      disk: serverType.disk,
      includedTraffic: serverType.includedTraffic,
      priceHourly: quote.price.hourly,
      priceMonthly: quote.price.monthly,
      backupsEnabled: Boolean(input.enableBackups),
      backupPriceHourly: quote.backup.hourly,
      backupPriceMonthly: quote.backup.monthly,
      sshKeyIds: sshKeys.map((k) => k.id),
      expiresAt:
        input.billingCycle === 'MONTHLY'
          ? new Date(Date.now() + months * 30 * 24 * 3600_000)
          : null,
      lastBilledAt: new Date(),
      appTemplate: template?.slug ?? null,
      meta: { requestedMonths: months },
    },
  });

  // ── کسر هزینه (قبل از ساخت واقعی، تا سرور مجانی ساخته نشود) ──
  let chargeTxId: string | null = null;
  try {
    const tx = await debit({
      userId: user.id,
      amount: quote.dueNow,
      type: 'CHARGE',
      serverId: server.id,
      description:
        input.billingCycle === 'MONTHLY'
          ? `هزینه ${months} ماه سرور ${server.name} (${serverType.name} / ${location.name})`
          : `هزینه اولین ساعت سرور ${server.name} (${serverType.name} / ${location.name})`,
      meta: { serverType: serverType.name, location: location.name, cycle: input.billingCycle, months },
    });
    chargeTxId = tx.id;
  } catch (err) {
    await prisma.server.delete({ where: { id: server.id } }).catch(() => null);
    if (err instanceof InsufficientFundsError) {
      throw new ApiError('موجودی کیف پول کافی نیست.', 402, { code: 'insufficient_funds' });
    }
    throw err;
  }

  // ── ساخت واقعی در هتزنر ──
  // اگر ظرفیت یک حساب پر باشد یا لوکیشن جا نداشته باشد، حساب بعدی امتحان می‌شود.
  // هر سروری که ساخته ولی ثبت نشود، حتماً حذف می‌گردد تا هزینه بی‌صاحب نماند.
  const refundCharge = async () => {
    if (!chargeTxId) return;
    await credit({
      userId: user.id,
      amount: quote.dueNow,
      type: 'REFUND',
      serverId: server.id,
      description: `بازگشت وجه بابت عدم موفقیت در ساخت سرور ${server.name}`,
      ref: txRef('RF'),
      meta: { originalTransaction: chargeTxId },
    }).catch(() => null);
  };

  let created: Awaited<ReturnType<HetznerClient['createServer']>> | null = null;
  let usedAccount: (typeof accounts)[number] | null = null;
  let usedClient: HetznerClient | null = null;
  let createdHetznerId: number | null = null;
  const attemptErrors: string[] = [];

  for (const account of accounts) {
    let client: HetznerClient;
    try {
      client = new HClient(accountToken(account));
    } catch {
      attemptErrors.push(`${account.name}: توکن نامعتبر`);
      await markAccountError(account.id, 'توکن قابل رمزگشایی نیست.');
      continue;
    }

    try {
      // کلیدهای SSH باید در همین حساب موجود باشند
      const hetznerKeyIds = await ensureKeysOnAccount(sshKeys, account);

      created = await client.createServer({
        name: uniqueHetznerName(server.id, input.name),
        server_type: serverType.name,
        // نام ایمیج پایدار است؛ شناسه عددی با هر به‌روزرسانی ایمیج در هتزنر عوض می‌شود و شناسه کهنه خطا می‌دهد
        image: image.name || String(image.id),
        ...(datacenter ? { datacenter } : { location: location.name }),
        ssh_keys: hetznerKeyIds,
        start_after_create: true,
        user_data: cloudInit || undefined,
        public_net: { enable_ipv4: input.enableIpv4 !== false, enable_ipv6: true },
        labels: {
          panel: 'pasargad-mizban',
          user_id: user.id,
          server_id: server.id,
          cycle: input.billingCycle.toLowerCase(),
        },
      });

      usedAccount = account;
      usedClient = client;
      createdHetznerId = created.server.id;
      break;
    } catch (err) {
      const code = err instanceof HetznerError ? err.code : 'unknown';
      const message = err instanceof HetznerError ? err.message : 'خطای نامشخص';
      attemptErrors.push(`${account.name}: ${message}`);

      if (code === 'resource_limit_exceeded') {
        // ظرفیت این پروژه پر است — سقف واقعی را یاد بگیر و سراغ حساب بعدی برو
        const count = await client
          .listServers()
          .then((list) => list.length)
          .catch(() => undefined);
        await markLimitReached(account.id, count);
        continue;
      }

      if (code === 'unauthorized' || code === 'token_readonly' || code === 'forbidden') {
        await markAccountError(account.id, message);
        continue;
      }

      if (code === 'uniqueness_error') {
        await prisma.server.delete({ where: { id: server.id } }).catch(() => null);
        await refundCharge();
        throw new ApiError('نام انتخابی در زیرساخت تکراری است. نام دیگری انتخاب کنید.', 409, {
          fields: { name: 'این نام قابل استفاده نیست.' },
        });
      }

      // کمبود ظرفیت لوکیشن یا خطای موقتی — حساب بعدی را امتحان کن
      continue;
    }
  }

  if (!created || !usedAccount || !usedClient) {
    await refundCharge();
    await prisma.server.update({
      where: { id: server.id },
      data: {
        status: 'ERROR',
        provisionError: attemptErrors.join(' | ').slice(0, 500) || 'هیچ حسابی ظرفیت نداشت.',
        deletedAt: new Date(),
      },
    });

    await notify(user.id, {
      kind: 'server',
      type: 'error',
      title: `ساخت سرور ${server.name} ناموفق بود`,
      body: 'در حال حاضر ظرفیت ساخت سرور با این مشخصات موجود نیست. مبلغ پرداختی به کیف پول شما بازگردانده شد. لوکیشن یا پلن دیگری امتحان کنید.',
      link: '/dashboard/wallet',
    });

    await notifyStaff({
      kind: 'news',
      type: 'error',
      title: 'ساخت سرور روی هیچ حسابی موفق نشد',
      body: `پلن ${serverType.name} در ${location.name}:\n${attemptErrors.join('\n')}`,
      link: '/admin/hetzner',
      dedupeHours: 2,
    });

    // مدیر باید علت واقعی را همان لحظه ببیند؛ کاربر عادی همان پیام عمومی را می‌گیرد
    const staffDetail =
      user.role !== 'USER' && attemptErrors.length
        ? ` — علت (فقط مدیر می‌بیند): ${attemptErrors.join(' | ')}`.slice(0, 400)
        : '';
    throw new ApiError(
      `در حال حاضر ظرفیت ساخت سرور با این مشخصات موجود نیست. لوکیشن یا پلن دیگری انتخاب کنید.${staffDetail}`,
      503,
      { code: 'no_capacity' },
    );
  }

  try {
    const rootPassword = created.root_password;
    const hServer = created.server;
    const primaryIpId = hServer.public_net?.ipv4?.id ?? null;

    const updated = await prisma.server.update({
      where: { id: server.id },
      data: {
        hetznerId: BigInt(hServer.id),
        hetznerAccountId: usedAccount.id,
        hetznerStatus: hServer.status,
        status: mapHetznerStatus(hServer.status),
        ipv4: hServer.public_net?.ipv4?.ip ?? null,
        primaryIpId: primaryIpId ? BigInt(primaryIpId) : null,
        ipv6: hServer.public_net?.ipv6?.ip?.replace(/\/\d+$/, '1') ?? null,
        ipv6Network: hServer.public_net?.ipv6?.ip ?? null,
        rootPasswordEnc: rootPassword ? encrypt(rootPassword) : null,
        provisionedAt: new Date(),
      },
    });

    await noteServerCreated(usedAccount.id);

    // خرید تازه ممکن است کاربر را به سطح بالاتر باشگاه برساند
    void refreshUserLoyalty(user.id).catch(() => null);

    await prisma.serverAction.create({
      data: {
        serverId: server.id,
        userId: user.id,
        action: 'create_server',
        hetznerActionId: BigInt(created.action.id),
        status:
          created.action.status === 'error' ? 'ERROR' : created.action.status === 'success' ? 'SUCCESS' : 'RUNNING',
      },
    });

    // فعال‌سازی بکاپ در صورت درخواست
    if (input.enableBackups) {
      usedClient.enableBackup(hServer.id).catch(() => null);
    }

    // پایش خودکار در دسترس بودن سرور
    if (input.enableMonitoring !== false && updated.ipv4) {
      const monitorSettings = await getSettings();
      if (monitorSettings.monitoringEnabled) {
        const suggestion = suggestedPort(template?.slug ?? null);
        await prisma.serverMonitor
          .create({
            data: {
              serverId: server.id,
              userId: user.id,
              checkType: suggestion.checkType,
              port: suggestion.port,
              intervalMinutes: monitorSettings.monitorDefaultInterval,
            },
          })
          .catch(() => null);
      }
    }

    await audit({
      userId: user.id,
      action: 'server.create',
      entity: 'server',
      entityId: server.id,
      ip: input.ip,
      userAgent: input.userAgent,
      meta: {
        hetznerId: hServer.id,
        account: usedAccount.name,
        serverType: serverType.name,
        location: location.name,
        cycle: input.billingCycle,
        amount: quote.dueNow.toString(),
        attempts: attemptErrors.length + 1,
      },
    });

    await notify(user.id, {
      kind: 'server',
      type: 'success',
      title: `سرور ${server.name} در حال آماده‌سازی است`,
      body: template
        ? `پلن ${serverType.name} در ${location.description}. قالب «${template.name}» در حال نصب است و چند دقیقه طول می‌کشد.`
        : `پلن ${serverType.name} در ${location.description}. تا چند دقیقه دیگر آماده می‌شود.`,
      link: `/dashboard/servers/${server.id}`,
    });

    if (rootPassword) {
      const tpl = serverReadyTemplate({
        name: server.name,
        ipv4: updated.ipv4,
        ipv6: updated.ipv6,
        rootPassword,
        location: location.description,
        plan: serverType.name,
      });
      void sendMail({ to: user.email, ...tpl }).catch(() => null);
    }

    return updated;
  } catch (err) {
    // سرور در هتزنر ساخته شد ولی ثبت محلی شکست خورد — حتماً حذفش کن
    if (createdHetznerId !== null) {
      await usedClient.deleteServer(createdHetznerId).catch((delErr) => {
        console.error(
          `[provisioning] سرور ${createdHetznerId} در حساب ${usedAccount?.name} ساخته شد اما ثبت و حذف هر دو شکست خورد. نیاز به بررسی دستی:`,
          delErr,
        );
      });
    }

    await refundCharge();

    const message = err instanceof HetznerError ? err.message : 'ثبت سرور پس از ساخت با خطا مواجه شد.';
    await prisma.server.update({
      where: { id: server.id },
      data: { status: 'ERROR', provisionError: message.slice(0, 500), deletedAt: new Date() },
    });

    await notify(user.id, {
      kind: 'server',
      type: 'error',
      title: `ساخت سرور ${server.name} ناموفق بود`,
      body: `${message} مبلغ پرداختی به کیف پول شما بازگردانده شد.`,
      link: '/dashboard/wallet',
    });

    throw err instanceof ApiError ? err : new ApiError(message, 502);
  }
}

/** نام سرور در هتزنر باید در کل پروژه یکتا باشد */
function uniqueHetznerName(serverId: string, name: string): string {
  const clean = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const suffix = serverId.slice(-6);
  return `${clean || 'srv'}-${suffix}`.slice(0, 63);
}

/** بروزرسانی اطلاعات سرور از روی هتزنر */
export async function syncServer(serverId: string): Promise<Server | null> {
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server || !server.hetznerId || server.status === 'DELETED') return server;

  try {
    const client = await clientForServer(server);
    const h = await client.getServer(server.hetznerId);
    return applyHetznerState(server.id, h, server.status === 'SUSPENDED');
  } catch (err) {
    if (err instanceof HetznerError && err.code === 'not_found') {
      // سرور در هتزنر وجود ندارد — احتمالاً از کنسول هتزنر حذف شده
      return prisma.server.update({
        where: { id: server.id },
        data: { status: 'DELETED', deletedAt: server.deletedAt ?? new Date() },
      });
    }
    return server;
  }
}

export async function applyHetznerState(serverId: string, h: HServer, keepSuspended = false): Promise<Server> {
  const ipv6Net = h.public_net?.ipv6?.ip ?? null;
  return prisma.server.update({
    where: { id: serverId },
    data: {
      hetznerStatus: h.status,
      status: keepSuspended ? 'SUSPENDED' : mapHetznerStatus(h.status),
      ipv4: h.public_net?.ipv4?.ip ?? null,
      primaryIpId: h.public_net?.ipv4?.id ? BigInt(h.public_net.ipv4.id) : null,
      ipv6: ipv6Net ? ipv6Net.replace(/\/\d+$/, '1') : null,
      ipv6Network: ipv6Net,
      privateNet: (h.private_net ?? []) as never,
      cores: h.server_type?.cores ?? undefined,
      memory: h.server_type?.memory ?? undefined,
      disk: h.primary_disk_size ?? h.server_type?.disk ?? undefined,
      serverTypeName: h.server_type?.name ?? undefined,
      includedTraffic: h.included_traffic ? BigInt(h.included_traffic) : undefined,
      backupsEnabled: Boolean(h.backup_window),
      protection: Boolean(h.protection?.delete),
      rescueMode: h.rescue_enabled ? 'linux64' : null,
      isoName: h.iso?.name ?? null,
      datacenterName: h.datacenter?.name ?? undefined,
    },
  });
}

/** حذف کامل سرور و توقف صورتحساب */
export async function destroyServer(params: {
  serverId: string;
  userId: string;
  actorIsAdmin?: boolean;
  reason?: string;
  ip?: string;
  userAgent?: string;
  /** بازگرداندن هزینه باقی‌مانده دوره ماهانه */
  refundRemaining?: boolean;
}): Promise<void> {
  const server = await prisma.server.findUnique({ where: { id: params.serverId } });
  if (!server) throw new ApiError('سرور یافت نشد.', 404);
  if (!params.actorIsAdmin && server.userId !== params.userId) {
    throw new ApiError('دسترسی به این سرور ندارید.', 403);
  }
  if (server.status === 'DELETED') return;

  if (server.protection && !params.actorIsAdmin) {
    throw new ApiError('محافظت حذف روی این سرور فعال است. ابتدا آن را غیرفعال کنید.', 400);
  }

  await prisma.server.update({ where: { id: server.id }, data: { status: 'DELETING' } });

  if (server.hetznerId) {
    try {
      const client = await clientForServer(server);
      await client.deleteServer(server.hetznerId);

      // آدرس اصلی سرور هم باید حذف شود وگرنه در حساب هتزنر می‌ماند و هزینه
      // ماهانه می‌سازد. آدرس‌هایی که auto_delete دارند خودشان با سرور می‌روند و
      // این حذف برایشان not_found برمی‌گرداند که همان موفقیت است.
      if (server.primaryIpId) {
        const removed = await deletePrimaryIpWithRetry(client, server.primaryIpId);
        if (!removed) {
          await notifyStaff({
            title: `آدرس سرور حذف‌شده ${server.name} در هتزنر ماند`,
            body: `شناسه Primary IP: ${server.primaryIpId} · آدرس: ${server.ipv4 ?? '—'}
جاروب ساعتی دوباره تلاش می‌کند.`,
            type: 'warning',
            wait: true,
          }).catch(() => null);
        }
      }
    } catch (err) {
      if (!(err instanceof HetznerError && err.code === 'not_found')) {
        await prisma.server.update({ where: { id: server.id }, data: { status: server.status } });
        throw err;
      }
    }
  }

  // بازگشت وجه دوره باقی‌مانده (فقط ماهانه)
  if (params.refundRemaining && server.billingCycle === 'MONTHLY' && server.expiresAt && server.expiresAt > new Date()) {
    const remainingMs = server.expiresAt.getTime() - Date.now();
    const totalMs = 30 * 24 * 3600_000;
    const ratio = Math.min(1, remainingMs / totalMs);
    const amount = BigInt(Math.floor(Number(server.priceMonthly) * ratio));
    if (amount > 0n) {
      await credit({
        userId: server.userId,
        amount,
        type: 'REFUND',
        serverId: server.id,
        description: `بازگشت هزینه دوره استفاده‌نشده سرور ${server.name}`,
      }).catch(() => null);
    }
  }

  await noteServerDeleted(server.hetznerAccountId);

  await prisma.server.update({
    where: { id: server.id },
    data: {
      status: 'DELETED',
      deletedAt: new Date(),
      rootPasswordEnc: null,
      primaryIpId: null,
      // شناسه هتزنر آزاد می‌شود تا محدودیت یکتایی مانع ساخت سرورهای بعدی نشود؛
      // مقدار اصلی برای پیگیری در meta نگهداری می‌گردد.
      hetznerId: null,
      meta: {
        ...((server.meta as Record<string, unknown>) ?? {}),
        deletedHetznerId: server.hetznerId?.toString() ?? null,
      } as Prisma.InputJsonValue,
    },
  });

  await audit({
    userId: params.userId,
    actorType: params.actorIsAdmin ? 'admin' : 'user',
    action: 'server.delete',
    entity: 'server',
    entityId: server.id,
    ip: params.ip,
    userAgent: params.userAgent,
    meta: { name: server.name, hetznerId: server.hetznerId?.toString(), reason: params.reason },
  });

  await notify(server.userId, {
    type: 'warning',
    title: `سرور ${server.name} حذف شد`,
    body: params.reason ?? 'سرور طبق درخواست شما حذف شد و صورتحساب آن متوقف گردید.',
  });
}

/** تعلیق سرور (خاموش کردن) بدون حذف داده */
export async function suspendServer(serverId: string, reason: string): Promise<void> {
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server || server.status === 'SUSPENDED' || server.status === 'DELETED') return;

  if (server.hetznerId) {
    const client = await clientForServer(server).catch(() => null);
    await client?.powerOff(server.hetznerId).catch(() => null);
  }

  const settings = await getSettings();
  await prisma.server.update({
    where: { id: server.id },
    data: {
      status: 'SUSPENDED',
      suspendedAt: new Date(),
      deleteAfter: new Date(Date.now() + settings.deleteAfterDays * 24 * 3600_000),
    },
  });

  await audit({
    userId: server.userId,
    actorType: 'system',
    action: 'server.suspend',
    entity: 'server',
    entityId: server.id,
    meta: { reason },
  });

  await notify(server.userId, {
    type: 'error',
    title: `سرور ${server.name} تعلیق شد`,
    body: `${reason} داده‌های سرور تا ${settings.deleteAfterDays} روز نگهداری می‌شود؛ پس از آن سرور برای همیشه حذف خواهد شد.`,
    link: `/dashboard/servers/${server.id}`,
    email: true,
    wait: true,
  });
}

/** رفع تعلیق سرور پس از شارژ کیف پول */
export async function unsuspendServer(serverId: string): Promise<boolean> {
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server || server.status !== 'SUSPENDED' || !server.hetznerId) return false;

  const requiredBalance = server.billingCycle === 'HOURLY' ? server.priceHourly * 24n : server.priceMonthly;
  if (!(await canAfford(server.userId, requiredBalance))) return false;

  try {
    const client = await clientForServer(server);
    await client.powerOn(server.hetznerId);
  } catch {
    // اگر روشن کردن ناموفق بود، وضعیت بعداً با sync اصلاح می‌شود
  }

  await prisma.server.update({
    where: { id: server.id },
    data: {
      status: 'RUNNING',
      suspendedAt: null,
      deleteAfter: null,
      lastBilledAt: new Date(),
      ...(server.billingCycle === 'MONTHLY' && server.expiresAt && server.expiresAt < new Date()
        ? { expiresAt: new Date(Date.now() + 30 * 24 * 3600_000) }
        : {}),
    },
  });

  await audit({
    userId: server.userId,
    actorType: 'system',
    action: 'server.unsuspend',
    entity: 'server',
    entityId: server.id,
  });

  await notify(server.userId, {
    type: 'success',
    title: `سرور ${server.name} از تعلیق خارج شد`,
    body: 'سرور مجدداً روشن شد و در دسترس است.',
    link: `/dashboard/servers/${server.id}`,
  });

  return true;
}

/** تمدید دستی سرور ماهانه */
export async function renewServer(params: { serverId: string; userId: string; months: number }) {
  const server = await prisma.server.findUnique({ where: { id: params.serverId } });
  if (!server) throw new ApiError('سرور یافت نشد.', 404);
  if (server.userId !== params.userId) throw new ApiError('دسترسی به این سرور ندارید.', 403);
  if (server.billingCycle !== 'MONTHLY') throw new ApiError('فقط سرورهای ماهانه قابل تمدید دستی هستند.', 400);
  if (server.status === 'DELETED') throw new ApiError('این سرور حذف شده است.', 400);

  const months = Math.max(1, Math.min(12, params.months));
  const total = (server.priceMonthly + (server.backupsEnabled ? server.backupPriceMonthly : 0n)) * BigInt(months);

  await debit({
    userId: server.userId,
    amount: total,
    type: 'CHARGE',
    serverId: server.id,
    description: `تمدید ${months} ماهه سرور ${server.name}`,
  });

  const base = server.expiresAt && server.expiresAt > new Date() ? server.expiresAt : new Date();
  const newExpiry = new Date(base.getTime() + months * 30 * 24 * 3600_000);

  const updated = await prisma.server.update({
    where: { id: server.id },
    data: { expiresAt: newExpiry, lastBilledAt: new Date() },
  });

  if (server.status === 'SUSPENDED') await unsuspendServer(server.id);

  await audit({
    userId: server.userId,
    action: 'server.renew',
    entity: 'server',
    entityId: server.id,
    meta: { months, amount: total.toString() },
  });

  await notify(server.userId, {
    type: 'success',
    title: `سرور ${server.name} تمدید شد`,
    body: `سرویس شما تا ${newExpiry.toLocaleDateString('fa-IR')} تمدید شد.`,
    link: `/dashboard/servers/${server.id}`,
  });

  return updated;
}

/** سقف صورتحساب ساعتی: هتزنر بیش از ۷۳۰ ساعت در ماه شارژ نمی‌کند */
export function monthlyCapFor(priceHourly: bigint): bigint {
  return priceHourly * BigInt(HOURS_PER_MONTH);
}
