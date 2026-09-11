import prisma from './prisma';
import type { HetznerAccount, Server } from '@prisma/client';
import { HetznerClient, HetznerError } from './hetzner';
import { encrypt, decrypt } from './crypto';
import { ApiError } from './errors';
import { env } from './env';
import { notifyStaff } from './notify';

/**
 * مدیریت چند حساب Hetzner Cloud.
 *
 * هتزنر برای هر پروژه سقف تعداد سرور دارد (به‌طور پیش‌فرض ۱۰ عدد).
 * برای فروش در مقیاس بزرگ‌تر، پنل می‌تواند چند حساب داشته باشد و وقتی
 * ظرفیت یکی پر شد، خودکار سراغ حساب بعدی برود.
 *
 * توکن‌ها با AES-256-GCM رمزنگاری و در دیتابیس ذخیره می‌شوند؛ در پنل
 * فقط چند حرف آخرشان نمایش داده می‌شود.
 */

export type AccountSummary = Omit<HetznerAccount, 'tokenEnc'> & {
  freeSlots: number;
  usagePercent: number;
};

function summarize(account: HetznerAccount): AccountSummary {
  const used = Math.max(account.serverCount, account.panelCount);
  const freeSlots = Math.max(0, account.maxServers - used);
  // توکن هرگز از این ماژول بیرون نمی‌رود
  const { tokenEnc: _tokenEnc, ...safe } = account;
  return {
    ...safe,
    freeSlots,
    usagePercent: account.maxServers > 0 ? Math.round((used / account.maxServers) * 100) : 0,
  };
}

// ───────────────  خواندن  ───────────────

export async function listAccounts(): Promise<AccountSummary[]> {
  const accounts = await prisma.hetznerAccount.findMany({
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });
  return accounts.map(summarize);
}

export async function getAccount(id: string): Promise<HetznerAccount> {
  const account = await prisma.hetznerAccount.findUnique({ where: { id } });
  if (!account) throw new ApiError('حساب هتزنر یافت نشد.', 404);
  return account;
}

export function accountToken(account: HetznerAccount): string {
  const token = decrypt(account.tokenEnc);
  if (!token) {
    throw new ApiError(
      `توکن حساب «${account.name}» قابل رمزگشایی نیست. احتمالاً ENCRYPTION_KEY تغییر کرده است.`,
      500,
      { code: 'bad_token' },
    );
  }
  return token;
}

/** آیا اصلاً حسابی تنظیم شده است؟ */
export async function hasAnyAccount(): Promise<boolean> {
  return (await prisma.hetznerAccount.count()) > 0;
}

// ───────────────  ساخت کلاینت  ───────────────

export async function clientForAccount(accountId: string): Promise<HetznerClient> {
  const account = await getAccount(accountId);
  return new HetznerClient(accountToken(account));
}

/** کلاینت متصل به همان حسابی که سرور روی آن ساخته شده */
export async function clientForServer(server: Pick<Server, 'hetznerAccountId' | 'name'>): Promise<HetznerClient> {
  if (!server.hetznerAccountId) {
    // سرورهای قدیمی که قبل از چندحسابی ساخته شده‌اند
    const fallback = await defaultAccount();
    if (!fallback) {
      throw new ApiError('حساب هتزنر مربوط به این سرور مشخص نیست. با پشتیبانی تماس بگیرید.', 500);
    }
    return new HetznerClient(accountToken(fallback));
  }
  return clientForAccount(server.hetznerAccountId);
}

/** اولین حساب فعال — برای کارهایی که به حساب خاصی وابسته نیستند مثل خواندن کاتالوگ */
export async function defaultAccount(): Promise<HetznerAccount | null> {
  return prisma.hetznerAccount.findFirst({
    where: { enabled: true, status: { not: 'ERROR' } },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });
}

/** کلاینتی برای خواندن کاتالوگ و قیمت‌ها (این داده‌ها بین همه حساب‌ها یکسان است) */
export async function catalogClient(): Promise<HetznerClient> {
  const account = (await defaultAccount()) ?? (await prisma.hetznerAccount.findFirst({ where: { enabled: true } }));
  if (!account) {
    throw new ApiError(
      'هیچ حساب هتزنری تنظیم نشده است. از بخش تنظیمات ← حساب‌های هتزنر یک حساب اضافه کنید.',
      400,
      { code: 'no_account' },
    );
  }
  return new HetznerClient(accountToken(account));
}

