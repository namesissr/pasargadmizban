import 'dotenv/config';
import prisma from '../src/lib/prisma';
import { capacityOverview, clientForAccount } from '../src/lib/hetzner-accounts';
import { probeAgentHealth } from '../src/lib/ip-reachability';
import { prefixOverview } from '../src/lib/ip-prefix';
import { getSettings } from '../src/lib/settings';

/**
 * بررسی سلامت سامانه — قبل و بعد از استقرار اجرا کنید.
 * اجرا: npx tsx scripts/health-check.ts
 */

const checks: { name: string; ok: boolean; detail: string }[] = [];

function record(name: string, ok: boolean, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log('═══ بررسی سلامت پاسارگاد میزبان ═══\n');

  // ── متغیرهای محیطی ──
  const secret = process.env.SESSION_SECRET ?? '';
  record('SESSION_SECRET', secret.length >= 32, secret ? `${secret.length} کاراکتر` : 'تنظیم نشده');

  const encKey = process.env.ENCRYPTION_KEY ?? '';
  record('ENCRYPTION_KEY', /^[0-9a-fA-F]{64}$/.test(encKey), encKey ? `${encKey.length} کاراکتر` : 'تنظیم نشده');

  record('DATABASE_URL', Boolean(process.env.DATABASE_URL), process.env.DATABASE_URL ? 'تنظیم شده' : 'تنظیم نشده');
  record('APP_URL', Boolean(process.env.APP_URL), process.env.APP_URL ?? 'تنظیم نشده');

  // ── دیتابیس ──
  try {
    await prisma.$queryRaw`SELECT 1`;
    record('اتصال به دیتابیس', true);
  } catch (e) {
    record('اتصال به دیتابیس', false, e instanceof Error ? e.message : 'ناموفق');
    printSummary();
    return;
  }

  const [users, admins, servers, settingsCount, departments] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'ADMIN', deletedAt: null } }),
    prisma.server.count({ where: { status: { notIn: ['DELETED'] } } }),
    prisma.setting.count(),
    prisma.ticketDepartment.count(),
  ]);

  record('جدول تنظیمات پر شده', settingsCount > 0, `${settingsCount} کلید`);
  record('دپارتمان‌های پشتیبانی', departments > 0, `${departments} بخش`);
  record('حداقل یک مدیر وجود دارد', admins > 0, `${admins} مدیر از ${users} کاربر`);

  // ── کاتالوگ ──
  const [types, locations, images] = await Promise.all([
    prisma.hetznerServerType.count({ where: { enabled: true } }),
    prisma.hetznerLocation.count({ where: { enabled: true } }),
    prisma.hetznerImage.count({ where: { enabled: true } }),
  ]);
  record('کاتالوگ پلن‌ها', types > 0, `${types} پلن فعال`);
  record('کاتالوگ لوکیشن‌ها', locations > 0, `${locations} لوکیشن فعال`);
  record('کاتالوگ سیستم‌عامل‌ها', images > 0, `${images} سیستم‌عامل فعال`);

  // ── حساب‌های هتزنر ──
  const capacity = await capacityOverview();
  record(
    'حساب هتزنر ثبت شده',
    capacity.totals.enabled > 0,
    capacity.totals.accounts === 0
      ? 'هیچ حسابی اضافه نشده — به /admin/hetzner بروید'
      : `${capacity.totals.enabled} حساب فعال از ${capacity.totals.accounts}`,
  );
  record(
    'ظرفیت ساخت سرور',
    capacity.totals.freeSlots > 0,
    `${capacity.totals.freeSlots} جای خالی از ${capacity.totals.totalSlots} (${capacity.totals.usagePercent}٪ اشغال)`,
  );

  for (const account of capacity.accounts.filter((a) => a.enabled)) {
    try {
      const client = await clientForAccount(account.id);
      const locs = await client.listLocations();
      record(`اتصال به «${account.name}»`, locs.length > 0, `${locs.length} لوکیشن دریافت شد`);
    } catch (e) {
      record(`اتصال به «${account.name}»`, false, e instanceof Error ? e.message : 'ناموفق');
    }
  }

  const settings = await getSettings(true);

  // ── سرویس آزمایش دسترسی از ایران ──
  if (settings.ipProbeEnabled) {
    const probe = await probeAgentHealth();
    record('سرویس آزمایش دسترسی از ایران', probe.ok, probe.message);
    const prefixes = await prefixOverview();
    record(
      'حافظه رنج‌های آدرس',
      true,
      `${prefixes.total} بلوک شناخته‌شده · ${prefixes.blocked} بلوک سوخته`,
    );
  } else {
    record('بررسی دسترسی آدرس از ایران', false, 'در تنظیمات خاموش است');
  }

  // ── قیمت‌گذاری ──
  record('نرخ یورو تنظیم شده', settings.eurRate > 1000, `${settings.eurRate.toLocaleString('fa-IR')} تومان`);
  record('درصد سود منطقی', settings.markupPercent > 0, `${settings.markupPercent}٪`);

  // ── درگاه پرداخت ──
  const merchant = process.env.ZIBAL_MERCHANT ?? '';
  record(
    'کد مرچنت زیبال',
    merchant !== '' && merchant !== 'zibal',
    merchant === 'zibal' ? 'در حالت تست (پول واقعی دریافت نمی‌شود)' : 'تنظیم شده',
  );

  // ── ورکر ──
  const lastJob = await prisma.jobRun.findFirst({ orderBy: { startedAt: 'desc' } });
  const jobFresh = lastJob ? Date.now() - lastJob.startedAt.getTime() < 3 * 3600_000 : false;
  record(
    'ورکر پس‌زمینه در حال اجرا',
    jobFresh,
    lastJob ? `آخرین کار: ${lastJob.job} در ${lastJob.startedAt.toLocaleString('fa-IR')}` : 'هیچ کاری اجرا نشده',
  );

  // ── یکپارچگی مالی ──
  const usersWithTx = await prisma.user.findMany({
    where: { transactions: { some: { status: 'SUCCESS' } } },
    select: { id: true, email: true, balance: true },
    take: 500,
  });
  let mismatches = 0;
  for (const u of usersWithTx) {
    const agg = await prisma.transaction.groupBy({
      by: ['direction'],
      where: { userId: u.id, status: 'SUCCESS' },
      _sum: { amount: true },
    });
    const credit = agg.find((a) => a.direction === 'CREDIT')?._sum.amount ?? 0n;
    const debit = agg.find((a) => a.direction === 'DEBIT')?._sum.amount ?? 0n;
    if (credit - debit !== u.balance) {
      mismatches++;
      console.log(`   ⚠️  مغایرت برای ${u.email}: دفتر ${credit - debit} ≠ موجودی ${u.balance}`);
    }
  }
  record('مطابقت دفتر مالی با موجودی‌ها', mismatches === 0, `${usersWithTx.length} کاربر بررسی شد`);

  // ── سرورهای گیرکرده ──
  const stuck = await prisma.server.count({
    where: { status: 'PROVISIONING', createdAt: { lt: new Date(Date.now() - 3600_000) } },
  });
  record('سرور گیرکرده در حالت ساخت', stuck === 0, stuck > 0 ? `${stuck} سرور` : 'موردی نیست');

  console.log(`\n📊 ${servers} سرور فعال · ${users} کاربر`);
  printSummary();
}

function printSummary() {
  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${'═'.repeat(46)}`);
  console.log(`نتیجه: ${checks.length - failed.length} از ${checks.length} بررسی موفق`);
  if (failed.length) {
    console.log('\nموارد نیازمند رسیدگی:');
    for (const f of failed) console.log(`   • ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error('❌ خطا:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
