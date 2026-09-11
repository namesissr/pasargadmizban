import { z } from 'zod';
import { normalizePhone, isValidIranPhone } from './sms';
import { toEnDigits } from './money';

/** رشته‌ای که ارقام فارسی/عربی آن به انگلیسی تبدیل می‌شود */
const digits = z.string().transform((s) => toEnDigits(s.trim()));

export const emailSchema = z
  .string()
  .trim()
  .min(5, 'ایمیل را وارد کنید.')
  .max(190, 'ایمیل بیش از حد طولانی است.')
  .email('قالب ایمیل معتبر نیست.')
  .transform((s) => s.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, 'رمز عبور باید حداقل ۸ کاراکتر باشد.')
  .max(128, 'رمز عبور بیش از حد طولانی است.')
  .refine((v) => /[a-zA-Z]/.test(v), 'رمز عبور باید حداقل یک حرف انگلیسی داشته باشد.')
  .refine((v) => /\d/.test(v), 'رمز عبور باید حداقل یک رقم داشته باشد.');

export const phoneSchema = digits
  .refine((v) => isValidIranPhone(v), 'شماره موبایل معتبر نیست. مثال: ۰۹۱۲۱۲۳۴۵۶۷')
  .transform((v) => normalizePhone(v));

export const optionalPhoneSchema = z
  .union([z.literal(''), phoneSchema])
  .optional()
  .transform((v) => (v ? v : undefined));

// ───────────────  احراز هویت  ───────────────

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().trim().min(2, 'نام را وارد کنید.').max(60),
  lastName: z.string().trim().min(2, 'نام خانوادگی را وارد کنید.').max(60),
  phone: phoneSchema,
  referralCode: z.string().trim().max(32).optional(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'پذیرش قوانین الزامی است.' }) }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'رمز عبور را وارد کنید.').max(128),
  remember: z.boolean().optional(),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(10, 'لینک بازیابی معتبر نیست.'),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'رمز فعلی را وارد کنید.'),
  newPassword: passwordSchema,
});

export const verifyEmailSchema = z.object({ token: z.string().min(10) });

export const profileSchema = z.object({
  firstName: z.string().trim().min(2, 'نام را وارد کنید.').max(60),
  lastName: z.string().trim().min(2, 'نام خانوادگی را وارد کنید.').max(60),
  phone: optionalPhoneSchema,
  company: z.string().trim().max(120).optional().or(z.literal('')),
  nationalId: z
    .union([z.literal(''), digits.refine((v) => /^\d{10}$/.test(v), 'کد ملی باید ۱۰ رقم باشد.')])
    .optional(),
  address: z.string().trim().max(500).optional().or(z.literal('')),
  city: z.string().trim().max(60).optional().or(z.literal('')),
  province: z.string().trim().max(60).optional().or(z.literal('')),
  postalCode: z
    .union([z.literal(''), digits.refine((v) => /^\d{10}$/.test(v), 'کد پستی باید ۱۰ رقم باشد.')])
    .optional(),
});

// ───────────────  کیف پول  ───────────────

export const topupSchema = z.object({
  amount: z.coerce
    .number({ invalid_type_error: 'مبلغ را وارد کنید.' })
    .int('مبلغ باید عدد صحیح باشد.')
    .min(1000, 'مبلغ خیلی کم است.')
    .max(1_000_000_000, 'مبلغ خیلی زیاد است.'),
  gateway: z.enum(['zibal', 'manual'], { errorMap: () => ({ message: 'درگاه پرداخت را انتخاب کنید.' }) }),
  couponCode: z.string().trim().max(32).optional().or(z.literal('')),
});

export const manualReceiptSchema = z.object({
  amount: z.coerce.number().int().min(1000, 'مبلغ را وارد کنید.'),
  trackId: z.string().trim().min(3, 'شماره پیگیری واریز را وارد کنید.').max(64),
  cardNumber: z.string().trim().max(30).optional().or(z.literal('')),
  paidAt: z.string().trim().max(40).optional().or(z.literal('')),
  note: z.string().trim().max(500).optional().or(z.literal('')),
});

// ───────────────  سرور  ───────────────

