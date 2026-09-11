import prisma from './prisma';
import type { Prisma, Server } from '@prisma/client';
import { debit, InsufficientFundsError } from './wallet';
import { getSettings } from './settings';
import { HetznerError } from './hetzner';
import { allActiveClients, clientForServer, refreshAllAccounts } from './hetzner-accounts';
import { suspendServer, destroyServer, syncServer, applyHetznerState, mapHetznerStatus } from './provisioning';
import { snapshotPricePerGb, HOURS_PER_MONTH } from './pricing';
import { audit } from './audit';
import { notify, notifyStaff } from './notify';

/**
 * موتور صورتحساب.
 *
 * سرور ساعتی: هر ساعت مبلغ priceHourly کسر می‌شود، با سقف ماهانه priceMonthly
 *             (همان قاعده‌ای که هتزنر دارد: حداکثر ۷۳۰ ساعت در ماه).
 * سرور ماهانه: در سررسید، در صورت فعال بودن تمدید خودکار، مبلغ ماه بعد کسر می‌شود.
 *
 * در صورت کمبود موجودی: مهلت (grace) داده می‌شود، سپس تعلیق، سپس حذف.
 */

type JobResult = { processed: number; charged: bigint; suspended: number; errors: string[] };

function monthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

type ServerMeta = {
  monthKey?: string;
  monthCharged?: string;
  graceStartedAt?: string;
  requestedMonths?: number;
  [k: string]: unknown;
};

function readMeta(server: Server): ServerMeta {
  return (server.meta as ServerMeta) ?? {};
}

/** مبلغی که این ماه تا الان از این سرور گرفته شده */
function chargedThisMonth(meta: ServerMeta): bigint {
  if (meta.monthKey !== monthKey()) return 0n;
  try {
    return BigInt(meta.monthCharged ?? '0');
  } catch {
    return 0n;
  }
}

// ───────────────  صورتحساب ساعتی  ───────────────

export async function chargeHourlyServers(now = new Date()): Promise<JobResult> {
  const settings = await getSettings();
  const result: JobResult = { processed: 0, charged: 0n, suspended: 0, errors: [] };

  const servers = await prisma.server.findMany({
    where: {
      billingCycle: 'HOURLY',
      status: { in: ['RUNNING', 'OFF', 'REBUILDING', 'MIGRATING'] },
      deletedAt: null,
    },
    include: { user: { select: { id: true, balance: true, creditLimit: true } } },
  });

  for (const server of servers) {
    try {
      const last = server.lastBilledAt ?? server.provisionedAt ?? server.createdAt;
      const elapsedMs = now.getTime() - last.getTime();
      const hours = Math.floor(elapsedMs / 3_600_000);
      if (hours < 1) continue;

      result.processed++;

      const unit = server.priceHourly + (server.backupsEnabled ? server.backupPriceHourly : 0n);
      const monthlyCap = server.priceMonthly + (server.backupsEnabled ? server.backupPriceMonthly : 0n);

      const meta = readMeta(server);
      const already = chargedThisMonth(meta);

      let amount = unit * BigInt(hours);
      // اعمال سقف ماهانه
      if (monthlyCap > 0n && already + amount > monthlyCap) {
        amount = monthlyCap > already ? monthlyCap - already : 0n;
      }

      const newBilledAt = new Date(last.getTime() + hours * 3_600_000);

      if (amount === 0n) {
        // به سقف ماهانه رسیده — فقط زمان را جلو ببر
        await prisma.server.update({
          where: { id: server.id },
          data: { lastBilledAt: newBilledAt, meta: { ...meta, monthKey: monthKey(), monthCharged: already.toString() } as Prisma.InputJsonValue },
        });
        continue;
      }

      try {
        await debit({
          userId: server.userId,
          amount,
          type: 'CHARGE',
          serverId: server.id,
          description: `هزینه ${hours} ساعت سرور ${server.name}`,
          meta: { hours, unit: unit.toString(), cycle: 'HOURLY' },
        });

        await prisma.server.update({
          where: { id: server.id },
          data: {
            lastBilledAt: newBilledAt,
            suspendedAt: null,
            meta: {
              ...meta,
              monthKey: monthKey(),
              monthCharged: (already + amount).toString(),
              graceStartedAt: undefined,
            } as Prisma.InputJsonValue,
          },
        });

        result.charged += amount;
      } catch (err) {
        if (!(err instanceof InsufficientFundsError)) throw err;

        // موجودی کافی نیست → شروع مهلت یا تعلیق
        const graceStart = meta.graceStartedAt ? new Date(meta.graceStartedAt) : now;
        const graceMs = settings.suspendGraceHours * 3_600_000;

        if (!meta.graceStartedAt) {
          await prisma.server.update({
            where: { id: server.id },
            data: { meta: { ...meta, graceStartedAt: now.toISOString() } as Prisma.InputJsonValue },
          });
          await notify(server.userId, {
            type: 'error',
            title: 'موجودی کیف پول تمام شد',
            body: `برای جلوگیری از تعلیق سرور «${server.name}» ظرف ${settings.suspendGraceHours} ساعت آینده کیف پول خود را شارژ کنید.`,
            link: '/dashboard/wallet',
            dedupeHours: 6,
            email: true,
            wait: true,
          });
        } else if (now.getTime() - graceStart.getTime() >= graceMs) {
          await suspendServer(server.id, 'به دلیل اتمام موجودی کیف پول، سرور تعلیق شد.');
          result.suspended++;
        }
      }
    } catch (err) {
      result.errors.push(`${server.name}: ${err instanceof Error ? err.message : 'خطای نامشخص'}`);
    }
  }

  return result;
}

