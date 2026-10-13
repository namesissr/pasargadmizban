import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../src/lib/prisma';
import { buildPostData, syncTags, recordSlugChange, type PostInput } from '../src/lib/blog-admin';
import { siteInfo, cloudLinks } from '../src/lib/seo';

/**
 * محتوای آغازین وبلاگ.
 *
 * پنج مقاله کامل با ساختار سئویی درست (کلیدواژه هدف، تیتربندی، لینک داخلی
 * و پرسش‌های پرتکرار) و چهار دسته‌بندی، تا وبلاگ از روز اول خالی نباشد.
 * متن مقاله‌ها در پوشه scripts/blog-seed نگه داشته می‌شود.
 *
 * اجرا: npm run blog:seed
 * با --force مقاله‌های موجود هم بازنویسی می‌شوند.
 */

const here = dirname(fileURLToPath(import.meta.url));

/**
 * متن مقاله را می‌خواند و جای {{CLOUD}} را با آدرس پنل ابری (از تنظیمات)
 * پر می‌کند؛ اینطور همه دعوت‌های مقاله به همان جایی می‌رود که کاربر
 * ثبت‌نام می‌کند و سرور می‌سازد.
 */
const read = (name: string, cloudBase: string) =>
  readFileSync(join(here, 'blog-seed', name), 'utf8').replaceAll('{{CLOUD}}', cloudBase);

const CATEGORIES = [
  {
    slug: 'rahnamaye-kharid',
    name: 'راهنمای خرید سرور',
    description:
      'پیش از پرداخت، بدانید چه می‌خرید: مقایسه پلن‌ها، انتخاب لوکیشن ایران یا خارج، پرداخت ساعتی یا ماهانه و محاسبه هزینه واقعی.',
    metaTitle: 'راهنمای خرید سرور مجازی و ابری | پاسارگاد میزبان',
    metaDescription:
      'راهنمای کامل انتخاب سرور: مقایسه پلن‌ها، انتخاب لوکیشن ایران یا خارج، محاسبه هزینه واقعی و نکته‌های مهم پیش از خرید.',
    order: 1,
  },
  {
    slug: 'server-abri',
    name: 'سرور ابری و زیرساخت',
    description: 'مفاهیم زیرساخت ابری به زبان ساده: سرور ابری، اسنپ‌شات، آی‌پی شناور، ارتقای منابع و پرداخت ساعتی.',
    metaTitle: 'سرور ابری و زیرساخت — آموزش و مفاهیم | پاسارگاد میزبان',
    metaDescription:
      'سرور ابری چیست، چه تفاوتی با سرور مجازی دارد و چطور منابع، اسنپ‌شات و شبکه‌اش را مدیریت کنیم؛ همه به زبان ساده.',
    order: 2,
  },
  {
    slug: 'amoozesh-linux',
    name: 'آموزش لینوکس',
    description: 'از نخستین اتصال با SSH تا نصب سرویس‌ها و رفع خطاهای رایج؛ آموزش‌های گام‌به‌گام برای مدیریت سرور لینوکسی.',
    metaTitle: 'آموزش لینوکس و مدیریت سرور | پاسارگاد میزبان',
    metaDescription: 'آموزش‌های گام‌به‌گام لینوکس برای مدیریت سرور: اتصال با SSH، نصب سرویس، مدیریت کاربران و رفع خطاهای رایج.',
    order: 3,
  },
  {
    slug: 'amniyat-va-shabake',
    name: 'امنیت و شبکه',
    description: 'امن‌سازی سرور، فایروال، گواهی SSL، مشکلات دسترسی از ایران و تعویض آی‌پی.',
    metaTitle: 'امنیت سرور و شبکه | پاسارگاد میزبان',
    metaDescription: 'امن‌سازی سرور لینوکس، فایروال و SSL، رفع مشکل دسترسی آی‌پی از ایران و راه‌های جلوگیری از نفوذ.',
    order: 4,
  },
] as const;