export const serverNameSchema = z
  .string()
  .trim()
  .min(3, 'نام سرور حداقل ۳ کاراکتر باشد.')
  .max(50, 'نام سرور حداکثر ۵۰ کاراکتر باشد.')
  .regex(/^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/, 'نام سرور فقط حروف انگلیسی، عدد، خط تیره و نقطه باشد.');

export const createServerSchema = z.object({
  name: serverNameSchema,
  serverType: z.string().trim().min(1, 'پلن را انتخاب کنید.').max(40),
  location: z.string().trim().min(1, 'لوکیشن را انتخاب کنید.').max(40),
  image: z.string().trim().min(1, 'سیستم‌عامل را انتخاب کنید.').max(60),
  billingCycle: z.enum(['HOURLY', 'MONTHLY'], {
    errorMap: () => ({ message: 'دوره صورتحساب را انتخاب کنید.' }),
  }),
  months: z.coerce.number().int().min(1).max(12).optional().default(1),
  sshKeyIds: z.array(z.string()).max(10).optional().default([]),
  enableBackups: z.boolean().optional().default(false),
  enableIpv4: z.boolean().optional().default(true),
  userData: z.string().max(32_000).optional().or(z.literal('')),
  label: z.string().trim().max(80).optional().or(z.literal('')),
  appTemplate: z.string().trim().max(40).optional().or(z.literal('')),
  enableMonitoring: z.boolean().optional().default(true),
});

export const serverActionSchema = z.object({
  action: z.enum([
    'poweron',
    'poweroff',
    'shutdown',
    'reboot',
    'reset',
    'reset_password',
    'enable_rescue',
    'disable_rescue',
    'enable_backup',
    'disable_backup',
    'detach_iso',
  ]),
});

export const rebuildSchema = z.object({ image: z.string().trim().min(1, 'سیستم‌عامل را انتخاب کنید.').max(60) });
export const resizeSchema = z.object({
  serverType: z.string().trim().min(1, 'پلن جدید را انتخاب کنید.').max(40),
  upgradeDisk: z.boolean().optional().default(true),
});
export const renameServerSchema = z.object({
  name: serverNameSchema.optional(),
  label: z.string().trim().max(80).optional(),
});
export const renewSchema = z.object({ months: z.coerce.number().int().min(1).max(12).default(1) });
export const attachIsoSchema = z.object({ iso: z.string().trim().min(1).max(80) });
export const snapshotSchema = z.object({ description: z.string().trim().min(2, 'توضیح اسنپ‌شات را وارد کنید.').max(100) });
export const rdnsSchema = z.object({
  ip: z.string().trim().min(3).max(64),
  dnsPtr: z.string().trim().max(253).nullable(),
});
export const deleteServerSchema = z.object({
  confirmName: z.string().trim().min(1, 'برای تایید، نام سرور را وارد کنید.'),
});

// ───────────────  کلید SSH  ───────────────

export const sshKeySchema = z.object({
  name: z.string().trim().min(2, 'نام کلید را وارد کنید.').max(60),
  publicKey: z
    .string()
    .trim()
    .min(30, 'کلید عمومی معتبر نیست.')
    .max(8000)
    .regex(
      /^(ssh-rsa|ssh-ed25519|ecdsa-sha2-nistp(256|384|521)|ssh-dss)\s+[A-Za-z0-9+/=]+(\s+\S+)?$/,
      'قالب کلید عمومی SSH معتبر نیست. باید با ssh-rsa یا ssh-ed25519 شروع شود.',
    ),
});

// ───────────────  تیکت  ───────────────

export const createTicketSchema = z.object({
  subject: z.string().trim().min(3, 'موضوع تیکت را وارد کنید.').max(150),
  body: z.string().trim().min(10, 'متن پیام حداقل ۱۰ کاراکتر باشد.').max(20_000),
  departmentId: z.string().trim().max(40).optional().or(z.literal('')),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional().default('MEDIUM'),
  serverId: z.string().trim().max(40).optional().or(z.literal('')),
});

export const replyTicketSchema = z.object({
  body: z.string().trim().min(1, 'متن پاسخ را وارد کنید.').max(20_000),
  closeTicket: z.boolean().optional().default(false),
});

// ───────────────  فایروال  ───────────────