// ───────────────  صورتحساب ماهانه  ───────────────

export async function processMonthlyServers(now = new Date()): Promise<JobResult> {
  const settings = await getSettings();
  const result: JobResult = { processed: 0, charged: 0n, suspended: 0, errors: [] };

  // ۱) یادآوری قبل از سررسید
  const reminderWindow = new Date(now.getTime() + settings.invoiceLeadDays * 24 * 3600_000);
  const upcoming = await prisma.server.findMany({
    where: {
      billingCycle: 'MONTHLY',
      status: { in: ['RUNNING', 'OFF'] },
      deletedAt: null,
      expiresAt: { gt: now, lte: reminderWindow },
    },
  });

  for (const server of upcoming) {
    const days = Math.ceil((server.expiresAt!.getTime() - now.getTime()) / 86_400_000);
    await notify(server.userId, {
      type: 'warning',
      title: `سررسید سرور ${server.name} نزدیک است`,
      body: server.autoRenew
        ? `${days} روز دیگر مبلغ تمدید از کیف پول شما کسر می‌شود. از کافی بودن موجودی مطمئن شوید.`
        : `${days} روز دیگر سرویس شما منقضی می‌شود. برای جلوگیری از قطع سرویس آن را تمدید کنید.`,
      link: `/dashboard/servers/${server.id}`,
      dedupeHours: 20,
      email: true,
      wait: true,
    });
  }

  // ۲) سررسیدشده‌ها
  const due = await prisma.server.findMany({
    where: {
      billingCycle: 'MONTHLY',
      status: { in: ['RUNNING', 'OFF'] },
      deletedAt: null,
      expiresAt: { lte: now },
    },
  });

  for (const server of due) {
    result.processed++;
    try {
      if (!server.autoRenew) {
        await suspendServer(server.id, 'دوره سرویس به پایان رسید و تمدید خودکار غیرفعال بود.');
        result.suspended++;
        continue;
      }

      const amount = server.priceMonthly + (server.backupsEnabled ? server.backupPriceMonthly : 0n);

      const invoice = await createServerInvoice(server, amount, now);

      try {
        await debit({
          userId: server.userId,
          amount,
          type: 'CHARGE',
          serverId: server.id,
          invoiceId: invoice.id,
          description: `تمدید ماهانه سرور ${server.name}`,
        });

        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: 'PAID', paidAt: new Date() },
        });

        const newExpiry = new Date(server.expiresAt!.getTime() + 30 * 24 * 3600_000);
        await prisma.server.update({
          where: { id: server.id },
          data: { expiresAt: newExpiry > now ? newExpiry : new Date(now.getTime() + 30 * 24 * 3600_000), lastBilledAt: now },
        });

        result.charged += amount;

        await audit({
          userId: server.userId,
          actorType: 'system',
          action: 'billing.invoice_paid',
          entity: 'invoice',
          entityId: invoice.id,
          meta: { serverId: server.id, amount: amount.toString() },
        });

        await notify(server.userId, {
          type: 'success',
          title: `سرور ${server.name} تمدید شد`,
          body: 'سرویس شما برای یک ماه دیگر تمدید و مبلغ آن از کیف پول کسر شد.',
          link: `/dashboard/servers/${server.id}`,
        });
      } catch (err) {
        if (!(err instanceof InsufficientFundsError)) throw err;

        const meta = readMeta(server);
        const graceStart = meta.graceStartedAt ? new Date(meta.graceStartedAt) : now;
        const graceMs = settings.suspendGraceHours * 3_600_000;

        if (!meta.graceStartedAt) {
          await prisma.server.update({
            where: { id: server.id },
            data: { meta: { ...meta, graceStartedAt: now.toISOString() } as Prisma.InputJsonValue },
          });
          await notify(server.userId, {
            type: 'error',
            title: `تمدید سرور ${server.name} ناموفق بود`,
            body: `موجودی کیف پول کافی نیست. ظرف ${settings.suspendGraceHours} ساعت آینده شارژ کنید تا سرویس قطع نشود.`,
            link: '/dashboard/wallet',
            email: true,
          });
        } else if (now.getTime() - graceStart.getTime() >= graceMs) {
          await suspendServer(server.id, 'به دلیل عدم پرداخت هزینه تمدید، سرور تعلیق شد.');
          result.suspended++;
        }
      }
    } catch (err) {
      result.errors.push(`${server.name}: ${err instanceof Error ? err.message : 'خطای نامشخص'}`);
    }
  }

  return result;
}

