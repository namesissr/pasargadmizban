import prisma from './prisma';

/**
 * تنظیمات سراسری پنل. در دیتابیس ذخیره می‌شود و با کش کوتاه‌مدت خوانده می‌شود
 * تا هر درخواست یک کوئری اضافه نزند.
 */

export type SettingsShape = {
  /** نرخ تبدیل هر یورو به تومان */
  eurRate: number;
  /** درصد سود پیش‌فرض روی قیمت هتزنر */
  markupPercent: number;
  /** مبلغ ثابت اضافه روی هر سرور (تومان) */
  markupFixed: number;
  /** مالیات بر ارزش افزوده (درصد) */
  vatPercent: number;
  /** گرد کردن قیمت ماهانه به مضرب (تومان) */
  roundMonthly: number;
  /** گرد کردن قیمت ساعتی به مضرب (تومان) */
  roundHourly: number;

  /** حداقل مبلغ شارژ کیف پول */
  minTopup: number;
  maxTopup: number;
  /** حداقل موجودی لازم برای ساخت سرور ساعتی (معادل چند ساعت) */
  hourlyPrepayHours: number;

  /** پس از اتمام موجودی، چند ساعت مهلت تا تعلیق */
  suspendGraceHours: number;
  /** پس از تعلیق، چند روز تا حذف کامل */
  deleteAfterDays: number;
  /** چند روز قبل از سررسید فاکتور ماهانه صادر شود */
  invoiceLeadDays: number;

  /** فعال بودن ثبت‌نام */
  registrationOpen: boolean;
  requireEmailVerify: boolean;
  requirePhoneVerify: boolean;

  /** درگاه‌ها */
  gatewayZibal: boolean;
  gatewayBitpay: boolean;
  gatewayManual: boolean;
  manualBankInfo: string;
  /** کد مرچنت زیبال؛ اگر خالی باشد از ZIBAL_MERCHANT در env استفاده می‌شود */
  zibalMerchant: string;
  /** کلید API بیت‌پی (رمزنگاری‌شده) */
  bitpayApiEnc: string;

  brandName: string;
  supportEmail: string;
  supportPhone: string;
  siteUrl: string;

  maintenanceMode: boolean;
  maintenanceMessage: string;

  /** ترافیک اضافه به ازای هر ترابایت (تومان) */
  trafficOveragePerTb: number;

  // ─── اطلاع‌رسانی ───
  /** پیش‌فرض «چند ساعت قبل از اتمام اعتبار هشدار بده» برای کاربران جدید */
  defaultLowBalanceHours: number;
  /** پیش‌فرض هشدار مصرف ترافیک (درصد) */
  defaultTrafficAlertPercent: number;
  /** کانال‌های فعال سامانه */
  channelEmail: boolean;
  channelSms: boolean;
  channelTelegram: boolean;

  // ─── تلگرام ───
  telegramEnabled: boolean;
  telegramBotUsername: string;
  /** دریافت پیام‌ها با long polling در ورکر (اگر webhook تنظیم نکرده‌اید) */
  telegramPolling: boolean;
  /** اجازه اجرای دستورهای مدیریتی سرور از تلگرام */
  telegramAllowActions: boolean;

  // ─── پایش سرور ───
  monitoringEnabled: boolean;
  monitorDefaultInterval: number;
  monitorMaxPerUser: number;

  // ─── معرفی و پورسانت ───
  referralEnabled: boolean;
  /** درصد پورسانت از هر شارژ کاربر معرفی‌شده */
  referralPercent: number;
  /** حداقل مبلغ شارژ برای تعلق پورسانت */
  referralMinDeposit: number;
  /** سقف پورسانت هر تراکنش */
  referralMaxPerDeposit: number;
  /** هدیه خوش‌آمد به کاربر معرفی‌شده */
  referralWelcomeBonus: number;

  // ─── تعویض آدرس IP ───
  ipChangeEnabled: boolean;
  /** هزینه هر بار تعویض آدرس (تومان) */
  ipChangeFee: number;
  /** حداکثر تعداد تعویض در ماه برای هر سرور — صفر یعنی نامحدود */
  ipChangeMaxPerMonth: number;
  /** تا این تعداد ساعت پس از ساخت سرور، تعویض آدرس رایگان است و سهمیه مصرف نمی‌کند */
  ipChangeFreeHours: number;

  // ─── بررسی دسترس‌پذیری آدرس از ایران ───
  ipProbeEnabled: boolean;
  /** پورتی که برای آزمایش اتصال امتحان می‌شود */
  ipProbePort: number;
  /** مهلت هر تلاش اتصال (میلی‌ثانیه) */
  ipProbeTimeoutMs: number;
  /** چند تلاش پیاپی در هر دور بررسی */
  ipProbeTries: number;
  /** چند دور ناموفق تا نتیجه‌گیری «مسدود» */
  ipProbeRoundsToFail: number;
  /** تعویض خودکار و رایگان آدرس مسدود پیش از تحویل به مشتری */
  ipAutoSwapEnabled: boolean;
  /** حداکثر تعویض خودکار برای هر سرور */
  ipAutoSwapMax: number;
  /** چند مشاهده منفی تا یک رنج /24 سوخته اعلام شود */
  ipPrefixBadThreshold: number;

  // ─── نرخ خودکار یورو ───
  /** دریافت خودکار نرخ یورو از منبع بیرونی */
  eurAutoEnabled: boolean;
  /** منبع نرخ: navasan | tgju | custom */
  eurAutoSource: string;
  /** کلید API منبع (در صورت نیاز) */
  eurAutoApiKey: string;
  /** آدرس دلخواه برای منبع custom */
  eurAutoUrl: string;
  /** مسیر مقدار داخل JSON پاسخ، مثل «eur.value» — برای منبع custom */
  eurAutoJsonPath: string;
  /** واحد عدد منبع: toman یا rial */
  eurAutoUnit: string;
  /** حاشیه ثابتی که روی نرخ خوانده‌شده اضافه می‌شود (تومان) */
  eurAutoMarkupFixed: number;
  /** حاشیه درصدی روی نرخ خوانده‌شده */
  eurAutoMarkupPercent: number;
  /** هر چند ساعت یک بار نرخ تازه شود */
  eurAutoIntervalHours: number;
  /** اگر نرخ تازه بیش از این درصد با نرخ فعلی فرق داشت، اعمال نشود و فقط خبر بدهد */
  eurAutoMaxChangePercent: number;
  /** نرخ نهایی به نزدیک‌ترین مضرب این عدد گرد می‌شود */
  eurAutoRoundTo: number;

  // ─── باشگاه مشتریان ───
  loyaltyEnabled: boolean;
  /** آستانه مصرف سطح نقره‌ای (تومان) و درصد تخفیفش */
  loyaltySilverSpend: number;
  loyaltySilverPct: number;
  loyaltyGoldSpend: number;
  loyaltyGoldPct: number;
  loyaltyDiamondSpend: number;
  loyaltyDiamondPct: number;

  // ─── گزارش هفتگی ───
  weeklyReportEnabled: boolean;

  // ─── همگام‌سازی خودکار کاتالوگ ───
  catalogAutoSyncEnabled: boolean;
  /** هر چند ساعت یک بار کاتالوگ و موجودی پلن‌ها از هتزنر تازه شود */
  catalogSyncIntervalHours: number;

  // ─── سرور ایمیل (SMTP) ───
  // اگر میزبان خالی باشد، مقادیر فایل .env استفاده می‌شوند (سازگاری با نسخه قدیمی)
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  /** رمز، رمزنگاری‌شده با AES-256-GCM؛ هرگز خام برنمی‌گردد */
  smtpPassEnc: string;
  smtpFrom: string;
  /** پذیرش گواهی TLS خودامضا — برای سرورهای ایمیلی که گواهی معتبر ندارند */
  smtpAllowSelfSigned: boolean;
};

