import 'dotenv/config';
import prisma from '../src/lib/prisma';
import { applyAutoImages } from '../src/lib/images/apply';
import { loadEngine } from '../src/lib/images/engine';

/**
 * ساخت تصویر برای مقاله‌های موجود، از خط فرمان.
 *
 *   npm run blog:images              # کاور + نمودار برای همه مقاله‌هایی که ندارند
 *   npm run blog:images -- --dry     # فقط نشان بده چه می‌شود، چیزی ذخیره نکن
 *   npm run blog:images -- --covers  # فقط کاور
 *   npm run blog:images -- --figures # فقط نمودار
 *   npm run blog:images -- --reshuffle  # طرح تازه برای کاورهای خودکار موجود
 *
 * کاوری که خودتان گذاشته‌اید هرگز عوض نمی‌شود.
 */

const has = (flag: string) => process.argv.includes(`--${flag}`);

async function main() {
  const onlyCovers = has('covers');
  const onlyFigures = has('figures');
  const covers = onlyCovers || !onlyFigures;
  const figures = onlyFigures || !onlyCovers;
  const dryRun = has('dry');

  const engine = await loadEngine();
  if (!engine) {
    console.log('⚠️  موتور تصویر (resvg) روی این سرور بالا نیامد؛ تصویرها به شکل SVG سرو می‌شوند.');
    console.log('   ایمیج را دوباره بسازید: docker compose build app');
  }

  const result = await applyAutoImages({ covers, figures, reshuffle: has('reshuffle'), dryRun });

  console.log('');
  console.log(dryRun ? '🔎 پیش‌نمایش (چیزی ذخیره نشد):' : '✅ انجام شد:');
  for (const d of result.details) {
    const parts = [d.cover ? `کاور: ${d.cover}` : null, d.figure ? `نمودار: ${d.figure}` : null].filter(Boolean);
    const line = parts.length ? parts.join(' · ') : d.note ? `— ${d.note}` : '— تغییری لازم نبود';
    console.log(`   • ${d.title}\n       ${line}`);
  }
  console.log('');
  console.log(`   ${result.scanned} مقاله بررسی شد: ${result.covers} کاور و ${result.figures} نمودار.`);
  if (!dryRun && (result.covers || result.figures)) {
    console.log('');
    console.log('   تصویرها هنگام نخستین بازدید ساخته و کش می‌شوند؛ نشانی نمونه:');
    console.log('   /media/blog/cover/<نشانی-مقاله>.webp');
  }
}

main()
  .catch((err) => {
    console.error('❌ خطا در ساخت تصویرها:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