async function createServerInvoice(server: Server, amount: bigint, now: Date) {
  const existing = await prisma.invoice.findFirst({
    where: {
      userId: server.userId,
      status: 'UNPAID',
      items: { some: { serverId: server.id } },
      createdAt: { gte: new Date(now.getTime() - 3 * 24 * 3600_000) },
    },
  });
  if (existing) return existing;

  return prisma.invoice.create({
    data: {
      userId: server.userId,
      status: 'UNPAID',
      subtotal: amount,
      total: amount,
      periodStart: now,
      periodEnd: new Date(now.getTime() + 30 * 24 * 3600_000),
      dueAt: now,
      items: {
        create: [
          {
            description: `تمدید ماهانه سرور ${server.name} (${server.serverTypeName} / ${server.locationName})`,
            quantity: 1,
            unitPrice: amount,
            total: amount,
            serverId: server.id,
          },
        ],
      },
    },
  });
}

// ───────────────  حذف سرورهای تعلیق‌شده  ───────────────

export async function deleteExpiredSuspended(now = new Date()): Promise<{ deleted: number; errors: string[] }> {
  const out = { deleted: 0, errors: [] as string[] };
  const servers = await prisma.server.findMany({
    where: { status: 'SUSPENDED', deleteAfter: { lte: now }, deletedAt: null },
  });

  for (const server of servers) {
    try {
      await destroyServer({
        serverId: server.id,
        userId: server.userId,
        actorIsAdmin: true,
        reason: 'حذف خودکار پس از پایان مهلت تعلیق به دلیل عدم پرداخت.',
      });
      out.deleted++;
    } catch (err) {
      out.errors.push(`${server.name}: ${err instanceof Error ? err.message : 'خطای نامشخص'}`);
    }
  }
  return out;
}

/** تلاش برای رفع تعلیق سرورهایی که کاربرشان کیف پول را شارژ کرده */
export async function retryUnsuspend(): Promise<number> {
  const { unsuspendServer } = await import('./provisioning');
  const servers = await prisma.server.findMany({
    where: { status: 'SUSPENDED', deletedAt: null },
    select: { id: true },
  });
  let count = 0;
  for (const s of servers) {
    if (await unsuspendServer(s.id)) count++;
  }
  return count;
}

// ───────────────  همگام‌سازی وضعیت  ───────────────