export const DEFAULT_SETTINGS: SettingsShape = {
  eurRate: 95000,
  markupPercent: 25,
  markupFixed: 0,
  vatPercent: 0,
  roundMonthly: 1000,
  roundHourly: 10,

  minTopup: 50_000,
  maxTopup: 500_000_000,
  hourlyPrepayHours: 24,

  suspendGraceHours: 6,
  deleteAfterDays: 7,
  invoiceLeadDays: 3,

  registrationOpen: true,
  requireEmailVerify: true,
  requirePhoneVerify: false,

  gatewayZibal: true,
  gatewayBitpay: false,
  gatewayManual: false,
  manualBankInfo: '',
  zibalMerchant: '',
  bitpayApiEnc: '',

  brandName: 'پاسارگاد میزبان',
  supportEmail: 'support@pasargadmizban.ir',
  supportPhone: '',
  siteUrl: 'https://pasargadmizban.ir',

  maintenanceMode: false,
  maintenanceMessage: 'پنل موقتاً در حال به‌روزرسانی است. لطفاً چند دقیقه دیگر تلاش کنید.',

  trafficOveragePerTb: 120_000,

  defaultLowBalanceHours: 48,
  defaultTrafficAlertPercent: 80,
  channelEmail: true,
  channelSms: false,
  channelTelegram: true,

  telegramEnabled: true,
  telegramBotUsername: '',
  telegramPolling: true,
  telegramAllowActions: true,

  monitoringEnabled: true,
  monitorDefaultInterval: 5,
  monitorMaxPerUser: 50,

  referralEnabled: true,
  referralPercent: 5,
  referralMinDeposit: 100_000,
  referralMaxPerDeposit: 2_000_000,
  referralWelcomeBonus: 0,

  ipChangeEnabled: true,
  ipChangeFee: 150_000,
  ipChangeMaxPerMonth: 3,
  ipChangeFreeHours: 48,

  ipProbeEnabled: true,
  ipProbePort: 22,
  ipProbeTimeoutMs: 6000,
  ipProbeTries: 3,
  ipProbeRoundsToFail: 2,
  ipAutoSwapEnabled: true,
  ipAutoSwapMax: 2,
  ipPrefixBadThreshold: 3,

  eurAutoEnabled: false,
  eurAutoSource: 'navasan',
  eurAutoApiKey: '',
  eurAutoUrl: '',
  eurAutoJsonPath: '',
  eurAutoUnit: 'toman',
  eurAutoMarkupFixed: 0,
  eurAutoMarkupPercent: 0,
  eurAutoIntervalHours: 6,
  eurAutoMaxChangePercent: 10,
  eurAutoRoundTo: 100,

  loyaltyEnabled: true,
  loyaltySilverSpend: 5_000_000,
  loyaltySilverPct: 2,
  loyaltyGoldSpend: 20_000_000,
  loyaltyGoldPct: 4,
  loyaltyDiamondSpend: 60_000_000,
  loyaltyDiamondPct: 6,

  weeklyReportEnabled: true,

  catalogAutoSyncEnabled: true,
  catalogSyncIntervalHours: 1,

  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPassEnc: '',
  smtpFrom: '',
  smtpAllowSelfSigned: false,
};