type SeedPost = Omit<PostInput, 'content'> & {
  file: string;
  categorySlug: string;
  /** نشانی‌های قدیمی همین مقاله؛ اگر وجود داشته باشند، همان مقاله به‌روز و با ۳۰۱ منتقل می‌شود */
  previousSlugs?: string[];
};

const AUTHOR = {
  authorName: 'تیم فنی پاسارگاد میزبان',
  authorTitle: 'مهندسی زیرساخت',
  authorBio:
    'ما هر روز سرور می‌سازیم، نگه می‌داریم و مشکل‌هایشان را حل می‌کنیم؛ این مقاله‌ها خلاصه همان تجربه روزمره است.',
};

const POSTS: SeedPost[] = [
  {
    file: 'kharid-server-majazi-irani-va-khareji.md',
    slug: 'kharid-server-majazi-irani-va-khareji',
    previousSlugs: ['kharid-server-majazi-alman'],
    title: 'خرید سرور مجازی ایران و خارج: راهنمای انتخاب لوکیشن و پلن',
    metaTitle: 'خرید سرور مجازی ایران و خارج — راهنمای انتخاب پلن',
    metaDescription:
      'راهنمای خرید سرور مجازی: لوکیشن ایران یا خارج، پرداخت ساعتی یا ماهانه، انتخاب پلن بر اساس کاربرد و ۵ پرسشی که باید پیش از پرداخت بپرسید.',
    excerpt:
      'لوکیشن ایران بگیرم یا خارج؟ ساعتی حساب کنم یا ماهانه؟ این راهنما با جدول و مثال، انتخاب پلن و لوکیشن را روشن می‌کند.',
    focusKeyword: 'خرید سرور مجازی ایران و خارج',
    keywords: 'سرور مجازی ایران, سرور مجازی خارج, سرور ساعتی, قیمت سرور مجازی, vps ایران',
    categorySlug: 'rahnamaye-kharid',
    tags: ['سرور مجازی', 'سرور ایران', 'راهنمای خرید'],
    coverAlt: 'مقایسه لوکیشن ایران و خارج برای سرور مجازی',
    featured: true,
    faqs: [
      {
        q: 'برای یک سایت وردپرسی معمولی چه پلنی لازم است؟',
        a: 'پلن ۲ هسته پردازنده، ۴ گیگابایت رم و ۴۰ گیگابایت فضا برای بیشتر سایت‌های وردپرسی با ترافیک متوسط کافی است. اگر فروشگاه دارید یا افزونه‌های سنگین نصب کرده‌اید، ۴ هسته و ۸ گیگ رم انتخاب مطمئن‌تری است.',
      },
      {
        q: 'لوکیشن ایران بگیرم یا خارج؟',
        a: 'اگر کاربران سرویس شما داخل ایران هستند، لوکیشن ایران تأخیر کمتری می‌دهد و همیشه در دسترس است. اگر سرویس شما به APIها و سرویس‌های جهانی وصل می‌شود، لوکیشن خارج مناسب‌تر است. با پرداخت ساعتی می‌توانید هر دو را یک روز امتحان کنید.',
      },
      {
        q: 'اگر سرور به کارم نیامد، پولم برمی‌گردد؟',
        a: 'در پرداخت ساعتی فقط هزینه ساعت‌هایی که سرور داشته‌اید کسر می‌شود، پس می‌توانید چند ساعت تست کنید و حذف کنید. در پلن ماهانه، هزینه روزهای استفاده‌نشده به کیف پول شما برمی‌گردد.',
      },
    ],
    ...AUTHOR,
  },
  {
    file: 'server-abri-chist.md',
    slug: 'server-abri-chist',
    title: 'سرور ابری چیست و چه تفاوتی با سرور مجازی دارد؟',
    metaTitle: 'سرور ابری چیست؟ تفاوت سرور ابری و سرور مجازی',
    metaDescription:
      'سرور ابری چیست، چه تفاوتی با VPS سنتی دارد و چه زمانی انتخاب درستی است؛ همراه با جدول مقایسه، نحوه محاسبه هزینه و نکته‌های انتخاب پلن.',
    excerpt:
      'سرور ابری همان سرور مجازی است با زیرساخت و ابزارهای بهتر: تحویل خودکار، پرداخت ساعتی و ارتقای منابع بدون مهاجرت. تفاوت‌ها را دقیق مرور می‌کنیم.',
    focusKeyword: 'سرور ابری چیست',
    keywords: 'سرور ابری, تفاوت سرور ابری و مجازی, cloud server, vps',
    categorySlug: 'server-abri',
    tags: ['سرور ابری', 'سرور مجازی', 'مفاهیم پایه'],
    coverAlt: 'نمای ساده از معماری سرور ابری',
    faqs: [
      {
        q: 'سرور ابری گران‌تر از سرور مجازی است؟',
        a: 'نه لزوماً. در پرداخت ساعتی، سرور ابری برای کارهای کوتاه‌مدت چند برابر ارزان‌تر تمام می‌شود و در نگهداری یک‌ماهه هم قیمتش با سرور مجازی معمولی برابر است.',
      },
      {
        q: 'سرور خاموش هم هزینه دارد؟',
        a: 'بله. منابع و دیسک سرور خاموش هم رزرو می‌ماند، پس هزینه‌اش محاسبه می‌شود. اگر به سرور نیاز ندارید، اسنپ‌شات بگیرید و سرور را حذف کنید.',
      },
      {
        q: 'ارتقای پلن داده‌هایم را از بین می‌برد؟',
        a: 'نه. در ارتقای پلن، دیسک و داده‌ها سر جایشان می‌مانند و فقط منابع بیشتر می‌شود. سرور در این فرآیند چند دقیقه ری‌استارت می‌شود.',
      },
    ],
    ...AUTHOR,
  },
  {
    file: 'ettesal-be-server-ba-ssh.md',
    slug: 'ettesal-be-server-ba-ssh',
    title: 'آموزش اتصال به سرور لینوکس با SSH (صفر تا صد)',
    metaTitle: 'اتصال به سرور با SSH — آموزش کامل و رفع خطاها',
    metaDescription:
      'آموزش اتصال به سرور لینوکس با SSH: ورود با رمز، ساخت کلید، بستن ورود با رمز، انتقال فایل با scp و rsync و رفع خطاهای رایج.',
    excerpt:
      'نخستین مهارت لازم بعد از تحویل سرور: اتصال با SSH. از ورود با رمز شروع می‌کنیم، کلید می‌سازیم و در پایان خطاهای رایج را رفع می‌کنیم.',
    focusKeyword: 'اتصال به سرور با SSH',
    keywords: 'ssh, اتصال به سرور لینوکس, کلید ssh, scp, rsync',
    categorySlug: 'amoozesh-linux',
    tags: ['لینوکس', 'SSH', 'آموزش گام‌به‌گام'],
    coverAlt: 'ترمینال باز روی اتصال SSH به سرور',
    faqs: [
      {
        q: 'چرا رمز را که تایپ می‌کنم چیزی نمایش داده نمی‌شود؟',
        a: 'این رفتار عادی SSH است؛ برای امنیت، رمز هنگام تایپ نشان داده نمی‌شود. رمز را کامل بنویسید و Enter بزنید.',
      },
      {
        q: 'خطای Connection timed out یعنی چه؟',
        a: 'یعنی اتصال به سرور برقرار نشد. سه علت رایج دارد: سرور خاموش است، فایروال پورت SSH را بسته، یا آی‌پی سرور از داخل ایران در دسترس نیست. از پنل وضعیت سرور و دسترس‌پذیری آی‌پی را بررسی کنید.',
      },
      {
        q: 'کلید SSH امن‌تر است یا رمز؟',
        a: 'کلید SSH بسیار امن‌تر است. رمزها را می‌توان با حمله حدس زدن امتحان کرد، ولی کلید ۲۵۶ بیتی عملاً قابل حدس زدن نیست. بعد از فعال کردن کلید، ورود با رمز را ببندید.',
      },
    ],
    ...AUTHOR,
  },
  {
    file: 'filter-shodan-ip-server.md',
    slug: 'filter-shodan-ip-server',
    title: 'چرا آی‌پی سرور از ایران باز نمی‌شود و چطور عوضش کنیم؟',
    metaTitle: 'فیلتر شدن آی‌پی سرور — تشخیص و راه‌حل‌های عملی',
    metaDescription:
      'اگر سرور از ایران باز نمی‌شود: چهار بررسی برای تشخیص مشکل، دلایل سوختن رنج آی‌پی و پنج راه‌حل عملی از تعویض آی‌پی تا آی‌پی شناور.',
    excerpt:
      'سرور روشن است و سرویس بالاست، ولی از ایران باز نمی‌شود. اول مطمئن شوید مشکل از آی‌پی است، بعد سراغ راه‌حل‌ها بروید.',
    focusKeyword: 'فیلتر شدن آی‌پی سرور',
    keywords: 'فیلتر شدن ip سرور, تعویض آی‌پی سرور, دسترسی سرور از ایران, آی‌پی شناور',
    categorySlug: 'amniyat-va-shabake',
    tags: ['شبکه', 'آی‌پی', 'رفع اشکال'],
    coverAlt: 'بررسی دسترس‌پذیری آی‌پی سرور از داخل ایران',
    faqs: [
      {
        q: 'ری‌استارت کردن سرور آی‌پی را عوض می‌کند؟',
        a: 'نه. آی‌پی سرور با ری‌استارت تغییر نمی‌کند. برای گرفتن آی‌پی تازه باید از پنل، تعویض آی‌پی را انجام دهید.',
      },
      {
        q: 'بعد از تعویض آی‌پی چه کارهایی لازم است؟',
        a: 'رکوردهای DNS دامنه را به آی‌پی تازه تغییر دهید، هر جایی که آی‌پی را ثابت نوشته‌اید (فایل‌های تنظیمات، وب‌هوک‌ها، فایروال سمت مشتری) به‌روز کنید و چند دقیقه برای تازه شدن کش DNS صبر کنید.',
      },
      {
        q: 'تعویض آی‌پی هزینه دارد؟',
        a: 'در پاسارگاد میزبان تا ۴۸ ساعت نخست عمر سرور، تعویض آی‌پی رایگان است. بعد از آن بر اساس تنظیمات پنل، هزینه و سهمیه ماهانه مشخصی دارد.',
      },
    ],
    ...AUTHOR,
  },
  {
    file: 'amn-sazi-server-ubuntu.md',
    slug: 'amn-sazi-server-ubuntu',
    title: 'امن‌سازی سرور اوبونتو در ۱۰ قدم',
    metaTitle: 'امن‌سازی سرور اوبونتو — چک‌لیست ۱۰ قدمی',
    metaDescription:
      'چک‌لیست امن‌سازی سرور اوبونتو: کاربر غیرروت، ورود با کلید SSH، فایروال، Fail2ban، به‌روزرسانی خودکار، SSL و بکاپ — با دستورهای آماده.',
    excerpt:
      'سرور تازه از دقیقه اول هدف اسکن‌های خودکار است. این ده قدم، بیش از ۹۰ درصد این حمله‌ها را بی‌اثر می‌کند.',
    focusKeyword: 'امن‌سازی سرور اوبونتو',
    keywords: 'امنیت سرور لینوکس, ufw, fail2ban, ssl رایگان, بکاپ سرور',
    categorySlug: 'amniyat-va-shabake',
    tags: ['امنیت', 'لینوکس', 'اوبونتو'],
    coverAlt: 'چک‌لیست امن‌سازی سرور اوبونتو',
    faqs: [
      {
        q: 'عوض کردن پورت SSH واقعاً امنیت می‌آورد؟',
        a: 'امنیت واقعی نه، ولی حجم زیادی از اسکن‌های خودکار را حذف می‌کند و لاگ‌های سرور تمیزتر می‌شود. امنیت اصلی از ورود با کلید و فایروال می‌آید.',
      },
      {
        q: 'Fail2ban چه کاری انجام می‌دهد؟',
        a: 'لاگ ورودهای ناموفق را می‌خواند و آی‌پی‌هایی که پشت سر هم تلاش ناموفق دارند را برای مدتی در فایروال بلاک می‌کند؛ یعنی حمله حدس زدن رمز عملاً بی‌فایده می‌شود.',
      },
      {
        q: 'اسنپ‌شات جای بکاپ را می‌گیرد؟',
        a: 'نه. اسنپ‌شات تصویر لحظه‌ای کل دیسک برای تغییرهای ریسک‌دار است و بکاپ، نسخه‌های زمان‌بندی‌شده داده‌های روزمره. برای سرور جدی، هر دو لازم است.',
      },
    ],
    ...AUTHOR,
  },
];

