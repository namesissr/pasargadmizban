import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import {
  Zap,
  ShieldCheck,
  Radar,
  Repeat,
  Wallet,
  Clock,
  Crown,
  Gift,
  Bell,
  ArrowLeft,
  Check,
  Globe,
  BookOpen,
  CalendarDays,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { latestPosts } from '@/lib/blog';
import {
  siteInfo,
  buildMetadata,
  organizationSchema,
  websiteSchema,
  webPageSchema,
  faqSchema,
  plansSchema,
  jsonLdGraph,
} from '@/lib/seo';
import { JsonLd } from '@/components/blog/json-ld';
import { getSettings } from '@/lib/settings';
import { buildCatalogPrices } from '@/lib/pricing';
import { locationReachability } from '@/lib/ip-prefix';
import { formatToman, formatNumber, formatTraffic } from '@/lib/money';
import { locationFa, cn, faDate } from '@/lib/utils';
import { SiteHeader, SiteFooter } from '@/components/site/chrome';
import { BrandStyle } from '@/components/site/brand-style';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const site = await siteInfo();

  // صفحه اصلی قوی‌ترین صفحه سایت است: canonical، کارت اشتراک‌گذاری و کد
  // تأیید سرچ کنسول همه از تنظیمات پنل خوانده می‌شوند
  return buildMetadata({
    site,
    title: `${site.brandName} — سرور ابری با پرداخت ریالی`,
    description:
      'سرور ابری آلمان و فنلاند با پرداخت ساعتی و ماهانه به تومان. تحویل زیر یک دقیقه، آی‌پی تست‌شده از ایران و تعویض آی‌پی.',
    path: '/',
    keywords: [
      'سرور ابری',
      'خرید سرور مجازی',
      'سرور مجازی آلمان',
      'سرور ابری ایران',
      'هتزنر',
      'VPS ارزان',
      'پرداخت ریالی سرور',
    ],
  });
}

/** پرسش‌های پرتکرار صفحه اصلی — هم نمایش داده می‌شوند و هم داده ساخت‌یافته می‌سازند */
const HOME_FAQS = [
  {
    q: 'اگر آی‌پی سرورم فیلتر شود چه می‌شود؟',
    a: 'آی‌پی هر سرور تازه پیش از تحویل از داخل ایران تست می‌شود و اگر باز نشود، پنل خودش رایگان عوضش می‌کند. بعداً هم هر وقت فیلتر شد، از پنل با یک کلیک آی‌پی تازه می‌گیرید؛ تا ۴۸ ساعت اول رایگان است.',
  },
  {
    q: 'پرداخت ساعتی یعنی چه؟',
    a: 'سرور را هر وقت خواستید بسازید و هر وقت خواستید حذف کنید؛ فقط برای ساعت‌هایی که سرور داشتید از کیف پولتان کسر می‌شود. سقف پرداخت هر ماه هم از قیمت ماهانه پلن بیشتر نمی‌شود.',
  },
  {
    q: 'سرور چقدر طول می‌کشد آماده شود؟',
    a: 'ساخت کاملاً خودکار است و معمولاً کمتر از یک دقیقه طول می‌کشد. مشخصات اتصال همان لحظه در پنل و ایمیل شما قرار می‌گیرد.',
  },
  {
    q: 'اگر وسط ماه سرور را حذف کنم پولم چه می‌شود؟',
    a: 'در پلن ماهانه، هزینه روزهای استفاده‌نشده به کیف پولتان برمی‌گردد. در پلن ساعتی هم فقط تا همان ساعت حساب می‌شود.',
  },
];

