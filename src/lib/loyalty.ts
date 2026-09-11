import prisma from './prisma';
import { getSettings, type SettingsShape } from './settings';
import { notify } from './notify';

/**
 * باشگاه مشتریان.
 *
 * منطق ساده و صادقانه: هرچه بیشتر مصرف کنید، ارزان‌تر می‌خرید. مجموع مصرف واقعی
 * (پول‌هایی که بابت سرویس کسر شده، منهای بازگشتی‌ها) سطح شما را تعیین می‌کند و هر
 * سطح یک درصد تخفیف دائمی روی همه قیمت‌ها می‌دهد. سطح هرگز پایین نمی‌آید و تخفیف
 * دستی مدیر هم اگر بیشتر باشد، همان اعمال می‌شود.
 */

export type LoyaltyTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'DIAMOND';

export const TIER_FA: Record<LoyaltyTier, { label: string; emoji: string }> = {
  BRONZE: { label: 'برنزی', emoji: '🥉' },
  SILVER: { label: 'نقره‌ای', emoji: '🥈' },
  GOLD: { label: 'طلایی', emoji: '🥇' },
  DIAMOND: { label: 'الماس', emoji: '💎' },
};

export type TierDef = { tier: LoyaltyTier; minSpend: bigint; pct: number };

export function tierTable(settings: SettingsShape): TierDef[] {
  return [
    { tier: 'BRONZE', minSpend: 0n, pct: 0 },
    { tier: 'SILVER', minSpend: BigInt(settings.loyaltySilverSpend), pct: settings.loyaltySilverPct },
    { tier: 'GOLD', minSpend: BigInt(settings.loyaltyGoldSpend), pct: settings.loyaltyGoldPct },
    { tier: 'DIAMOND', minSpend: BigInt(settings.loyaltyDiamondSpend), pct: settings.loyaltyDiamondPct },
  ];
}

export function tierForSpend(spend: bigint, table: TierDef[]): TierDef {
  let current = table[0];
  for (const def of table) {
    if (spend >= def.minSpend) current = def;
  }
  return current;
}

/** مجموع مصرف واقعی یک کاربر: کسر بابت سرویس منهای بازگشت وجه */
export async function computeSpend(userId: string): Promise<bigint> {
  const [charges, refunds] = await Promise.all([
    prisma.transaction.aggregate({
      where: { userId, type: 'CHARGE', direction: 'DEBIT', status: 'SUCCESS' },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, type: 'REFUND', direction: 'CREDIT', status: 'SUCCESS' },
      _sum: { amount: true },
    }),
  ]);
  const spend = (charges._sum.amount ?? 0n) - (refunds._sum.amount ?? 0n);
  return spend > 0n ? spend : 0n;
}

/** وضعیت باشگاه برای نمایش به کاربر */
export async function loyaltyStatus(userId: string) {
  const settings = await getSettings();
  const table = tierTable(settings);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { loyaltySpend: true, loyaltyTier: true, loyaltyPct: true, discountPct: true },
  });
  if (!user) return null;

  const current = tierForSpend(user.loyaltySpend, table);
  const next = table.find((t) => t.minSpend > user.loyaltySpend) ?? null;

  return {
    enabled: settings.loyaltyEnabled,
    tier: current.tier,
    tierFa: TIER_FA[current.tier],
    pct: user.loyaltyPct,
    manualPct: user.discountPct,
    effectivePct: Math.max(user.loyaltyPct, user.discountPct),
    spend: Number(user.loyaltySpend),
    next: next
      ? {
          tier: next.tier,
          tierFa: TIER_FA[next.tier],
          pct: next.pct,
          minSpend: Number(next.minSpend),
          remaining: Number(next.minSpend - user.loyaltySpend),
          progressPercent: Math.min(
            99,
            Math.floor((Number(user.loyaltySpend) / Number(next.minSpend)) * 100),
          ),
        }
      : null,
    table: table.map((t) => ({
      tier: t.tier,
      tierFa: TIER_FA[t.tier],
      minSpend: Number(t.minSpend),
      pct: t.pct,
    })),
  };
}

/**
 * بازمحاسبه سطح یک کاربر. سطح فقط بالا می‌رود؛ با بازگشت وجه بزرگ هم چیزی از
 * کاربر پس گرفته نمی‌شود تا حس بدی نسازد.
 */
export async function refreshUserLoyalty(userId: string): Promise<{ upgraded: boolean; tier: LoyaltyTier }> {
  const settings = await getSettings();
  if (!settings.loyaltyEnabled) return { upgraded: false, tier: 'BRONZE' };

  const table = tierTable(settings);
  const spend = await computeSpend(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { loyaltyTier: true, loyaltyPct: true, firstName: true },
  });
  if (!user) return { upgraded: false, tier: 'BRONZE' };

  const target = tierForSpend(spend, table);
  const order: LoyaltyTier[] = ['BRONZE', 'SILVER', 'GOLD', 'DIAMOND'];
  const currentIdx = order.indexOf((user.loyaltyTier as LoyaltyTier) ?? 'BRONZE');
  const targetIdx = order.indexOf(target.tier);

  // سطح پایین نمی‌آید؛ درصد سطح فعلی از جدول روز خوانده می‌شود
  const finalIdx = Math.max(currentIdx, targetIdx);
  const finalDef = table[finalIdx];

  await prisma.user.update({
    where: { id: userId },
    data: { loyaltySpend: spend, loyaltyTier: finalDef.tier, loyaltyPct: finalDef.pct },
  });

  const upgraded = finalIdx > currentIdx;
  if (upgraded) {
    const fa = TIER_FA[finalDef.tier];
    await notify(userId, {
      kind: 'billing',
      type: 'success',
      title: `به سطح ${fa.label} باشگاه مشتریان رسیدید ${fa.emoji}`,
      body: [
        `از این پس ${finalDef.pct}٪ تخفیف دائمی روی همه پلن‌ها دارید و خودکار در قیمت‌ها اعمال می‌شود.`,
        'این سطح هیچ‌وقت پایین نمی‌آید.',
      ].join('\n'),
      link: '/dashboard/profile',
      email: true,
      wait: true,
    });
  }

  return { upgraded, tier: finalDef.tier };
}

/** کار پس‌زمینه: بازمحاسبه سطح همه کاربران فعال */
export async function refreshAllLoyalty(): Promise<{ checked: number; upgraded: number }> {
  const settings = await getSettings();
  if (!settings.loyaltyEnabled) return { checked: 0, upgraded: 0 };

  const users = await prisma.user.findMany({
    where: { deletedAt: null, status: 'ACTIVE' },
    select: { id: true },
  });

  let upgraded = 0;
  for (const user of users) {
    try {
      const res = await refreshUserLoyalty(user.id);
      if (res.upgraded) upgraded++;
    } catch (err) {
      console.error(`[loyalty] بازمحاسبه کاربر ${user.id} ناموفق بود:`, err);
    }
  }
  return { checked: users.length, upgraded };
}
