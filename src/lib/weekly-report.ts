import prisma from './prisma';
import { getSettings } from './settings';
import { sendMail, renderEmail, type EmailBlock } from './mail';
import { readPreferences } from './preferences';
import { formatToman, formatTraffic } from './money';
import { env } from './env';

/**
 * گزارش هفتگی ایمیلی.
 *
 * هفته‌ای یک بار، خلاصه‌ای خوانا از حساب برای هر کاربر فعال می‌فرستیم: چقدر خرج
 * شده، سرورها چه وضعی دارند، ترافیک چقدر مصرف شده و موجودی تا کی کافی است.
 * حس «حواسمان به سرویس شماست» همان چیزی است که مشتری را نگه می‌دارد؛ رقبا
 * فقط وقت مشکل سراغ مشتری می‌روند.
 */

export type WeeklyReportResult = { candidates: number; sent: number; skipped: number };

function faNum(n: number | bigint): string {
  return new Intl.NumberFormat('fa-IR').format(typeof n === 'bigint' ? Number(n) : n);
}

/** ساخت و ارسال گزارش یک کاربر؛ true یعنی ارسال شد */
export async function sendWeeklyReportFor(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      balance: true,
    },
  });
  if (!user?.email) return false;

  const prefs = await readPreferences(userId);
  if (prefs && (!prefs.weeklyReport || !prefs.emailEnabled)) return false;

  const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000);

  const [servers, spendAgg, topupAgg, traffic, monitors, openTickets] = await Promise.all([
    prisma.server.findMany({
      where: { userId, deletedAt: null, status: { notIn: ['DELETED'] } },
      select: { id: true, name: true, status: true, priceHourly: true, priceMonthly: true, billingCycle: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, type: 'CHARGE', direction: 'DEBIT', status: 'SUCCESS', createdAt: { gte: weekAgo } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, type: 'DEPOSIT', status: 'SUCCESS', createdAt: { gte: weekAgo } },
      _sum: { amount: true },
    }),
    prisma.trafficUsage.aggregate({
      where: { server: { userId }, date: { gte: weekAgo } },
      _sum: { outgoingBytes: true, incomingBytes: true },
    }),
    prisma.serverMonitor.findMany({
      where: { userId, enabled: true },
      select: { status: true },
    }),
    prisma.ticket.count({ where: { userId, status: { in: ['OPEN', 'ANSWERED', 'CUSTOMER_REPLY'] } } }),
  ]);

  // کاربر بدون سرور و بدون هزینه، گزارشی نمی‌خواهد
  if (servers.length === 0) return false;

  const spent = spendAgg._sum.amount ?? 0n;
  const deposited = topupAgg._sum.amount ?? 0n;
  const running = servers.filter((s) => s.status === 'RUNNING').length;
  const down = monitors.filter((m) => m.status === 'DOWN').length;
  const totalTraffic = (traffic._sum.outgoingBytes ?? 0n) + (traffic._sum.incomingBytes ?? 0n);

  // برآورد دوام موجودی با نرخ مصرف ساعتی فعلی
  const hourlyBurn = servers
    .filter((s) => s.billingCycle === 'HOURLY' && s.status !== 'SUSPENDED')
    .reduce((sum, s) => sum + s.priceHourly, 0n);
  const hoursLeft = hourlyBurn > 0n ? Number(user.balance / hourlyBurn) : null;
  const daysLeft = hoursLeft !== null ? Math.floor(hoursLeft / 24) : null;

  const lowBalance = daysLeft !== null && daysLeft < 3;

  const blocks: EmailBlock[] = [
    {
      type: 'kv',
      rows: [
        { label: 'سرورهای فعال', value: `${faNum(running)} از ${faNum(servers.length)}` },
        { label: 'هزینه این هفته', value: formatToman(spent) },
        ...(deposited > 0n ? [{ label: 'شارژ این هفته', value: formatToman(deposited) }] : []),
        { label: 'ترافیک مصرفی هفته', value: formatTraffic(totalTraffic) },
        { label: 'موجودی کیف پول', value: formatToman(user.balance), strong: true },
        ...(daysLeft !== null
          ? [{ label: 'دوام موجودی', value: `حدود ${faNum(daysLeft)} روز` }]
          : []),
        ...(openTickets > 0 ? [{ label: 'تیکت باز', value: faNum(openTickets) }] : []),
      ],
    },
  ];

  if (down > 0) {
    blocks.push({
      type: 'note',
      tone: 'danger',
      text: `${faNum(down)} سرویس شما در پایش، خارج از دسترس گزارش شده است. از تب «پایش» سرور بررسی کنید.`,
    });
  }

  if (lowBalance) {
    blocks.push({
      type: 'note',
      tone: 'warning',
      text: 'موجودی شما برای کمتر از ۳ روز کافی است. برای جلوگیری از تعلیق سرورها، کیف پول را شارژ کنید.',
    });
    blocks.push({ type: 'button', label: 'شارژ کیف پول', url: `${env.appUrl}/dashboard/wallet` });
  } else {
    blocks.push({ type: 'button', label: 'مشاهده داشبورد', url: `${env.appUrl}/dashboard` });
  }

  blocks.push({
    type: 'text',
    muted: true,
    text: 'اگر مایل به دریافت این گزارش نیستید، از بخش «اطلاع‌رسانی» پنل خاموشش کنید.',
  });

  const name = user.firstName || 'کاربر';
  const html = renderEmail({
    title: 'گزارش هفتگی حساب شما',
    preheader: `این هفته: ${formatToman(spent)} هزینه · ${faNum(running)} سرور فعال`,
    greeting: `${name} عزیز،`,
    blocks,
  });

  return sendMail({
    to: user.email,
    subject: `گزارش هفتگی — ${env.appName}`,
    html,
    text: [
      `سرورهای فعال: ${running} از ${servers.length}`,
      `هزینه این هفته: ${formatToman(spent)}`,
      `موجودی: ${formatToman(user.balance)}`,
    ].join('\n'),
  });
}

/** کار پس‌زمینه: ارسال گزارش برای همه کاربران واجد شرایط */
export async function runWeeklyReports(): Promise<WeeklyReportResult> {
  const settings = await getSettings();
  if (!settings.weeklyReportEnabled) return { candidates: 0, sent: 0, skipped: 0 };

  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      servers: { some: { deletedAt: null, status: { notIn: ['DELETED'] } } },
    },
    select: { id: true },
  });

  let sent = 0;
  let skipped = 0;
  for (const user of users) {
    try {
      if (await sendWeeklyReportFor(user.id)) sent++;
      else skipped++;
    } catch (err) {
      skipped++;
      console.error(`[weekly-report] ارسال برای ${user.id} ناموفق بود:`, err);
    }
  }
  return { candidates: users.length, sent, skipped };
}