/** همه حساب‌های فعال به همراه کلاینتشان — برای همگام‌سازی سراسری */
export async function allActiveClients(): Promise<{ account: HetznerAccount; client: HetznerClient }[]> {
  const accounts = await prisma.hetznerAccount.findMany({
    where: { enabled: true },
    orderBy: [{ priority: 'asc' }],
  });
  const out: { account: HetznerAccount; client: HetznerClient }[] = [];
  for (const account of accounts) {
    try {
      out.push({ account, client: new HetznerClient(accountToken(account)) });
    } catch {
      // توکن خراب — در بررسی سلامت گزارش می‌شود
    }
  }
  return out;
}

// ───────────────  انتخاب حساب برای ساخت سرور  ───────────────

/**
 * حساب‌های دارای ظرفیت، به ترتیب اولویت.
 * حساب‌هایی که خطا دارند یا ظرفیتشان پر است کنار گذاشته می‌شوند.
 */
export async function candidateAccounts(): Promise<HetznerAccount[]> {
  const accounts = await prisma.hetznerAccount.findMany({
    where: { enabled: true, status: { notIn: ['ERROR', 'DISABLED'] } },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });

  return accounts.filter((a) => Math.max(a.serverCount, a.panelCount) < a.maxServers);
}

export async function capacityOverview() {
  const accounts = await prisma.hetznerAccount.findMany({ orderBy: [{ priority: 'asc' }] });
  const enabled = accounts.filter((a) => a.enabled);

  const totalSlots = enabled.reduce((n, a) => n + a.maxServers, 0);
  const usedSlots = enabled.reduce((n, a) => n + Math.max(a.serverCount, a.panelCount), 0);

  return {
    accounts: accounts.map(summarize),
    totals: {
      accounts: accounts.length,
      enabled: enabled.length,
      totalSlots,
      usedSlots,
      freeSlots: Math.max(0, totalSlots - usedSlots),
      usagePercent: totalSlots > 0 ? Math.round((usedSlots / totalSlots) * 100) : 0,
    },
  };
}

/** پس از ساخت موفق سرور، شمارنده حساب به‌روز می‌شود */
export async function noteServerCreated(accountId: string): Promise<void> {
  await prisma.hetznerAccount
    .update({
      where: { id: accountId },
      data: {
        serverCount: { increment: 1 },
        panelCount: { increment: 1 },
        lastUsedAt: new Date(),
        status: 'OK',
        lastError: null,
      },
    })
    .catch(() => null);
}

export async function noteServerDeleted(accountId: string | null): Promise<void> {
  if (!accountId) return;
  const account = await prisma.hetznerAccount.findUnique({ where: { id: accountId } });
  if (!account) return;
  await prisma.hetznerAccount
    .update({
      where: { id: accountId },
      data: {
        serverCount: Math.max(0, account.serverCount - 1),
        panelCount: Math.max(0, account.panelCount - 1),
        // با آزاد شدن ظرفیت، حساب دوباره قابل استفاده می‌شود
        status: account.status === 'LIMIT_REACHED' ? 'OK' : account.status,
      },
    })
    .catch(() => null);
}

/**
 * وقتی هتزنر می‌گوید سقف پروژه پر شده، سقف واقعی را یاد می‌گیریم
 * تا دفعه بعد وقت تلف نشود.
 */
