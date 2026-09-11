/**
 * خواندن و اعتبارسنجی متغیرهای محیطی.
 * در زمان build اجازه می‌دهیم مقادیر خالی باشند تا next build شکست نخورد،
 * ولی در زمان اجرا مقادیر حیاتی بررسی می‌شوند.
 */

function get(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

function required(key: string): string {
  const v = process.env[key];
  if (!v) {
    if (process.env.NEXT_PHASE === 'phase-production-build') return '';
    throw new Error(`متغیر محیطی «${key}» تعریف نشده است. فایل .env را بررسی کنید.`);
  }
  return v;
}

export const env = {
  nodeEnv: get('NODE_ENV', 'development'),
  isProd: get('NODE_ENV') === 'production',

  appUrl: get('APP_URL', 'http://localhost:3000').replace(/\/$/, ''),
  appName: get('APP_NAME', 'پاسارگاد میزبان'),

  databaseUrl: get('DATABASE_URL'),

  /** کلید امضای نشست‌ها — حداقل ۳۲ کاراکتر */
  get sessionSecret() {
    return required('SESSION_SECRET');
  },
  /** کلید رمزنگاری AES برای پسورد روت سرورها — دقیقاً ۶۴ کاراکتر هگز */
  get encryptionKey() {
    return required('ENCRYPTION_KEY');
  },

  hetzner: {
    /** فقط برای مهاجرت از نسخه‌های قدیمی؛ توکن‌های واقعی در دیتابیس نگهداری می‌شوند */
    tokenOptional: get('HETZNER_API_TOKEN'),
    baseUrl: get('HETZNER_API_URL', 'https://api.hetzner.cloud/v1'),
  },

  /**
   * سرویس کوچکی که روی یک سرور ایرانی اجرا می‌شود و به ما می‌گوید آدرس سرور
   * تازه از داخل ایران باز می‌شود یا نه. پنل خارج از کشور است و خودش
   * نمی‌تواند این را تشخیص بدهد.
   */
  iranProbe: {
    // فاصله اضافه در انتهای مقدار، اشتباه رایجی است که خطای «دسترسی غیرمجاز» می‌دهد
    url: get('IRAN_PROBE_URL').trim(),
    secret: get('IRAN_PROBE_SECRET').trim(),
    get enabled() {
      return Boolean(get('IRAN_PROBE_URL').trim() && get('IRAN_PROBE_SECRET').trim());
    },
  },

  zibal: {
    merchant: get('ZIBAL_MERCHANT', 'zibal'),
    baseUrl: get('ZIBAL_API_URL', 'https://gateway.zibal.ir'),
    sandbox: get('ZIBAL_MERCHANT', 'zibal') === 'zibal',
  },

  smtp: {
    host: get('SMTP_HOST'),
    port: Number(get('SMTP_PORT', '587')),
    secure: get('SMTP_SECURE') === 'true',
    user: get('SMTP_USER'),
    pass: get('SMTP_PASS'),
    from: get('SMTP_FROM', 'no-reply@pasargadmizban.ir'),
    enabled: Boolean(get('SMTP_HOST')),
  },

  sms: {
    provider: get('SMS_PROVIDER', 'kavenegar'),
    apiKey: get('SMS_API_KEY'),
    sender: get('SMS_SENDER'),
    enabled: Boolean(get('SMS_API_KEY')),
  },

  telegram: {
    /** توکن ربات از BotFather */
    token: get('TELEGRAM_BOT_TOKEN'),
    /** توکن محرمانه برای اعتبارسنجی درخواست‌های webhook تلگرام */
    webhookSecret: get('TELEGRAM_WEBHOOK_SECRET', ''),
    /**
     * آدرس پایه API تلگرام.
     * اگر سرور شما مستقیم به api.telegram.org دسترسی ندارد، آدرس پروکسی خود را بگذارید.
     */
    apiUrl: get('TELEGRAM_API_URL', 'https://api.telegram.org').replace(/\/$/, ''),
  },

  /** توکن محافظ برای صدا زدن endpoint های کرون از بیرون */
  cronSecret: get('CRON_SECRET', ''),

  cookieName: get('SESSION_COOKIE', 'pm_session'),
  sessionDays: Number(get('SESSION_DAYS', '30')),
} as const;

export type Env = typeof env;
