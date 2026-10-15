import 'dotenv/config';
import { randomInt } from 'node:crypto';
import prisma from '../src/lib/prisma';
import { hashPassword } from '../src/lib/crypto';
import { getSettings } from '../src/lib/settings';
import { audit } from '../src/lib/audit';

/**
 * ساخت حساب مدیر برای پنل، از خط فرمان.
 *
 * روی نصب وبلاگ، صفحه ثبت‌نام عمومی معمولاً بسته است و اولین حساب را هم
 * نمی‌خواهیم از راه وب بسازیم. این دستور حساب مدیر را مستقیم در دیتابیس
 * می‌سازد (یا حساب موجود را به مدیر ارتقا می‌دهد) و رمز را یک بار چاپ
 * می‌کند. رمز هیچ‌جا ذخیره نمی‌شود؛ فقط هش آن در دیتابیس می‌ماند.
 *
 * نمونه:
 *   npm run admin:create -- --email admin@example.com
 *   npm run admin:create -- --email admin@example.com --password 'MyStrongPass123'
 *   npm run admin:create -- --email admin@example.com --reset   # فقط رمز تازه
 */

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) return undefined;
  return value.trim();
}

const has = (name: string) => process.argv.includes(`--${name}`);

/**
 * رمز تصادفی خوانا: حروف و رقم‌هایی که با هم اشتباه نمی‌شوند
 * (بدون 0/O و 1/l/I) تا هنگام تایپ دستی دردسر نشود.
 */
function strongPassword(length = 18): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  // سیاست رمز پروژه: دست‌کم یک حرف و یک رقم
  if (!/\d/.test(out)) out = `${out.slice(0, -1)}${randomInt(2, 10)}`;
  if (!/[a-zA-Z]/.test(out)) out = `A${out.slice(1)}`;
  return out;
}

function validate(password: string): string | null {
  if (password.length < 8) return 'رمز باید دست‌کم ۸ نویسه باشد.';
  if (password.length > 128) return 'رمز بیش از حد طولانی است.';
  if (!/[a-zA-Z]/.test(password)) return 'رمز باید دست‌کم یک حرف انگلیسی داشته باشد.';
  if (!/\d/.test(password)) return 'رمز باید دست‌کم یک رقم داشته باشد.';
  return null;
}

async function main() {
  const email = arg('email')?.toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('❌ ایمیل را بدهید: npm run admin:create -- --email admin@example.com');
    process.exit(1);
  }

  const given = arg('password');
  if (given) {
    const problem = validate(given);
    if (problem) {
      console.error(`❌ ${problem}`);
      process.exit(1);
    }
  }

  const password = given ?? strongPassword();
  const firstName = arg('name') ?? 'مدیر';
  const lastName = arg('lastname') ?? 'وبلاگ';

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, status: true },
  });

  let mode: 'created' | 'promoted' | 'reset';

  if (!existing) {
    await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        firstName,
        lastName,
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
    });
    mode = 'created';
  } else {
    // حساب هست: به مدیر ارتقا می‌دهیم و اگر رمز خواسته شده، عوضش می‌کنیم
    const changePassword = Boolean(given) || has('reset');
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: 'ADMIN',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        ...(changePassword ? { passwordHash: await hashPassword(password) } : {}),
      },
    });
    mode = changePassword ? 'reset' : 'promoted';
  }

  await audit({
    actorType: 'system',
    action: 'admin.account_provisioned',
    entity: 'user',
    meta: { email, mode },
  });

  const settings = await getSettings();
  const base = (settings.siteUrl || '').replace(/\/+$/, '');

  console.log('');
  if (mode === 'created') console.log('✅ حساب مدیر ساخته شد.');
  else if (mode === 'reset') console.log('✅ حساب موجود به مدیر ارتقا یافت و رمزش عوض شد.');
  else console.log('✅ حساب موجود به مدیر ارتقا یافت (رمز دست‌نخورده ماند).');

  console.log('');
  console.log('─────────────  اطلاعات ورود  ─────────────');
  console.log(`  ایمیل: ${email}`);
  if (mode === 'promoted') {
    console.log('  رمز:   همان رمز قبلی حساب');
    console.log('         (برای رمز تازه، دستور را با --reset اجرا کنید)');
  } else {
    console.log(`  رمز:   ${password}`);
  }
  console.log(`  ورود:  ${base || 'https://<دامنه-وبلاگ>'}/login`);
  console.log('──────────────────────────────────────────');
  console.log('');
  console.log('گام بعد:');
  console.log(`  • مدیریت وبلاگ:   ${base}/admin/blog`);
  console.log(`  • سئو و آمار:      ${base}/admin/seo`);
  console.log('');
  if (mode !== 'promoted') {
    console.log('⚠️  این رمز دیگر نمایش داده نمی‌شود. همین حالا در جای امن ذخیره‌اش کنید');
    console.log('   و پس از نخستین ورود، از /dashboard/profile عوضش کنید.');
    console.log('   برای امنیت بیشتر، ورود دو مرحله‌ای را هم همان‌جا روشن کنید.');
  }
  if (settings.registrationOpen) {
    console.log('');
    console.log('💡 ثبت‌نام عمومی روی این سرور باز است. اگر این نصب فقط وبلاگ است،');
    console.log('   در /admin/settings کلید «ثبت‌نام باز» را خاموش کنید.');
  }
}

main()
  .catch((err) => {
    console.error('❌ خطا در ساخت حساب مدیر:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
