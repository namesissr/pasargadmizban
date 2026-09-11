import 'dotenv/config';
import prisma from '../src/lib/prisma';
import { getBotInfo, getWebhookInfo, setWebhook, deleteWebhook, telegramConfigured } from '../src/lib/telegram';
import { getSettings, setSettings } from '../src/lib/settings';
import { env } from '../src/lib/env';

/**
 * راه‌اندازی و بررسی ربات تلگرام.
 *
 *   npx tsx scripts/telegram-setup.ts              وضعیت فعلی
 *   npx tsx scripts/telegram-setup.ts --webhook    فعال کردن webhook
 *   npx tsx scripts/telegram-setup.ts --polling    برگشت به long polling
 */

async function main() {
  const args = process.argv.slice(2);

  if (!telegramConfigured()) {
    console.error('❌ متغیر TELEGRAM_BOT_TOKEN در فایل .env تنظیم نشده است.');
    console.error('   در تلگرام به @BotFather پیام دهید، /newbot را بزنید و توکن را اینجا بگذارید.');
    process.exit(1);
  }

  console.log('⏳ در حال اتصال به تلگرام…');
  const info = await getBotInfo();
  if (!info) {
    console.error('❌ اتصال به API تلگرام برقرار نشد.');
    console.error(`   آدرس فعلی: ${env.telegram.apiUrl}`);
    console.error('   اگر سرور شما به تلگرام دسترسی مستقیم ندارد، TELEGRAM_API_URL را روی پروکسی خود بگذارید.');
    process.exit(1);
  }

  console.log(`✅ ربات: @${info.username} (${info.first_name})`);
  await setSettings({ telegramBotUsername: info.username });

  // ── فعال کردن webhook ──
  if (args.includes('--webhook')) {
    const secret = env.telegram.webhookSecret;
    if (!secret) {
      console.error('❌ برای استفاده از webhook باید TELEGRAM_WEBHOOK_SECRET را تنظیم کنید.');
      console.error('   یک مقدار تصادفی بسازید:');
      console.error('   node -e "console.log(require(\'crypto\').randomBytes(24).toString(\'hex\'))"');
      process.exit(1);
    }
    if (!env.appUrl.startsWith('https://')) {
      console.error('❌ تلگرام فقط آدرس HTTPS را برای webhook می‌پذیرد.');
      console.error(`   APP_URL فعلی: ${env.appUrl}`);
      process.exit(1);
    }

    const url = `${env.appUrl}/api/telegram/webhook`;
    const okSet = await setWebhook(url, secret);
    console.log(okSet ? `✅ webhook روی ${url} تنظیم شد.` : '❌ تنظیم webhook ناموفق بود.');
    await setSettings({ telegramPolling: false });
    console.log('ℹ️  دریافت با ورکر خاموش شد تا پیام‌ها دو بار پردازش نشوند.');
  }

  // ── برگشت به long polling ──
  if (args.includes('--polling')) {
    await deleteWebhook();
    await setSettings({ telegramPolling: true });
    console.log('✅ webhook حذف شد و دریافت با ورکر فعال گردید.');
    console.log('ℹ️  مطمئن شوید ورکر در حال اجراست: npm run worker');
  }

  // ── وضعیت ──
  const [hook, settings, linked] = await Promise.all([
    getWebhookInfo(),
    getSettings(true),
    prisma.telegramLink.count({ where: { active: true } }),
  ]);

  console.log('\n── وضعیت فعلی ──');
  console.log(`   ربات فعال: ${settings.telegramEnabled ? 'بله' : 'خیر'}`);
  console.log(`   حالت دریافت: ${hook?.url ? `webhook (${hook.url})` : 'long polling در ورکر'}`);
  console.log(`   دریافت با ورکر: ${settings.telegramPolling ? 'روشن' : 'خاموش'}`);
  console.log(`   کنترل سرور از تلگرام: ${settings.telegramAllowActions ? 'مجاز' : 'غیرمجاز'}`);
  console.log(`   پیام‌های در صف: ${hook?.pending_update_count ?? 0}`);
  console.log(`   کاربران متصل: ${linked}`);
  if (hook?.last_error_message) {
    console.log(`   ⚠️  آخرین خطای webhook: ${hook.last_error_message}`);
  }

  console.log('\n── دستورهایی که در BotFather ثبت کنید ──');
  console.log('   (با /setcommands در @BotFather این متن را بفرستید)\n');
  console.log('balance - موجودی کیف پول و اعتبار باقی‌مانده');
  console.log('servers - فهرست سرورها و وضعیت آن‌ها');
  console.log('server - جزئیات و کنترل یک سرور');
  console.log('status - وضعیت کلی حساب');
  console.log('mute - قطع موقت اعلان‌ها');
  console.log('unmute - فعال‌سازی مجدد اعلان‌ها');
  console.log('unlink - قطع اتصال حساب');
  console.log('help - راهنما');
}

main()
  .catch((err) => {
    console.error('❌ خطا:', err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