async function main() {
  const force = process.argv.includes('--force');

  const site = await siteInfo();
  const cloud = cloudLinks(site);
  // پایه لینک‌های فروش: آدرس پنل ابری، یا همین سایت اگر تنظیم نشده باشد
  const cloudBase = site.cloudUrl || '';
  console.log(`🔗 لینک‌های فروش به: ${cloud.register}`);

  console.log('⏳ ساخت دسته‌های وبلاگ…');
  const categoryIds = new Map<string, string>();
  for (const category of CATEGORIES) {
    const row = await prisma.blogCategory.upsert({
      where: { slug: category.slug },
      create: { ...category },
      update: {
        name: category.name,
        description: category.description,
        metaTitle: category.metaTitle,
        metaDescription: category.metaDescription,
        order: category.order,
      },
      select: { id: true },
    });
    categoryIds.set(category.slug, row.id);
    console.log(`   • ${category.name}`);
  }

  console.log('⏳ انتشار مقاله‌های آغازین…');
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const { file, categorySlug, previousSlugs, ...meta } of POSTS) {
    // مقاله ممکن است با نشانی قدیمی ثبت شده باشد؛ همان را به‌روز می‌کنیم
    let existing = await prisma.blogPost.findUnique({ where: { slug: meta.slug! }, select: { id: true, slug: true } });
    let renamedFrom: string | null = null;

    if (!existing && previousSlugs?.length) {
      const old = await prisma.blogPost.findFirst({
        where: { slug: { in: previousSlugs } },
        select: { id: true, slug: true },
      });
      if (old) {
        existing = old;
        renamedFrom = old.slug;
      }
    }

    if (existing && !force && !renamedFrom) {
      skipped++;
      console.log(`   − ${meta.title} (از قبل هست)`);
      continue;
    }

    const input: PostInput = {
      ...meta,
      content: read(file, cloudBase),
      categoryId: categoryIds.get(categorySlug) ?? null,
      status: 'PUBLISHED',
    };

    const { data } = await buildPostData(input, existing?.id);

    const post = existing
      ? await prisma.blogPost.update({ where: { id: existing.id }, data, select: { id: true } })
      : await prisma.blogPost.create({ data, select: { id: true } });

    // نشانی قدیمی با ۳۰۱ به نشانی تازه می‌رود تا رتبه و لینک‌ها نسوزد
    if (renamedFrom) await recordSlugChange(post.id, renamedFrom, data.slug);

    await syncTags(post.id, meta.tags);

    if (existing) updated++;
    else created++;
    console.log(`   ✓ ${meta.title}${renamedFrom ? ` (نشانی از ${renamedFrom} منتقل شد)` : ''}`);
  }

  console.log('✅ محتوای آغازین آماده شد:');
  console.log(`   • مقاله تازه: ${created}`);
  console.log(`   • به‌روزرسانی: ${updated}`);
  console.log(`   • رد شده: ${skipped}`);
  console.log('');
  console.log('گام بعدی: در /admin/blog تنظیمات سئو را پر کنید و نقشه سایت را در گوگل سرچ کنسول ثبت کنید.');
}

main()
  .catch((err) => {
    console.error('❌ خطا در ساخت محتوای وبلاگ:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