export async function syncAllServers(): Promise<{ synced: number; orphans: number; errors: string[] }> {
  const out = { synced: 0, orphans: 0, errors: [] as string[] };

  // ظرفیت حساب‌ها هم در همین دور به‌روز می‌شود
  await refreshAllAccounts().catch(() => null);

  const clients = await allActiveClients();
  if (!clients.length) {
    out.errors.push('هیچ حساب هتزنر فعالی تنظیم نشده است.');
    return out;
  }

  // نقشه «حساب → سرورهای واقعی آن حساب»
  const remoteByAccount = new Map<string, Map<string, Awaited<ReturnType<typeof clients[number]['client']['listServers']>>[number]>>();

  for (const { account, client } of clients) {
    try {
      const servers = await client.listServers('panel=pasargad-mizban');
      remoteByAccount.set(account.id, new Map(servers.map((srv) => [String(srv.id), srv])));
    } catch (err) {
      out.errors.push(`${account.name}: ${err instanceof Error ? err.message : 'خطا در دریافت لیست'}`);
    }
  }

  const local = await prisma.server.findMany({
    where: { status: { notIn: ['DELETED'] }, hetznerId: { not: null } },
  });

  for (const server of local) {
    const accountId = server.hetznerAccountId;
    const remote = accountId ? remoteByAccount.get(accountId) : undefined;

    // اگر لیست این حساب گرفته نشده، درباره سرورهایش قضاوت نکن
    if (!accountId || !remote) continue;

    try {
      const h = remote.get(String(server.hetznerId));
      if (!h) {
        await prisma.server.update({
          where: { id: server.id },
          data: { status: 'DELETED', deletedAt: new Date() },
        });
        out.orphans++;
        await notify(server.userId, {
          kind: 'server',
          type: 'error',
          title: `سرور ${server.name} دیگر در دسترس نیست`,
          body: 'این سرور از زیرساخت حذف شده است. در صورت نیاز با پشتیبانی تماس بگیرید.',
          dedupeHours: 24,
          wait: true,
        });
        continue;
      }
      await applyHetznerState(server.id, h, server.status === 'SUSPENDED');
      out.synced++;
    } catch (err) {
      out.errors.push(`${server.name}: ${err instanceof Error ? err.message : 'خطای نامشخص'}`);
    }
  }

  // ── سرورهای بدون مالک: در هتزنر هستند ولی رکورد محلی ندارند ──
  const knownIds = new Set(local.map((srv) => `${srv.hetznerAccountId}:${srv.hetznerId}`));
  const untracked: string[] = [];
  for (const { account } of clients) {
    const remote = remoteByAccount.get(account.id);
    if (!remote) continue;
    for (const [id, srv] of remote) {
      if (!knownIds.has(`${account.id}:${id}`)) untracked.push(`${srv.name} (${account.name})`);
    }
  }

  if (untracked.length) {
    out.errors.push(`${untracked.length} سرور بدون رکورد محلی: ${untracked.join('، ')}`);
    await notifyStaff({
      kind: 'news',
      type: 'error',
      title: `${untracked.length} سرور بدون مالک در هتزنر`,
      body: `این سرورها هزینه تولید می‌کنند اما به هیچ کاربری تعلق ندارند: ${untracked.join('، ')}. آن‌ها را در کنسول هتزنر بررسی کنید.`,
      link: '/admin/hetzner',
      dedupeHours: 12,
    });
  }

  return out;
}

/** تکمیل سرورهایی که در حالت PROVISIONING مانده‌اند */
export async function finalizeProvisioning(): Promise<number> {
  const pending = await prisma.server.findMany({
    where: { status: 'PROVISIONING', hetznerId: { not: null }, deletedAt: null },
    select: { id: true, createdAt: true },
  });
  let done = 0;
  for (const p of pending) {
    const updated = await syncServer(p.id);
    if (updated && updated.status !== 'PROVISIONING') done++;
    // اگر بیش از ۳۰ دقیقه در حال ساخت مانده، وضعیت خطا بگذار
    else if (Date.now() - p.createdAt.getTime() > 30 * 60_000) {
      await prisma.server.update({
        where: { id: p.id },
        data: { status: 'ERROR', provisionError: 'ساخت سرور بیش از حد انتظار طول کشید.' },
      });
    }
  }
  return done;
}

// ───────────────  ترافیک  ───────────────