export const firewallRuleSchema = z.object({
  direction: z.enum(['in', 'out']),
  protocol: z.enum(['tcp', 'udp', 'icmp', 'esp', 'gre']),
  port: z
    .string()
    .trim()
    .max(20)
    .regex(/^(\d{1,5}(-\d{1,5})?|any)?$/, 'قالب پورت معتبر نیست. مثال: 80 یا 8000-9000')
    .optional()
    .or(z.literal('')),
  ips: z.array(z.string().trim().max(64)).max(50).optional().default([]),
  description: z.string().trim().max(100).optional().or(z.literal('')),
});

export const firewallSchema = z.object({
  name: z.string().trim().min(2, 'نام فایروال را وارد کنید.').max(60),
  rules: z.array(firewallRuleSchema).max(50),
  serverIds: z.array(z.string()).max(50).optional().default([]),
});

// ───────────────  مدیریت  ───────────────

export const adminSettingsSchema = z.object({
  eurRate: z.coerce.number().min(1).max(10_000_000).optional(),
  markupPercent: z.coerce.number().min(-50).max(500).optional(),
  markupFixed: z.coerce.number().int().min(0).max(100_000_000).optional(),
  vatPercent: z.coerce.number().min(0).max(50).optional(),
  roundMonthly: z.coerce.number().int().min(1).max(1_000_000).optional(),
  roundHourly: z.coerce.number().int().min(1).max(100_000).optional(),
  minTopup: z.coerce.number().int().min(1000).optional(),
  maxTopup: z.coerce.number().int().min(10_000).optional(),
  hourlyPrepayHours: z.coerce.number().int().min(0).max(720).optional(),
  suspendGraceHours: z.coerce.number().int().min(0).max(720).optional(),
  deleteAfterDays: z.coerce.number().int().min(1).max(90).optional(),
  invoiceLeadDays: z.coerce.number().int().min(0).max(30).optional(),
  registrationOpen: z.boolean().optional(),
  requireEmailVerify: z.boolean().optional(),
  requirePhoneVerify: z.boolean().optional(),
  gatewayZibal: z.boolean().optional(),
  gatewayManual: z.boolean().optional(),
  manualBankInfo: z.string().max(2000).optional(),
  brandName: z.string().trim().max(80).optional(),
  supportEmail: z.string().trim().max(190).optional(),
  supportPhone: z.string().trim().max(40).optional(),
  siteUrl: z.string().trim().max(190).optional(),
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().max(500).optional(),
  trafficOveragePerTb: z.coerce.number().int().min(0).optional(),

  defaultLowBalanceHours: z.coerce.number().int().min(1).max(720).optional(),
  defaultTrafficAlertPercent: z.coerce.number().int().min(10).max(100).optional(),
  channelEmail: z.boolean().optional(),
  channelSms: z.boolean().optional(),
  channelTelegram: z.boolean().optional(),

  telegramEnabled: z.boolean().optional(),
  telegramBotUsername: z.string().trim().max(64).optional(),
  telegramPolling: z.boolean().optional(),
  telegramAllowActions: z.boolean().optional(),

  monitoringEnabled: z.boolean().optional(),
  monitorDefaultInterval: z.coerce.number().int().min(1).max(60).optional(),
  monitorMaxPerUser: z.coerce.number().int().min(0).max(1000).optional(),

  referralEnabled: z.boolean().optional(),
  referralPercent: z.coerce.number().min(0).max(50).optional(),
  referralMinDeposit: z.coerce.number().int().min(0).optional(),
  referralMaxPerDeposit: z.coerce.number().int().min(0).optional(),
  referralWelcomeBonus: z.coerce.number().int().min(0).max(100_000_000).optional(),

  ipChangeEnabled: z.boolean().optional(),
  ipChangeFee: z.coerce.number().int().min(0).max(100_000_000).optional(),
  ipChangeMaxPerMonth: z.coerce.number().int().min(0).max(100).optional(),
  ipChangeFreeHours: z.coerce.number().int().min(0).max(720).optional(),

  ipProbeEnabled: z.boolean().optional(),
  ipProbePort: z.coerce.number().int().min(1).max(65535).optional(),
  ipProbeTimeoutMs: z.coerce.number().int().min(1000).max(30_000).optional(),
  ipProbeTries: z.coerce.number().int().min(1).max(10).optional(),
  ipProbeRoundsToFail: z.coerce.number().int().min(1).max(10).optional(),
  ipAutoSwapEnabled: z.boolean().optional(),
  ipAutoSwapMax: z.coerce.number().int().min(0).max(10).optional(),
  ipPrefixBadThreshold: z.coerce.number().int().min(1).max(100).optional(),

  eurAutoEnabled: z.boolean().optional(),
  eurAutoSource: z.enum(['navasan', 'tgju', 'custom']).optional(),
  eurAutoApiKey: z.string().trim().max(200).optional().or(z.literal('')),
  eurAutoUrl: z.string().trim().url('آدرس منبع معتبر نیست.').max(300).optional().or(z.literal('')),
  eurAutoJsonPath: z.string().trim().max(120).optional().or(z.literal('')),
  eurAutoUnit: z.enum(['toman', 'rial']).optional(),
  eurAutoMarkupFixed: z.coerce.number().int().min(-1_000_000).max(1_000_000).optional(),
  eurAutoMarkupPercent: z.coerce.number().min(-50).max(100).optional(),
  eurAutoIntervalHours: z.coerce.number().int().min(1).max(168).optional(),
  eurAutoMaxChangePercent: z.coerce.number().min(1).max(100).optional(),
  eurAutoRoundTo: z.coerce.number().int().min(1).max(10_000).optional(),

  loyaltyEnabled: z.boolean().optional(),
  loyaltySilverSpend: z.coerce.number().int().min(0).optional(),
  loyaltySilverPct: z.coerce.number().int().min(0).max(50).optional(),
  loyaltyGoldSpend: z.coerce.number().int().min(0).optional(),
  loyaltyGoldPct: z.coerce.number().int().min(0).max(50).optional(),
  loyaltyDiamondSpend: z.coerce.number().int().min(0).optional(),
  loyaltyDiamondPct: z.coerce.number().int().min(0).max(50).optional(),
  weeklyReportEnabled: z.boolean().optional(),
});