type CacheEntry = { value: SettingsShape; expires: number };
const CACHE_TTL_MS = 15_000;
let cache: CacheEntry | null = null;

export async function getSettings(force = false): Promise<SettingsShape> {
  if (!force && cache && cache.expires > Date.now()) return cache.value;

  let rows: { key: string; value: unknown }[] = [];
  try {
    rows = await prisma.setting.findMany();
  } catch {
    // دیتابیس هنوز آماده نیست — با مقادیر پیش‌فرض ادامه بده
    return DEFAULT_SETTINGS;
  }

  const merged = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (row.key in merged) {
      (merged as Record<string, unknown>)[row.key] = row.value;
    }
  }
  cache = { value: merged, expires: Date.now() + CACHE_TTL_MS };
  return merged;
}

export async function getSetting<K extends keyof SettingsShape>(key: K): Promise<SettingsShape[K]> {
  const all = await getSettings();
  return all[key];
}

export async function setSettings(patch: Partial<SettingsShape>): Promise<SettingsShape> {
  const entries = Object.entries(patch).filter(([k]) => k in DEFAULT_SETTINGS);
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value: value as never, group: groupOf(key) },
        update: { value: value as never },
      }),
    ),
  );
  cache = null;
  return getSettings(true);
}

export function invalidateSettingsCache() {
  cache = null;
}

function groupOf(key: string): string {
  if (['eurRate', 'markupPercent', 'markupFixed', 'vatPercent', 'roundMonthly', 'roundHourly', 'trafficOveragePerTb'].includes(key))
    return 'pricing';
  if (['minTopup', 'maxTopup', 'hourlyPrepayHours'].includes(key)) return 'billing';
  if (
    key.startsWith('gateway') ||
    ['manualBankInfo', 'zibalMerchant', 'bitpayApiEnc'].includes(key)
  )
    return 'gateways';
  if (['suspendGraceHours', 'deleteAfterDays', 'invoiceLeadDays'].includes(key)) return 'lifecycle';
  if (['registrationOpen', 'requireEmailVerify', 'requirePhoneVerify'].includes(key)) return 'auth';
  if (key.startsWith('telegram')) return 'telegram';
  if (key.startsWith('monitor')) return 'monitoring';
  if (key.startsWith('referral')) return 'referral';
  if (key.startsWith('ipChange')) return 'ip-change';
  if (key.startsWith('ipProbe') || key.startsWith('ipAutoSwap') || key.startsWith('ipPrefix')) return 'ip-probe';
  if (key.startsWith('eurAuto')) return 'eur-auto';
  if (key.startsWith('loyalty')) return 'loyalty';
  if (key.startsWith('weeklyReport')) return 'reports';
  if (key.startsWith('catalog')) return 'catalog';
  if (key.startsWith('smtp')) return 'smtp';
  if (key.startsWith('channel') || key.startsWith('default')) return 'notifications';
  return 'general';
}