export async function collectTraffic(): Promise<number> {
  const servers = await prisma.server.findMany({
    where: { status: { in: ['RUNNING', 'OFF'] }, hetznerId: { not: null }, deletedAt: null },
    select: { id: true, hetznerId: true, hetznerAccountId: true, name: true },
  });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let count = 0;

  for (const server of servers) {
    try {
      const client = await clientForServer(server);
      const h = await client.getServer(server.hetznerId!);
      await prisma.trafficUsage.upsert({
        where: { serverId_date: { serverId: server.id, date: today } },
        create: {
          serverId: server.id,
          date: today,
          outgoingBytes: BigInt(h.outgoing_traffic ?? 0),
          incomingBytes: BigInt(h.ingoing_traffic ?? 0),
        },
        update: {
          outgoingBytes: BigInt(h.outgoing_traffic ?? 0),
          incomingBytes: BigInt(h.ingoing_traffic ?? 0),
        },
      });
      count++;
    } catch (err) {
      if (err instanceof HetznerError && err.code === 'rate_limit_exceeded') break;
    }
  }
  return count;
}

// ───────────────  اسنپ‌شات‌ها  ───────────────

export async function chargeSnapshots(now = new Date()): Promise<{ charged: bigint; count: number }> {
  const perGb = await snapshotPricePerGb();
  const snapshots = await prisma.snapshot.findMany({
    where: {
      OR: [{ lastBilledAt: null }, { lastBilledAt: { lte: new Date(now.getTime() - 30 * 24 * 3600_000) } }],
    },
  });

  let total = 0n;
  let count = 0;

  for (const snap of snapshots) {
    const amount = BigInt(Math.max(1, Math.ceil(snap.sizeGb))) * perGb;
    if (amount <= 0n) continue;
    try {
      await debit({
        userId: snap.userId,
        amount,
        type: 'CHARGE',
        description: `هزینه ماهانه نگهداری اسنپ‌شات «${snap.description}»`,
        meta: { snapshotId: snap.id, sizeGb: snap.sizeGb },
      });
      await prisma.snapshot.update({
        where: { id: snap.id },
        data: { lastBilledAt: now, priceMonthly: amount },
      });
      total += amount;
      count++;
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        await notify(snap.userId, {
          type: 'warning',
          title: 'هزینه اسنپ‌شات پرداخت نشد',
          body: `موجودی برای نگهداری اسنپ‌شات «${snap.description}» کافی نیست. در صورت عدم شارژ، اسنپ‌شات حذف خواهد شد.`,
          link: '/dashboard/wallet',
          dedupeHours: 24,
        });
      }
    }
  }

  return { charged: total, count };
}

// ───────────────  گزارش  ───────────────

export async function revenueReport(days = 30) {
  const since = new Date(Date.now() - days * 24 * 3600_000);
  const [deposits, charges, refunds] = await Promise.all([
    prisma.transaction.aggregate({
      where: { type: 'DEPOSIT', status: 'SUCCESS', paidAt: { gte: since } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.transaction.aggregate({
      where: { type: 'CHARGE', status: 'SUCCESS', paidAt: { gte: since } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.transaction.aggregate({
      where: { type: 'REFUND', status: 'SUCCESS', paidAt: { gte: since } },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  return {
    days,
    deposits: { total: deposits._sum.amount ?? 0n, count: deposits._count },
    charges: { total: charges._sum.amount ?? 0n, count: charges._count },
    refunds: { total: refunds._sum.amount ?? 0n, count: refunds._count },
  };
}

/** برآورد مصرف روزانه کاربر (برای نمایش «اعتبار شما تا کی کافی است») */
export async function burnRate(userId: string): Promise<{ hourly: bigint; daily: bigint; monthly: bigint }> {
  const servers = await prisma.server.findMany({
    where: { userId, status: { in: ['RUNNING', 'OFF', 'REBUILDING'] }, deletedAt: null },
    select: { priceHourly: true, priceMonthly: true, billingCycle: true, backupsEnabled: true, backupPriceHourly: true, backupPriceMonthly: true },
  });

  let hourly = 0n;
  let monthly = 0n;
  for (const s of servers) {
    const h = s.priceHourly + (s.backupsEnabled ? s.backupPriceHourly : 0n);
    const m = s.priceMonthly + (s.backupsEnabled ? s.backupPriceMonthly : 0n);
    if (s.billingCycle === 'HOURLY') {
      hourly += h;
      monthly += h * BigInt(HOURS_PER_MONTH);
    } else {
      monthly += m;
      hourly += m / BigInt(HOURS_PER_MONTH);
    }
  }
  return { hourly, daily: hourly * 24n, monthly };
}

export { mapHetznerStatus };
