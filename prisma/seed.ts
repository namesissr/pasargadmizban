import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_SETTINGS } from '../src/lib/settings';

const prisma = new PrismaClient();

const DEPARTMENTS = [
  { name: 'فروش و پیش از خرید', slug: 'sales', sortOrder: 1 },
  { name: 'پشتیبانی فنی', slug: 'technical', sortOrder: 2 },
  { name: 'امور مالی و صورتحساب', slug: 'billing', sortOrder: 3 },
  { name: 'سوءاستفاده و گزارش تخلف', slug: 'abuse', sortOrder: 4 },
];

async function main() {
  console.log('🌱 در حال آماده‌سازی داده‌های اولیه…');

  // ── تنظیمات پیش‌فرض ──
  let settingsCount = 0;
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    const existing = await prisma.setting.findUnique({ where: { key } });
    if (!existing) {
      await prisma.setting.create({
        data: { key, value: value as never, group: 'general' },
      });
      settingsCount++;
    }
  }
  console.log(`   • تنظیمات: ${settingsCount} مقدار جدید ثبت شد.`);

  // ── دپارتمان‌های پشتیبانی ──
  for (const dept of DEPARTMENTS) {
    await prisma.ticketDepartment.upsert({
      where: { slug: dept.slug },
      create: dept,
      update: { name: dept.name, sortOrder: dept.sortOrder },
    });
  }
  console.log(`   • دپارتمان‌های پشتیبانی: ${DEPARTMENTS.length} مورد.`);

  // ── قانون قیمت‌گذاری سراسری ──
  const globalRule = await prisma.pricingRule.findFirst({ where: { scope: 'GLOBAL' } });
  if (!globalRule) {
    await prisma.pricingRule.create({
      data: {
        scope: 'GLOBAL',
        markupPercent: DEFAULT_SETTINGS.markupPercent,
        markupFixed: BigInt(DEFAULT_SETTINGS.markupFixed),
        priority: 0,
        active: true,
        note: 'قانون پیش‌فرض سود روی تمام پلن‌ها',
      },
    });
    console.log('   • قانون قیمت‌گذاری سراسری ساخته شد.');
  }

  // ── اعلان خوش‌آمد ──
  const announcement = await prisma.announcement.findFirst();
  if (!announcement) {
    await prisma.announcement.create({
      data: {
        title: 'به پنل پاسارگاد میزبان خوش آمدید',
        body: 'برای شروع، کیف پول خود را شارژ کنید و اولین سرور ابری خود را در کمتر از یک دقیقه بسازید.',
        level: 'info',
        pinned: true,
        active: true,
      },
    });
  }

  // انتقال توکن قدیمی از فایل .env به جدول حساب‌ها
  if (process.env.HETZNER_API_TOKEN) {
    const { importLegacyToken } = await import('../src/lib/hetzner-accounts');
    const imported = await importLegacyToken();
    if (imported) console.log('   • توکن HETZNER_API_TOKEN به عنوان اولین حساب ثبت شد.');
  }

  const accountCount = await prisma.hetznerAccount.count();
  console.log(`   • حساب‌های هتزنر: ${accountCount} مورد.`);

  const userCount = await prisma.user.count();
  console.log(`\n✅ آماده‌سازی کامل شد. تعداد کاربران فعلی: ${userCount}`);
  if (userCount === 0) {
    console.log('\n👉 گام بعد: در آدرس /register ثبت‌نام کنید.');
    console.log('   اولین حساب به صورت خودکار دسترسی «مدیر کل» می‌گیرد.');
    console.log('   سپس در /admin/hetzner حساب هتزنر و در /admin/pricing نرخ یورو را وارد کنید.');
  }
}

main()
  .catch((err) => {
    console.error('❌ خطا در آماده‌سازی داده‌ها:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
