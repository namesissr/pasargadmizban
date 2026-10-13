import 'dotenv/config';
import prisma from '../src/lib/prisma';
import { setSettings, invalidateSettingsCache } from '../src/lib/settings';
import { siteInfo, cloudLinks } from '../src/lib/seo';
import { normalizeHex } from '../src/lib/brand';

/**
 * تنظیم یک‌جای برند و آدرس‌های وبلاگ از خط فرمان.
 *
 * همان کاری را می‌کند که صفحه «تنظیمات سئو» در پنل انجام می‌دهد، ولی در یک
 * دستور — مناسب نصب تازه روی سرور، وقتی نمی‌خواهید دنبال فیلدها در پنل
 * بگردید. اجرا بدون آرگومان، فقط وضعیت فعلی را نشان می‌دهد.
 *
 * نمونه:
 *   npm run blog:configure -- \
 *     --cloud https://cloud.example.com \
 *     --main https://example.com \
 *     --site https://blog.example.com \
 *     --color "#0f62fe" \
 *     --cta "ساخت سرور ساعتی"
 */

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) return undefined;
  return value.trim();
}

function cleanUrl(value: string, label: string): string {
  const url = value.replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(url)) {
    console.error(`❌ ${label} معتبر نیست: «${value}» — باید با http:// یا https:// شروع شود.`);
    process.exit(1);
  }
  return url;
}

async function report(title: string) {
  invalidateSettingsCache();
  const site = await siteInfo();
  const cloud = cloudLinks(site);

  console.log(title);
  console.log(`   • آدرس وبلاگ (canonical): ${site.siteUrl || '— تنظیم نشده —'}`);
  console.log(`   • آدرس سایت اصلی:        ${site.mainSiteUrl || '— تنظیم نشده —'}`);
  console.log(`   • آدرس پنل ابری:          ${site.cloudUrl || '— تنظیم نشده —'}`);
  console.log(`   • متن دکمه فروش:          ${site.cloudCtaLabel}`);
  console.log(`   • شعار زیر نام برند:      ${site.brandTagline}`);
  console.log(`   • رنگ برند:               ${site.brandColor}`);
  console.log('');
  console.log(`   ➜ دکمه «ثبت‌نام / ساخت سرور» به: ${cloud.register}`);
  console.log(`   ➜ دکمه «ورود» به:               ${cloud.login}`);
  if (!cloud.configured) {
    console.log('');
    console.log('⚠️  آدرس پنل ابری تنظیم نشده است؛ دکمه‌ها به مقصد درست نمی‌روند.');
    console.log('   آن را با سوییچ --cloud تنظیم کنید.');
  }
}

async function main() {
  const cloud = arg('cloud');
  const main_ = arg('main');
  const site = arg('site');
  const color = arg('color');
  const cta = arg('cta');
  const tagline = arg('tagline');

  if (!cloud && !main_ && !site && !color && !cta && !tagline) {
    await report('📋 تنظیمات فعلی:');
    console.log('');
    console.log('برای تغییر، سوییچ‌ها را بدهید. نمونه:');
    console.log('  npm run blog:configure -- --cloud https://cloud.example.com --main https://example.com');
    return;
  }

  const patch: Record<string, string> = {};
  if (cloud) patch.cloudUrl = cleanUrl(cloud, 'آدرس پنل ابری');
  if (main_) patch.mainSiteUrl = cleanUrl(main_, 'آدرس سایت اصلی');
  if (site) patch.siteUrl = cleanUrl(site, 'آدرس وبلاگ');
  if (color) patch.brandColor = normalizeHex(color);
  if (cta) patch.cloudCtaLabel = cta;
  if (tagline) patch.brandTagline = tagline;

  await setSettings(patch as never);
  await report('✅ تنظیمات ذخیره شد:');

  console.log('');
  console.log('گام بعد: لینک‌های داخل مقاله‌های موجود را هم منتقل کنید:');
  console.log('  npm run blog:fix-links');
}

main()
  .catch((err) => {
    console.error('❌ خطا در تنظیم وبلاگ:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