export async function markLimitReached(accountId: string, currentCount?: number): Promise<void> {
  const account = await prisma.hetznerAccount.findUnique({ where: { id: accountId } });
  if (!account) return;

  const learned = currentCount ?? Math.max(account.serverCount, account.panelCount);
  await prisma.hetznerAccount.update({
    where: { id: accountId },
    data: {
      status: 'LIMIT_REACHED',
      maxServers: learned > 0 ? learned : account.maxServers,
      serverCount: learned > 0 ? learned : account.serverCount,
      lastError: 'سقف تعداد سرور این پروژه در هتزنر پر شده است.',
      lastCheckedAt: new Date(),
    },
  });

  await notifyStaff({
    kind: 'news',
    type: 'warning',
    title: `ظرفیت حساب هتزنر «${account.name}» پر شد`,
    body: `این حساب به سقف ${learned} سرور رسیده است. سرورهای جدید روی حساب‌های دیگر ساخته می‌شوند. در صورت نیاز حساب تازه‌ای اضافه کنید.`,
    link: '/admin/hetzner',
    dedupeHours: 12,
  });
}

export async function markAccountError(accountId: string, message: string): Promise<void> {
  await prisma.hetznerAccount
    .update({
      where: { id: accountId },
      data: { status: 'ERROR', lastError: message.slice(0, 500), lastCheckedAt: new Date() },
    })
    .catch(() => null);

  const account = await prisma.hetznerAccount.findUnique({ where: { id: accountId }, select: { name: true } });
  await notifyStaff({
    kind: 'news',
    type: 'error',
    title: `حساب هتزنر «${account?.name ?? accountId}» با خطا مواجه شد`,
    body: message,
    link: '/admin/hetzner',
    dedupeHours: 6,
  });
}

// ───────────────  مدیریت  ───────────────

export async function testToken(token: string): Promise<{
  ok: boolean;
  serverCount?: number;
  locations?: number;
  message: string;
}> {
  try {
    const client = new HetznerClient(token);
    const [servers, locations] = await Promise.all([client.listServers(), client.listLocations()]);
    return {
      ok: true,
      serverCount: servers.length,
      locations: locations.length,
      message: `اتصال برقرار شد. ${servers.length} سرور و ${locations.length} لوکیشن در این حساب دیده شد.`,
    };
  } catch (err) {
    if (err instanceof HetznerError) {
      return {
        ok: false,
        message:
          err.code === 'unauthorized'
            ? 'توکن نامعتبر است. مطمئن شوید توکن Read & Write را درست کپی کرده‌اید.'
            : err.message,
      };
    }
    return { ok: false, message: 'ارتباط با هتزنر برقرار نشد.' };
  }
}

export async function createAccount(input: {
  name: string;
  token: string;
  maxServers?: number;
  priority?: number;
  note?: string;
}): Promise<AccountSummary> {
  const token = input.token.trim();

  // توکن تکراری نباشد
  const existing = await prisma.hetznerAccount.findMany({ select: { id: true, tokenEnc: true, name: true } });
  for (const row of existing) {
    if (decrypt(row.tokenEnc) === token) {
      throw new ApiError(`این توکن قبلاً با نام «${row.name}» ثبت شده است.`, 409, {
        fields: { token: 'توکن تکراری است.' },
      });
    }
  }

  const test = await testToken(token);
  if (!test.ok) {
    throw new ApiError(test.message, 400, { fields: { token: 'توکن کار نمی‌کند.' } });
  }

  const maxPriority = await prisma.hetznerAccount.aggregate({ _max: { priority: true } });

  const account = await prisma.hetznerAccount.create({
    data: {
      name: input.name.trim(),
      tokenEnc: encrypt(token),
      tokenHint: token.slice(-6),
      maxServers: input.maxServers ?? 10,
      priority: input.priority ?? (maxPriority._max.priority ?? 0) + 1,
      note: input.note?.trim() || null,
      serverCount: test.serverCount ?? 0,
      status: 'OK',
      lastCheckedAt: new Date(),
    },
  });

  return summarize(account);
}

