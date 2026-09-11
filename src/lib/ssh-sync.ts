import prisma from './prisma';
import type { HetznerAccount, SshKey } from '@prisma/client';
import { HetznerError } from './hetzner';
import { accountToken, clientForAccount } from './hetzner-accounts';
import { HetznerClient } from './hetzner';

/**
 * همگام‌سازی کلیدهای SSH با حساب‌های هتزنر.
 *
 * هر کلید باید جداگانه در هر پروژه آپلود شود، چون پروژه‌ها از هم مستقل‌اند.
 * نگاشت «کلید ← حساب ← شناسه در هتزنر» در جدول SshKeyRemote نگه داشته می‌شود.
 */

/** اطمینان از وجود کلیدها در حساب مشخص و برگرداندن شناسه‌های هتزنری آن‌ها */
export async function ensureKeysOnAccount(
  keys: SshKey[],
  account: HetznerAccount,
): Promise<number[]> {
  if (!keys.length) return [];

  const client = new HetznerClient(accountToken(account));
  const ids: number[] = [];

  // نگاشت‌های موجود
  const existing = await prisma.sshKeyRemote.findMany({
    where: { accountId: account.id, sshKeyId: { in: keys.map((k) => k.id) } },
  });
  const known = new Map(existing.map((r) => [r.sshKeyId, Number(r.hetznerId)]));

  // کلیدهایی که هنوز آپلود نشده‌اند
  const missing = keys.filter((k) => !known.has(k.id));

  let remoteKeys: Awaited<ReturnType<HetznerClient['listSshKeys']>> | null = null;

  for (const key of missing) {
    try {
      const created = await client.createSshKey(
        `pm-${key.userId.slice(0, 8)}-${key.name}`.slice(0, 60),
        key.publicKey,
        { panel: 'pasargad-mizban', user: key.userId, key: key.id },
      );
      await prisma.sshKeyRemote.create({
        data: { sshKeyId: key.id, accountId: account.id, hetznerId: BigInt(created.id) },
      });
      known.set(key.id, created.id);
    } catch (err) {
      if (err instanceof HetznerError && err.code === 'uniqueness_error') {
        // کلید از قبل در این پروژه هست — با اثر انگشت پیدایش کن
        remoteKeys ??= await client.listSshKeys();
        const match = remoteKeys.find((r) => r.fingerprint === key.fingerprint);
        if (match) {
          await prisma.sshKeyRemote
            .create({ data: { sshKeyId: key.id, accountId: account.id, hetznerId: BigInt(match.id) } })
            .catch(() => null);
          known.set(key.id, match.id);
          continue;
        }
      }
      throw err;
    }
  }

  for (const key of keys) {
    const id = known.get(key.id);
    if (id !== undefined) ids.push(id);
  }
  return ids;
}

/** شناسه‌های هتزنری کلیدهای یک سرور در حساب خودش */
export async function keyIdsForServer(sshKeyIds: string[], accountId: string | null): Promise<number[]> {
  if (!sshKeyIds.length || !accountId) return [];
  const remotes = await prisma.sshKeyRemote.findMany({
    where: { accountId, sshKeyId: { in: sshKeyIds } },
  });
  return remotes.map((r) => Number(r.hetznerId));
}

/** حذف کلید از تمام حساب‌هایی که در آن‌ها آپلود شده */
export async function removeKeyEverywhere(sshKeyId: string): Promise<{ removed: number; failed: number }> {
  const remotes = await prisma.sshKeyRemote.findMany({ where: { sshKeyId } });
  let removed = 0;
  let failed = 0;

  for (const remote of remotes) {
    try {
      const client = await clientForAccount(remote.accountId);
      await client.deleteSshKey(remote.hetznerId);
      removed++;
    } catch (err) {
      if (err instanceof HetznerError && err.code === 'not_found') {
        removed++;
      } else {
        failed++;
        console.warn('[ssh-sync] حذف کلید از حساب ناموفق بود:', err);
      }
    }
  }

  await prisma.sshKeyRemote.deleteMany({ where: { sshKeyId } });
  return { removed, failed };
}
