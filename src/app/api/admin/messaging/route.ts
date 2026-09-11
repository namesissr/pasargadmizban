import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireAdmin, requireStaff, clientIp, assertSameOrigin } from '@/lib/auth';
import { getSettings, setSettings } from '@/lib/settings';
import { getSmtpConfig, testSmtpConnection, sendMail, renderEmail } from '@/lib/mail';
import { sendSms, isValidIranPhone, normalizePhone } from '@/lib/sms';
import { encrypt } from '@/lib/crypto';
import { env } from '@/lib/env';
import { enforceRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** وضعیت سرور ایمیل، آمار و لاگ ارسال‌ها */
export const GET = route(async (req: Request) => {
  await requireStaff();
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get('page') || 1));
  const statusFilter = url.searchParams.get('status');
  const perPage = 25;

  const settings = await getSettings(true);
  const config = await getSmtpConfig();

  const monthAgo = new Date(Date.now() - 30 * 24 * 3600_000);
  const where = statusFilter && ['SENT', 'FAILED', 'SKIPPED'].includes(statusFilter)
    ? { status: statusFilter as 'SENT' | 'FAILED' | 'SKIPPED' }
    : {};

  const [sent30, failed30, skipped30, lastFailed, total, logs] = await Promise.all([
    prisma.emailLog.count({ where: { status: 'SENT', createdAt: { gte: monthAgo } } }),
    prisma.emailLog.count({ where: { status: 'FAILED', createdAt: { gte: monthAgo } } }),
    prisma.emailLog.count({ where: { status: 'SKIPPED', createdAt: { gte: monthAgo } } }),
    prisma.emailLog.findFirst({ where: { status: 'FAILED' }, orderBy: { createdAt: 'desc' } }),
    prisma.emailLog.count({ where }),
    prisma.emailLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
  ]);

  return ok({
    smtp: {
      configured: Boolean(config),
      source: config?.source ?? null,
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpSecure,
      user: settings.smtpUser,
      from: settings.smtpFrom,
      hasPass: Boolean(settings.smtpPassEnc),
      envHost: env.smtp.enabled ? env.smtp.host : null,
    },
    sms: {
      configured: env.sms.enabled,
      provider: env.sms.provider,
      sender: env.sms.sender || null,
    },
    stats: { sent30, failed30, skipped30, lastFailedAt: lastFailed?.createdAt ?? null },
    logs: {
      items: logs,
      meta: { page, totalPages: Math.max(1, Math.ceil(total / perPage)), total },
    },
  });
});

const saveSchema = z.object({
  action: z.literal('save-smtp'),
  host: z.string().trim().max(200),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false),
  user: z.string().trim().max(200).optional().or(z.literal('')),
  /** خالی یعنی رمز فعلی نگه داشته شود */
  pass: z.string().max(200).optional().or(z.literal('')),
  from: z.string().trim().max(200).optional().or(z.literal('')),
});

const testEmailSchema = z.object({
  action: z.literal('test-email'),
  to: z.string().trim().email('ایمیل معتبر وارد کنید.'),
});

const testSmsSchema = z.object({
  action: z.literal('test-sms'),
  to: z.string().trim().min(10, 'شماره موبایل را وارد کنید.'),
});

const testSmtpSchema = z.object({ action: z.literal('test-smtp') });

const schema = z.discriminatedUnion('action', [saveSchema, testEmailSchema, testSmsSchema, testSmtpSchema]);

export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  await enforceRateLimit(`messaging:${admin.id}`, 30, 600, { persistent: true });

  const input = await parseBody(req, schema);

  // ── ذخیره تنظیمات SMTP ──
  if (input.action === 'save-smtp') {
    const patch: Record<string, unknown> = {
      smtpHost: input.host,
      smtpPort: input.port,
      smtpSecure: input.secure,
      smtpUser: input.user ?? '',
      smtpFrom: input.from ?? '',
    };
    if (input.pass) patch.smtpPassEnc = encrypt(input.pass);
    // پاک کردن میزبان یعنی بازگشت به مقادیر .env؛ رمز هم پاک می‌شود
    if (!input.host) patch.smtpPassEnc = '';

    await setSettings(patch as never);

    await audit({
      userId: admin.id,
      actorType: 'admin',
      action: 'admin.smtp_update',
      entity: 'settings',
      ip: await clientIp(),
      meta: { host: input.host, port: input.port, user: input.user, passChanged: Boolean(input.pass) },
    });

    return ok({
      message: input.host
        ? 'تنظیمات سرور ایمیل ذخیره شد. با دکمه «آزمایش اتصال» درستی‌اش را بررسی کنید.'
        : 'تنظیمات پنل پاک شد؛ اگر در فایل .env مقداری باشد، همان استفاده می‌شود.',
    });
  }

  // ── آزمایش اتصال ──
  if (input.action === 'test-smtp') {
    const result = await testSmtpConnection();
    return ok(result);
  }

  // ── ایمیل آزمایشی ──
  if (input.action === 'test-email') {
    const settings = await getSettings();
    const html = renderEmail({
      title: 'ایمیل آزمایشی',
      preheader: 'اگر این را می‌خوانید، ارسال ایمیل پنل درست کار می‌کند.',
      greeting: 'سلام،',
      blocks: [
        {
          type: 'text',
          text: `این یک ایمیل آزمایشی از پنل ${settings.brandName} است. اگر این پیام به دستتان رسیده، اتصال به سرور ایمیل و ارسال، هر دو سالم‌اند.`,
        },
        {
          type: 'kv',
          rows: [
            { label: 'زمان ارسال', value: new Date().toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' }) },
            { label: 'درخواست‌دهنده', value: admin.email },
          ],
        },
        { type: 'button', label: 'ورود به پنل', url: `${env.appUrl}/admin` },
      ],
    });

    const sentOk = await sendMail({
      to: input.to,
      subject: `ایمیل آزمایشی — ${settings.brandName}`,
      html,
      text: 'این یک ایمیل آزمایشی است. ارسال ایمیل پنل درست کار می‌کند.',
    });

    if (!sentOk) {
      const lastLog = await prisma.emailLog.findFirst({ orderBy: { createdAt: 'desc' } });
      throw new ApiError(
        `ارسال ناموفق بود${lastLog?.error ? `: ${lastLog.error}` : '.'} جزئیات در لاگ همین صفحه ثبت شد.`,
        502,
        { code: 'mail_failed' },
      );
    }
    return ok({ message: `ایمیل آزمایشی به ${input.to} فرستاده شد؛ صندوق ورودی (و پوشه اسپم) را ببینید.` });
  }

  // ── پیامک آزمایشی ──
  if (!env.sms.enabled) {
    throw new ApiError('سرویس پیامک پیکربندی نشده است. SMS_API_KEY را در فایل .env تنظیم کنید.', 400, {
      code: 'sms_not_configured',
    });
  }
  const phone = normalizePhone(input.to);
  if (!isValidIranPhone(phone)) {
    throw new ApiError('شماره موبایل معتبر نیست؛ مانند 09121234567 وارد کنید.', 400, {
      fields: { to: 'شماره معتبر نیست.' },
    });
  }
  const settings = await getSettings();
  const smsOk = await sendSms(phone, `پیامک آزمایشی ${settings.brandName} — ارسال پیامک پنل درست کار می‌کند.`);
  if (!smsOk) {
    throw new ApiError('ارسال پیامک ناموفق بود. کلید API، اعتبار حساب پیامکی و شماره فرستنده را بررسی کنید.', 502, {
      code: 'sms_failed',
    });
  }
  return ok({ message: `پیامک آزمایشی به ${phone} فرستاده شد.` });
});
