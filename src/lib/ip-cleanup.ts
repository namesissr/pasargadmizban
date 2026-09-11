import prisma from './prisma';
import { deletePrimaryIpWithRetry, type HPrimaryIp } from './hetzner';
import { allActiveClients } from './hetzner-accounts';
import { notifyStaff } from './notify';

/**
 * جاروب آدرس‌های بلااستفاده.
 *
 * هتزنر برای هر Primary IP — حتی وقتی به هیچ سروری وصل نیست — هزینه ماهانه
 * می‌گیرد. آدرس بلااستفاده از دو جا پیدا می‌شود: تعویض آی‌پی‌ای که حذف آدرس
 * قدیمی‌اش شکست خورده، و سرور حذف‌شده‌ای که آدرسش auto_delete نداشته. این جاروب
 * هر ساعت همه حساب‌ها را می‌گردد و هر آدرس جدا افتاده را پاک می‌کند تا هیچ
 * هزینه پنهانی روی حساب‌های هتزنر نماند.
 */

/** آدرس‌های جوان‌تر از این سن دست نمی‌خورند تا با تعویض در جریان تداخل نشود */
const GRACE_MS = 30 * 60_000;

export type OrphanIp = {
  accountId: string;
  accountName: string;
  hetznerId: number;
  ip: string;
  name: string;
  createdAt: string;
};

export type OrphanSweepResult = {
  scannedAccounts: number;
  found: number;
  deleted: number;
  skippedYoung: number;
  failed: OrphanIp[];
  errors: string[];
};

/** آیا این آدرس واقعاً جدا افتاده است؟ */
async function isOrphan(ip: HPrimaryIp): Promise<'orphan' | 'young' | 'in-use'> {
  if (ip.assignee_id !== null) return 'in-use';
  if (ip.protection?.delete) return 'in-use';

  // مهلت امن برای عملیات در جریان (مثلاً تعویض آی‌پی که هنوز تمام نشده)
  if (Date.now() - new Date(ip.created).getTime() < GRACE_MS) return 'young';

  // محافظ دوم: اگر به هر دلیل رکورد سروری در پنل به این شناسه اشاره می‌کند، دست نزن
  const referenced = await prisma.server.findFirst({
    where: { primaryIpId: BigInt(ip.id), deletedAt: null },
    select: { id: true },
  });
  if (referenced) return 'in-use';

  return 'orphan';
}

/** فقط شمارش، بدون حذف — برای نمایش در پنل مدیریت */
export async function listOrphanIps(): Promise<{ orphans: OrphanIp[]; errors: string[] }> {
  const orphans: OrphanIp[] = [];
  const errors: string[] = [];

  for (const { account, client } of await allActiveClients()) {
    try {
      const ips = await client.listPrimaryIps();
      for (const ip of ips) {
        if ((await isOrphan(ip)) === 'orphan') {
          orphans.push({
            accountId: account.id,
            accountName: account.name,
            hetznerId: ip.id,
            ip: ip.ip,
            name: ip.name,
            createdAt: ip.created,
          });
        }
      }
    } catch (err) {
      errors.push(`${account.name}: ${err instanceof Error ? err.message : 'خطای نامشخص'}`);
    }
  }

  return { orphans, errors };
}

/** پیدا کردن و حذف همه آدرس‌های جدا افتاده در همه حساب‌ها */
export async function cleanupOrphanIps(): Promise<OrphanSweepResult> {
  const result: OrphanSweepResult = {
    scannedAccounts: 0,
    found: 0,
    deleted: 0,
    skippedYoung: 0,
    failed: [],
    errors: [],
  };

  const deletedIps: string[] = [];

  for (const { account, client } of await allActiveClients()) {
    result.scannedAccounts++;
    let ips: HPrimaryIp[];
    try {
      ips = await client.listPrimaryIps();
    } catch (err) {
      result.errors.push(`${account.name}: ${err instanceof Error ? err.message : 'خطای نامشخص'}`);
      continue;
    }

    for (const ip of ips) {
      const state = await isOrphan(ip);
      if (state === 'young') {
        result.skippedYoung++;
        continue;
      }
      if (state !== 'orphan') continue;

      result.found++;
      const removed = await deletePrimaryIpWithRetry(client, ip.id, 3);
      if (removed) {
        result.deleted++;
        deletedIps.push(`${ip.ip} (${account.name})`);
      } else {
        result.failed.push({
          accountId: account.id,
          accountName: account.name,
          hetznerId: ip.id,
          ip: ip.ip,
          name: ip.name,
          createdAt: ip.created,
        });
      }
    }
  }

  if (deletedIps.length) {
    await notifyStaff({
      kind: 'security',
      type: 'info',
      title: `${deletedIps.length} آدرس بلااستفاده از هتزنر پاک شد`,
      body: `این آدرس‌ها به هیچ سروری وصل نبودند و فقط هزینه می‌ساختند:\n${deletedIps.join('\n')}`,
      dedupeHours: 1,
      wait: true,
    }).catch(() => null);
  }

  if (result.failed.length) {
    await notifyStaff({
      kind: 'security',
      type: 'warning',
      title: `${result.failed.length} آدرس بلااستفاده حذف نشد`,
      body:
        result.failed.map((f) => `${f.ip} در ${f.accountName}`).join('\n') +
        '\nاز کنسول هتزنر بررسی و در صورت نیاز دستی حذفشان کنید.',
      dedupeHours: 6,
      wait: true,
    }).catch(() => null);
  }

  return result;
}