const MIN_REACH_SAMPLES = 10;

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === 'USER' ? '/dashboard' : '/admin');

  const settings = await getSettings();
  const site = await siteInfo();
  const [catalog, reachability, posts] = await Promise.all([
    buildCatalogPrices().catch(() => null),
    locationReachability().catch(() => []),
    settings.blogEnabled ? latestPosts(3).catch(() => []) : Promise.resolve([]),
  ]);

  const reachMap = new Map(
    reachability
      .filter((r) => r.samples >= MIN_REACH_SAMPLES && r.successPercent !== null)
      .map((r) => [r.locationName, r.successPercent as number]),
  );

  // ارزان‌ترین قیمت هر پلن بین لوکیشن‌های موجود
  const plans = (catalog?.items ?? [])
    .map(({ serverType, prices }) => {
      const available = Object.entries(prices).filter(([, p]) => p.available);
      if (!available.length) return null;
      const cheapest = available.reduce((a, b) => (Number(a[1].monthly) <= Number(b[1].monthly) ? a : b));
      return {
        name: serverType.name,
        cores: serverType.cores,
        memory: serverType.memory,
        disk: serverType.disk,
        cpuType: serverType.cpuType,
        traffic: Number(serverType.includedTraffic),
        monthly: Number(cheapest[1].monthly),
        hourly: Number(cheapest[1].hourly),
        location: cheapest[0],
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => a.monthly - b.monthly)
    .slice(0, 6);

  const locations = (catalog?.locations ?? []).map((l) => ({
    name: l.name,
    title: l.faTitle ?? l.description,
    flag: l.flagEmoji ?? '🌐',
    reach: reachMap.get(l.name) ?? null,
  }));

  const brand = settings.brandName;

  /**
   * داده ساخت‌یافته صفحه اصلی: سازمان و سایت (برای شناخته شدن برند)،
   * پرسش‌های پرتکرار (شانس کارت بازشو) و پلن‌ها با قیمت (شانس نمایش قیمت).
   */
  const homeJsonLd = site.homeSchema
    ? jsonLdGraph([
        organizationSchema(site),
        websiteSchema(site),
        webPageSchema(site, {
          path: '/',
          name: `${brand} — سرور ابری با پرداخت ریالی`,
          description:
            'سرور ابری آلمان و فنلاند با پرداخت ساعتی و ماهانه به تومان، تحویل خودکار زیر یک دقیقه و آی‌پی تست‌شده از ایران.',
        }),
        faqSchema(HOME_FAQS),
        plansSchema(
          site,
          plans.map((plan) => ({
            name: plan.name,
            monthly: plan.monthly,
            description: `${plan.cores} هسته پردازنده، ${plan.memory} گیگابایت رم، ${plan.disk} گیگابایت فضای NVMe و ${formatTraffic(plan.traffic)} ترافیک ماهانه`,
          })),
        ),
      ])
    : null;

  return (
    <div className="min-h-screen">
      {homeJsonLd ? <JsonLd json={homeJsonLd} /> : null}
      <BrandStyle color={site.brandColor} />
      <SiteHeader site={site} />

      <main className="mx-auto max-w-6xl px-4">
        {/* ── قهرمان ── */}
        <section className="py-14 text-center sm:py-20">
          <span className="badge badge-ok mx-auto">
            <Zap size={12} /> تحویل خودکار، زیر یک دقیقه
          </span>
          <h1 className="mx-auto mt-4 max-w-2xl text-2xl font-extrabold leading-[1.6] sm:text-4xl sm:leading-[1.6]">
            سرور ابری آلمان و فنلاند،
            <br />
            با <span className="text-[var(--color-brand-600)]">پرداخت ساعتی به تومان</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-8 muted">
            زیرساخت Hetzner، صورتحساب ریالی. آی‌پی هر سرور پیش از تحویل از داخل ایران تست می‌شود و اگر روزی
            فیلتر شد، با یک کلیک عوضش می‌کنید.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/register" className="btn btn-primary w-full sm:w-auto">
              شروع کنید — بدون هزینه ثبت‌نام <ArrowLeft size={15} />
            </Link>
            <a href="#pricing" className="btn btn-secondary w-full sm:w-auto">
              مشاهده قیمت‌ها
            </a>
          </div>

          {/* لوکیشن‌ها و دسترسی از ایران */}
          {locations.length > 0 ? (
            <div className="mx-auto mt-10 flex max-w-2xl flex-wrap items-center justify-center gap-2.5">
              {locations.map((loc) => (
                <span key={loc.name} className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold">
                  <span>{loc.flag}</span>
                  {loc.title}
                  {loc.reach !== null ? (
                    <span
                      className={cn(
                        'tabular flex items-center gap-1',
                        loc.reach >= 80 ? 'text-emerald-600' : loc.reach >= 50 ? 'text-amber-600' : 'text-red-500',
                      )}
                    >
                      <Radar size={11} /> {new Intl.NumberFormat('fa-IR').format(loc.reach)}٪ دسترسی از ایران
                    </span>
                  ) : null}
                </span>
              ))}
            </div>
          ) : null}
        </section>

        {/* ── چرا ما ── */}
        <section className="grid gap-4 py-8 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: <Radar size={18} />,
              title: 'آی‌پی تست‌شده از ایران',
              text: 'پیش از تحویل، آدرس سرور از داخل ایران آزمایش می‌شود؛ اگر باز نشود، خودکار و رایگان عوضش می‌کنیم.',
            },
            {
              icon: <Repeat size={18} />,
              title: 'تعویض آی‌پی با یک کلیک',
              text: 'آی‌پی فیلتر شد؟ از پنل عوضش کنید. تا ۴۸ ساعت اول کاملاً رایگان است.',
            },
            {
              icon: <Clock size={18} />,
              title: 'پرداخت ساعتی',
              text: 'فقط برای ساعت‌هایی که سرور دارید پول می‌دهید و سقف ماهانه از قیمت ماهانه بیشتر نمی‌شود.',
            },
            {
              icon: <Crown size={18} />,
              title: 'باشگاه مشتریان',
              text: 'هرچه بیشتر مصرف کنید، سطحتان بالاتر می‌رود و تخفیف دائمی می‌گیرید — تا ۶٪ روی همه پلن‌ها.',
            },
          ].map((f) => (
            <div key={f.title} className="card p-4">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--color-brand-500)_14%,transparent)] text-[var(--color-brand-600)]">
                {f.icon}
              </span>
              <h3 className="mt-3 text-sm font-bold">{f.title}</h3>
              <p className="mt-1.5 text-xs leading-6 muted">{f.text}</p>
            </div>
          ))}
        </section>

        {/* ── قیمت‌ها ── */}
        <section id="pricing" className="py-10">
          <h2 className="text-center text-xl font-extrabold">قیمت‌های شفاف، بدون سورپرایز</h2>
          <p className="mt-2 text-center text-xs leading-7 muted">
            قیمت‌ها با نرخ روز یورو به‌روز می‌شوند و همان چیزی است که پرداخت می‌کنید؛ نه هزینه پنهانی، نه ستاره‌ای.
          </p>

          {plans.length === 0 ? (
            <p className="mt-8 text-center text-sm muted">
              کاتالوگ در حال آماده‌سازی است؛ برای دیدن پلن‌ها{' '}
              <Link href="/register" className="text-[var(--color-brand-600)] hover:underline">
                ثبت‌نام کنید
              </Link>
              .
            </p>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan, i) => (
                <div
                  key={plan.name}
                  className={cn('card relative p-5', i === 1 && 'border-[var(--color-brand-500)]')}
                >
                  {i === 1 ? (
                    <span className="badge badge-ok absolute -top-2.5 right-4">پرفروش‌ترین</span>
                  ) : null}
                  <div className="text-sm font-extrabold uppercase">{plan.name}</div>
                  <div className="tabular mt-3 text-2xl font-extrabold">
                    {formatToman(plan.monthly, { suffix: false })}
                    <span className="text-xs font-normal muted"> تومان / ماه</span>
                  </div>
                  <div className="tabular mt-1 text-[11px] muted">
                    یا {formatToman(plan.hourly, { suffix: false })} تومان در ساعت
                  </div>
                  <ul className="mt-4 space-y-2 text-xs">
                    <li className="flex items-center gap-2">
                      <Check size={13} className="text-emerald-500" />
                      {formatNumber(plan.cores)} هسته پردازنده {plan.cpuType === 'dedicated' ? 'اختصاصی' : ''}
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={13} className="text-emerald-500" />
                      {formatNumber(plan.memory)} گیگابایت رم
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={13} className="text-emerald-500" />
                      {formatNumber(plan.disk)} گیگابایت دیسک NVMe
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={13} className="text-emerald-500" />
                      {formatTraffic(plan.traffic)} ترافیک ماهانه
                    </li>
                    <li className="flex items-center gap-2">
                      <Globe size={13} className="text-emerald-500" />
                      {locationFa(plan.location).flag} {locationFa(plan.location).title}
                    </li>
                  </ul>
                  <Link href="/register" className="btn btn-primary mt-5 w-full">
                    سفارش سرور
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── بقیه امکانات ── */}
        <section className="py-10">
          <h2 className="text-center text-xl font-extrabold">هر چیزی که از یک پنل حرفه‌ای انتظار دارید</h2>
          <div className="mt-8 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: <Bell size={15} />, text: 'اطلاع‌رسانی تلگرام، ایمیل و پیامک با آستانه دلخواه شما' },
              { icon: <ShieldCheck size={15} />, text: 'ورود دو مرحله‌ای، فایروال، اسنپ‌شات و بکاپ خودکار' },
              { icon: <Radar size={15} />, text: 'پایش دائمی سرور و هشدار فوری هنگام از دسترس خارج شدن' },
              { icon: <Wallet size={15} />, text: 'کیف پول ریالی با درگاه شتاب و گزارش هفتگی مصرف' },
              { icon: <Gift size={15} />, text: 'کد هدیه، پورسانت معرفی دوستان و تخفیف پلکانی وفاداری' },
              { icon: <Zap size={15} />, text: 'کنسول تحت وب، نصب مجدد و قالب‌های نصب یک‌کلیکه' },
            ].map((f, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--color-brand-500)_14%,transparent)] text-[var(--color-brand-600)]">
                  {f.icon}
                </span>
                <p className="text-xs leading-6">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── پرسش‌های پرتکرار ── */}
        <section className="mx-auto max-w-2xl py-10">
          <h2 className="text-center text-xl font-extrabold">پرسش‌های پرتکرار</h2>
          <div className="mt-6 space-y-2.5">
            {HOME_FAQS.map((item) => (
              <details key={item.q} className="card group p-4">
                <summary className="cursor-pointer list-none text-sm font-bold">{item.q}</summary>
                <p className="mt-2.5 text-xs leading-7 muted">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── آخرین مقاله‌های وبلاگ ── */}
        {posts.length > 0 ? (
          <section className="py-10" aria-labelledby="blog-heading">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="blog-heading" className="flex items-center gap-2 text-xl font-extrabold">
                  <BookOpen size={18} /> از وبلاگ ما
                </h2>
                <p className="mt-2 text-xs leading-7 muted">
                  آموزش و تجربه‌های واقعی راه‌اندازی سرور، به زبان ساده.
                </p>
              </div>
              <Link href="/blog" className="btn btn-secondary btn-sm">
                همه مقاله‌ها <ArrowLeft size={14} />
              </Link>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <article key={post.id} className="card flex flex-col p-4">
                  {post.category ? (
                    <span className="text-[11px] font-bold text-[var(--color-brand-600)]">{post.category.name}</span>
                  ) : null}
                  <h3 className="mt-1.5 text-sm font-bold leading-7">
                    <Link href={`/blog/${post.slug}`} className="hover:text-[var(--color-brand-600)]">
                      {post.title}
                    </Link>
                  </h3>
                  <p className="mt-2 line-clamp-3 flex-1 text-xs leading-6 muted">{post.excerpt}</p>
                  <div className="mt-3 flex items-center gap-3 border-t pt-2.5 text-[11px] muted">
                    <span className="flex items-center gap-1">
                      <CalendarDays size={12} /> {faDate(post.publishedAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> {post.readingMinutes} دقیقه
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {/* ── دعوت پایانی ── */}
        <section className="py-12 text-center">
          <div className="card mx-auto max-w-2xl p-8" style={{ background: 'color-mix(in srgb, var(--color-brand-500) 8%, var(--surface))' }}>
            <h2 className="text-lg font-extrabold">همین حالا اولین سرورتان را بسازید</h2>
            <p className="mt-2 text-xs leading-7 muted">
              ثبت‌نام رایگان است؛ کیف پول را به هر مبلغی شارژ کنید و در کمتر از یک دقیقه سرور تحویل بگیرید.
            </p>
            <Link href="/register" className="btn btn-primary mt-5">
              ثبت‌نام و ساخت سرور <ArrowLeft size={15} />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter site={site} />
    </div>
  );
}
