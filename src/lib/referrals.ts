import prisma from './prisma';
import { getSettings } from './settings';
import { credit } from './wallet';
import { notify } from './notify';
import { formatToman } from './money';

/**
 * برنامه معرفی: هر بار که کاربر معرفی‌شده کیف پولش را شارژ می‌کند،
 * درصدی از آن به صورت اعتبار به معرف تعلق می‌گیرد.
 *
 * پورسانت فقط برای واریزهای موفق (نه تعدیل دستی و نه هدیه) محاسبه می‌شود
 * و هر تراکنش حداکثر یک بار پورسانت می‌دهد.
 */

export async function payReferralCommission(transactionId: string): Promise<bigint> {
  const settings = await getSettings();
  if (!settings.referralEnabled || settings.referralPercent <= 0) return 0n;

  const trx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: {
      id: true,
      userId: true,
      amount: true,
      type: true,
      status: true,
      user: { select: { id: true, email: true, firstName: true, lastName: true, referredById: true } },
    },
  });

  if (!trx || trx.status !== 'SUCCESS' || trx.type !== 'DEPOSIT') return 0n;
  if (!trx.user.referredById) return 0n;
  if (trx.amount < BigInt(settings.referralMinDeposit)) return 0n;

  // جلوگیری از پرداخت دوباره برای همان تراکنش
  const existing = await prisma.referralCommission.findUnique({ where: { transactionId: trx.id } });
  if (existing) return 0n;

  const referrer = await prisma.user.findUnique({
    where: { id: trx.user.referredById },
    select: { id: true, deletedAt: true, status: true },
  });
  if (!referrer || referrer.deletedAt || referrer.status === 'BANNED') return 0n;

  let amount = (trx.amount * BigInt(Math.round(settings.referralPercent * 100))) / 10_000n;
  const cap = BigInt(settings.referralMaxPerDeposit);
  if (cap > 0n && amount > cap) amount = cap;
  if (amount <= 0n) return 0n;

  const refereeName =
    [trx.user.firstName, trx.user.lastName].filter(Boolean).join(' ') || trx.user.email;

  try {
    await prisma.$transaction(async (tx) => {
      // رکورد پورسانت اول ساخته می‌شود تا قید یکتایی، پرداخت همزمان را بگیرد
      await tx.referralCommission.create({
        data: {
          referrerId: referrer.id,
          refereeId: trx.userId,
          transactionId: trx.id,
          depositAmount: trx.amount,
          percent: settings.referralPercent,
          amount,
        },
      });

      await credit(
        {
          userId: referrer.id,
          amount,
          type: 'BONUS',
          description: `پورسانت معرفی از شارژ ${refereeName}`,
          meta: { refereeId: trx.userId, transactionId: trx.id, percent: settings.referralPercent },
        },
        tx,
      );
    });
  } catch (err) {
    // اگر قید یکتایی خورد یعنی جای دیگری همزمان پرداخت کرده — خطا نیست
    if ((err as { code?: string })?.code === 'P2002') return 0n;
    console.error('[referrals] پرداخت پورسانت ناموفق بود:', err);
    return 0n;
  }

  await notify(referrer.id, {
    kind: 'billing',
    type: 'success',
    title: 'پورسانت معرفی دریافت کردید',
    body: `${formatToman(amount)} بابت شارژ حساب ${refereeName} به کیف پول شما اضافه شد.`,
    link: '/dashboard/referrals',
  });

  return amount;
}

/** هدیه خوش‌آمد به کاربری که با کد معرف ثبت‌نام کرده */
export async function payWelcomeBonus(userId: string): Promise<bigint> {
  const settings = await getSettings();
  const amount = BigInt(settings.referralWelcomeBonus);
  if (!settings.referralEnabled || amount <= 0n) return 0n;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referredById: true },
  });
  if (!user?.referredById) return 0n;

  const already = await prisma.transaction.findFirst({
    where: { userId, type: 'BONUS', description: { contains: 'هدیه خوش‌آمدگویی' } },
    select: { id: true },
  });
  if (already) return 0n;

  await credit({
    userId,
    amount,
    type: 'BONUS',
    description: 'هدیه خوش‌آمدگویی ثبت‌نام با کد معرف',
    meta: { referrerId: user.referredById },
  });

  await notify(userId, {
    kind: 'billing',
    type: 'success',
    title: 'هدیه خوش‌آمدگویی',
    body: `${formatToman(amount)} اعتبار هدیه بابت ثبت‌نام با کد معرف به کیف پول شما اضافه شد.`,
    link: '/dashboard/wallet',
  });

  return amount;
}

/** گزارش معرفی‌ها برای نمایش به کاربر */
export async function referralReport(userId: string) {
  const settings = await getSettings();

  const [user, referrals, commissions, totals] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } }),
    prisma.user.findMany({
      where: { referredById: userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, email: true, firstName: true, lastName: true, createdAt: true, status: true },
    }),
    prisma.referralCommission.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { referee: { select: { email: true, firstName: true, lastName: true } } },
    }),
    prisma.referralCommission.aggregate({
      where: { referrerId: userId },
      _sum: { amount: true, depositAmount: true },
      _count: true,
    }),
  ]);

  const activeReferrals = new Set(commissions.map((c) => c.refereeId)).size;

  return {
    enabled: settings.referralEnabled,
    percent: settings.referralPercent,
    minDeposit: settings.referralMinDeposit,
    maxPerDeposit: settings.referralMaxPerDeposit,
    welcomeBonus: settings.referralWelcomeBonus,
    code: user?.referralCode ?? null,
    link: user?.referralCode ? `${settings.siteUrl}/register?ref=${user.referralCode}` : null,
    stats: {
      invited: referrals.length,
      active: activeReferrals,
      totalEarned: Number(totals._sum.amount ?? 0),
      totalDeposits: Number(totals._sum.depositAmount ?? 0),
      payouts: totals._count,
    },
    referrals: referrals.map((r) => ({
      id: r.id,
      name: [r.firstName, r.lastName].filter(Boolean).join(' ') || maskEmail(r.email),
      email: maskEmail(r.email),
      status: r.status,
      joinedAt: r.createdAt,
      earned: Number(
        commissions.filter((c) => c.refereeId === r.id).reduce((sum, c) => sum + c.amount, 0n),
      ),
    })),
    commissions: commissions.map((c) => ({
      id: c.id,
      amount: Number(c.amount),
      depositAmount: Number(c.depositAmount),
      percent: c.percent,
      from: [c.referee.firstName, c.referee.lastName].filter(Boolean).join(' ') || maskEmail(c.referee.email),
      createdAt: c.createdAt,
    })),
  };
}

/** برای حفظ حریم خصوصی، ایمیل زیرمجموعه‌ها کامل نمایش داده نمی‌شود */
function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!domain) return email;
  const visible = name.slice(0, Math.min(3, name.length));
  return `${visible}${'*'.repeat(Math.max(2, name.length - visible.length))}@${domain}`;
}
