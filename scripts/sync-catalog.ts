import 'dotenv/config';
import prisma from '../src/lib/prisma';
import { syncCatalog } from '../src/lib/catalog';
import { hasAnyAccount } from '../src/lib/hetzner-accounts';

/**
 * همگام‌سازی دستی کاتالوگ هتزنر.
 * اجرا: npm run catalog:sync
 */
async function main() {
  if (!(await hasAnyAccount())) {
    console.error('❌ هیچ حساب هتزنری ثبت نشده است.');
    console.error('   در پنل مدیریت، بخش «حساب‌های هتزنر» (/admin/hetzner)، توکن API خود را اضافه کنید.');
    process.exit(1);
  }

  console.log('⏳ در حال دریافت اطلاعات از هتزنر…');
  const result = await syncCatalog();

  console.log('✅ همگام‌سازی کامل شد:');
  console.log(`   • لوکیشن‌ها: ${result.locations}`);
  console.log(`   • دیتاسنترها: ${result.datacenters}`);
  console.log(`   • پلن‌ها: ${result.serverTypes}`);
  console.log(`   • سیستم‌عامل‌ها: ${result.images}`);
  console.log(`   • مدت زمان: ${result.durationMs}ms`);

  const enabled = await prisma.hetznerServerType.count({ where: { enabled: true } });
  console.log(`\n📦 ${enabled} پلن آماده فروش است.`);
  console.log('   برای فعال یا غیرفعال کردن پلن‌ها به /admin/catalog بروید.');
}

main()
  .catch((err) => {
    console.error('❌ خطا در همگام‌سازی:', err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