export async function updateAccount(
  id: string,
  patch: { name?: string; token?: string; maxServers?: number; priority?: number; enabled?: boolean; note?: string },
): Promise<AccountSummary> {
  const account = await getAccount(id);

  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) data.name = patch.name.trim();
  if (patch.maxServers !== undefined) data.maxServers = patch.maxServers;
  if (patch.priority !== undefined) data.priority = patch.priority;
  if (patch.note !== undefined) data.note = patch.note.trim() || null;

  if (patch.enabled !== undefined) {
    data.enabled = patch.enabled;
    if (patch.enabled && account.status === 'DISABLED') data.status = 'UNKNOWN';
    if (!patch.enabled) data.status = 'DISABLED';
  }

  if (patch.token?.trim()) {
    const token = patch.token.trim();
    const test = await testToken(token);
    if (!test.ok) throw new ApiError(test.message, 400, { fields: { token: 'توکن کار نمی‌کند.' } });
    data.tokenEnc = encrypt(token);
    data.tokenHint = token.slice(-6);
    data.status = 'OK';
    data.lastError = null;
    data.serverCount = test.serverCount ?? account.serverCount;
    data.lastCheckedAt = new Date();
  }

  // با افزایش سقف، حساب پرشده دوباره قابل استفاده می‌شود
  if (patch.maxServers !== undefined && account.status === 'LIMIT_REACHED') {
    if (patch.maxServers > Math.max(account.serverCount, account.panelCount)) {
      data.status = 'OK';
      data.lastError = null;
    }
  }

  const updated = await prisma.hetznerAccount.update({ where: { id }, data });
  return summarize(updated);
}

export async function deleteAccount(id: string): Promise<void> {
  const activeServers = await prisma.server.count({
    where: { hetznerAccountId: id, deletedAt: null, status: { notIn: ['DELETED'] } },
  });
  if (activeServers > 0) {
    throw new ApiError(
      `این حساب ${activeServers} سرور فعال دارد و قابل حذف نیست. ابتدا آن را غیرفعال کنید تا سرور جدیدی روی آن ساخته نشود.`,
      400,
      { code: 'has_servers' },
    );
  }
  await prisma.hetznerAccount.delete({ where: { id } });
}

/** به‌روزرسانی ظرفیت و سلامت یک حساب با پرس‌وجو از هتزنر */
export async function refreshAccount(id: string): Promise<AccountSummary> {
  const account = await getAccount(id);

  const panelCount = await prisma.server.count({
    where: { hetznerAccountId: id, deletedAt: null, status: { notIn: ['DELETED'] } },
  });

  try {
    const client = new HetznerClient(accountToken(account));
    const servers = await client.listServers();

    const atLimit = servers.length >= account.maxServers;
    const updated = await prisma.hetznerAccount.update({
      where: { id },
      data: {
        serverCount: servers.length,
        panelCount,
        rateRemaining: client.rateLimitRemaining,
        status: !account.enabled ? 'DISABLED' : atLimit ? 'LIMIT_REACHED' : 'OK',
        lastError: null,
        lastCheckedAt: new Date(),
      },
    });
    return summarize(updated);
  } catch (err) {
    const message = err instanceof HetznerError ? err.message : 'ارتباط با هتزنر برقرار نشد.';
    const updated = await prisma.hetznerAccount.update({
      where: { id },
      data: { status: 'ERROR', lastError: message.slice(0, 500), panelCount, lastCheckedAt: new Date() },
    });
    return summarize(updated);
  }
}

export async function refreshAllAccounts(): Promise<{ checked: number; errors: number }> {
  const accounts = await prisma.hetznerAccount.findMany({ select: { id: true } });
  let errors = 0;
  for (const a of accounts) {
    const result = await refreshAccount(a.id);
    if (result.status === 'ERROR') errors++;
  }
  return { checked: accounts.length, errors };
}

/**
 * انتقال توکن قدیمی از فایل .env به جدول حساب‌ها.
 * فقط یک بار و در صورتی که هیچ حسابی ثبت نشده باشد اجرا می‌شود.
 */
export async function importLegacyToken(): Promise<boolean> {
  if (!env.hetzner.tokenOptional) return false;
  if (await hasAnyAccount()) return false;

  try {
    await createAccount({
      name: 'حساب اصلی',
      token: env.hetzner.tokenOptional,
      maxServers: 10,
      priority: 0,
      note: 'به‌طور خودکار از متغیر HETZNER_API_TOKEN منتقل شد.',
    });
    console.info('[hetzner] توکن فایل .env به عنوان اولین حساب ثبت شد.');
    return true;
  } catch (err) {
    console.warn('[hetzner] انتقال خودکار توکن ناموفق بود:', err instanceof Error ? err.message : err);
    return false;
  }
}