export const adminUserUpdateSchema = z.object({
  role: z.enum(['USER', 'SUPPORT', 'ADMIN']).optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'BANNED']).optional(),
  discountPct: z.coerce.number().int().min(0).max(90).optional(),
  maxServers: z.coerce.number().int().min(0).max(1000).optional(),
  creditLimit: z.coerce.number().int().min(0).optional(),
  notes: z.string().max(2000).optional(),
  emailVerified: z.boolean().optional(),
});

export const adminBalanceSchema = z.object({
  amount: z.coerce.number().int().refine((v) => v !== 0, 'مبلغ نباید صفر باشد.'),
  description: z.string().trim().min(3, 'علت تعدیل را بنویسید.').max(300),
});

export const pricingRuleSchema = z.object({
  scope: z.enum(['GLOBAL', 'SERVER_TYPE', 'LOCATION', 'USER']),
  targetKey: z.string().trim().max(100).optional().or(z.literal('')),
  markupPercent: z.coerce.number().min(-50).max(500),
  markupFixed: z.coerce.number().int().min(0).max(100_000_000).default(0),
  priority: z.coerce.number().int().min(0).max(1000).default(0),
  active: z.boolean().default(true),
  note: z.string().trim().max(200).optional().or(z.literal('')),
});

export const catalogToggleSchema = z.object({
  kind: z.enum(['serverType', 'location', 'image']),
  id: z.coerce.number().int(),
  enabled: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
});

export const couponSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, 'کد تخفیف حداقل ۳ کاراکتر باشد.')
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/, 'کد تخفیف فقط شامل حروف انگلیسی، عدد، خط تیره و زیرخط باشد.')
    .transform((s) => s.toUpperCase()),
  type: z.enum(['PERCENT', 'FIXED']),
  value: z.coerce.number().int().min(1),
  maxUses: z.coerce.number().int().min(0).default(0),
  perUserMax: z.coerce.number().int().min(1).default(1),
  minAmount: z.coerce.number().int().min(0).default(0),
  maxDiscount: z.coerce.number().int().min(0).default(0),
  active: z.boolean().default(true),
  expiresAt: z.string().optional().or(z.literal('')),
});

export const announcementSchema = z.object({
  title: z.string().trim().min(3).max(150),
  body: z.string().trim().min(3).max(5000),
  level: z.enum(['info', 'success', 'warning', 'error']).default('info'),
  pinned: z.boolean().default(false),
  active: z.boolean().default(true),
});
