import nodemailer, { type Transporter } from 'nodemailer';
import { env } from './env';
import { getSettings } from './settings';
import { decrypt } from './crypto';
import prisma from './prisma';

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  /** db یعنی از تنظیمات پنل، env یعنی از فایل .env */
  source: 'db' | 'env';
};

/**
 * پیکربندی SMTP: اول تنظیمات پنل، وگرنه فایل .env.
 * این ترتیب به مدیر اجازه می‌دهد بدون دست زدن به سرور، از داخل سایت
 * سرور ایمیل را عوض کند.
 */
export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const settings = await getSettings();
  if (settings.smtpHost.trim()) {
    return {
      host: settings.smtpHost.trim(),
      port: settings.smtpPort || 587,
      secure: settings.smtpSecure,
      user: settings.smtpUser.trim(),
      pass: settings.smtpPassEnc ? (decrypt(settings.smtpPassEnc) ?? '') : '',
      from: settings.smtpFrom.trim() || env.smtp.from,
      source: 'db',
    };
  }
  if (env.smtp.enabled) {
    return {
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      user: env.smtp.user,
      pass: env.smtp.pass,
      from: env.smtp.from,
      source: 'env',
    };
  }
  return null;
}

// ترنسپورتر تا وقتی پیکربندی عوض نشده، دوباره ساخته نمی‌شود
let transporter: Transporter | null = null;
let transporterKey = '';

function buildTransporter(config: SmtpConfig): Transporter {
  const key = JSON.stringify([config.host, config.port, config.secure, config.user, config.pass]);
  if (transporter && transporterKey === key) return transporter;
  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    connectionTimeout: 15_000,
  });
  transporterKey = key;
  return transporter;
}

/** آزمایش اتصال به سرور ایمیل بدون ارسال چیزی */
export async function testSmtpConnection(): Promise<{ ok: boolean; message: string; source?: 'db' | 'env' }> {
  const config = await getSmtpConfig();
  if (!config) {
    return { ok: false, message: 'هیچ سرور ایمیلی پیکربندی نشده است. میزبان SMTP را وارد کنید.' };
  }
  try {
    await buildTransporter(config).verify();
    return { ok: true, message: `اتصال به ${config.host}:${config.port} برقرار شد.`, source: config.source };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `اتصال برقرار نشد: ${raw.slice(0, 300)}`, source: config.source };
  }
}

export type MailInput = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
};

async function logEmail(input: MailInput, status: 'SENT' | 'FAILED' | 'SKIPPED', error?: string, host?: string) {
  await prisma.emailLog
    .create({
      data: {
        to: input.to.slice(0, 200),
        subject: input.subject.slice(0, 300),
        status,
        error: error?.slice(0, 500) ?? null,
        smtpHost: host ?? null,
      },
    })
    .catch(() => null);
}

export async function sendMail(input: MailInput): Promise<boolean> {
  const config = await getSmtpConfig();
  if (!config) {
    if (!env.isProd) {
      console.info('[mail:dev]', input.to, '|', input.subject, '\n', input.text ?? input.html?.slice(0, 200));
    }
    await logEmail(input, 'SKIPPED', 'سرور ایمیل پیکربندی نشده است');
    return false;
  }
  try {
    await buildTransporter(config).sendMail({
      from: `${env.appName} <${config.from}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? (input.text ? wrapHtml(input.subject, input.text) : undefined),
    });
    await logEmail(input, 'SENT', undefined, config.host);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[mail] ارسال ایمیل ناموفق بود:', message);
    await logEmail(input, 'FAILED', message, config.host);
    return false;
  }
}

// ═══════════════════  موتور قالب ایمیل  ═══════════════════
//
// ایمیل دنیای خودش را دارد: بیشتر کلاینت‌ها CSS بیرونی و فونت وب را نمی‌خوانند،
// فلکس و گرید را نمی‌فهمند و رنگ‌ها را دستکاری می‌کنند. پس همه چیز با جدول و
// استایل خطی ساخته می‌شود تا در جیمیل، اوت‌لوک و کلاینت‌های موبایل یکسان و
// راست‌چین دیده شود.

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** اعداد فارسی برای نمایش در ایمیل */
export function faDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

const C = {
  bg: '#eef1f4',
  card: '#ffffff',
  border: '#e3e8ee',
  brand: '#0d8f7e',
  brandDark: '#0b7466',
  text: '#1d2733',
  muted: '#67737f',
  faint: '#98a2ad',
  codeBg: '#f4f6f8',
  successBg: '#e8f7f1',
  successBorder: '#b7e4d3',
  successText: '#0c6b4f',
  warnBg: '#fdf3e2',
  warnBorder: '#f3ddb0',
  warnText: '#8a5a10',
  dangerBg: '#fdecec',
  dangerBorder: '#f3c1c1',
  dangerText: '#a02121',
  infoBg: '#e9f2fd',
  infoBorder: '#c4dbf5',
  infoText: '#1d5da8',
};

const FONT = `'Segoe UI',Tahoma,Arial,sans-serif`;

export type EmailBlock =
  | { type: 'text'; text: string; muted?: boolean }
  | { type: 'button'; label: string; url: string }
  | { type: 'kv'; rows: { label: string; value: string; mono?: boolean; strong?: boolean }[] }
  | { type: 'code'; label?: string; value: string }
  | { type: 'note'; tone: 'success' | 'warning' | 'danger' | 'info'; text: string }
  | { type: 'divider' };

export type EmailInput = {
  title: string;
  /** متن خاکستری کوتاهی که کنار موضوع در صندوق ورودی دیده می‌شود */
  preheader?: string;
  /** سلام و خطاب، مثل «رضا عزیز،» */
  greeting?: string;
  blocks: EmailBlock[];
};

function renderBlock(block: EmailBlock): string {
  switch (block.type) {
    case 'text':
      return `<tr><td style="padding:0 0 14px;font-family:${FONT};font-size:14px;line-height:26px;color:${block.muted ? C.muted : C.text};text-align:right">${esc(block.text).replace(/\n/g, '<br>')}</td></tr>`;

    case 'button':
      return `<tr><td align="center" style="padding:8px 0 22px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="border-radius:10px;background:${C.brand}">
            <a href="${esc(block.url)}" target="_blank"
               style="display:inline-block;padding:13px 34px;font-family:${FONT};font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px">
              ${esc(block.label)}
            </a>
          </td>
        </tr></table>
        <div style="padding-top:10px;font-family:${FONT};font-size:11px;color:${C.faint};direction:ltr;word-break:break-all">${esc(block.url)}</div>
      </td></tr>`;

    case 'kv': {
      const rows = block.rows
        .map(
          (r, i) => `<tr>
            <td style="padding:9px 14px;font-family:${FONT};font-size:12px;color:${C.muted};text-align:right;white-space:nowrap;${i > 0 ? `border-top:1px solid ${C.border};` : ''}">${esc(r.label)}</td>
            <td style="padding:9px 14px;font-family:${r.mono ? `'Courier New',monospace` : FONT};font-size:13px;color:${C.text};${r.strong ? 'font-weight:bold;' : ''}text-align:left;direction:ltr;${i > 0 ? `border-top:1px solid ${C.border};` : ''}">${esc(r.value)}</td>
          </tr>`,
        )
        .join('');
      return `<tr><td style="padding:0 0 18px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="border:1px solid ${C.border};border-radius:10px;background:${C.codeBg}">
          ${rows}
        </table>
      </td></tr>`;
    }

    case 'code':
      return `<tr><td style="padding:0 0 18px">
        ${block.label ? `<div style="font-family:${FONT};font-size:12px;color:${C.muted};padding-bottom:6px;text-align:right">${esc(block.label)}</div>` : ''}
        <div style="background:${C.codeBg};border:1px solid ${C.border};border-radius:10px;padding:13px 16px;font-family:'Courier New',monospace;font-size:15px;font-weight:bold;letter-spacing:1px;color:${C.text};text-align:center;direction:ltr">${esc(block.value)}</div>
      </td></tr>`;

    case 'note': {
      const tones = {
        success: { bg: C.successBg, border: C.successBorder, color: C.successText },
        warning: { bg: C.warnBg, border: C.warnBorder, color: C.warnText },
        danger: { bg: C.dangerBg, border: C.dangerBorder, color: C.dangerText },
        info: { bg: C.infoBg, border: C.infoBorder, color: C.infoText },
      } as const;
      const t = tones[block.tone];
      return `<tr><td style="padding:0 0 18px">
        <div style="background:${t.bg};border:1px solid ${t.border};border-radius:10px;padding:12px 16px;font-family:${FONT};font-size:13px;line-height:24px;color:${t.color};text-align:right">${esc(block.text).replace(/\n/g, '<br>')}</div>
      </td></tr>`;
    }

    case 'divider':
      return `<tr><td style="padding:4px 0 18px"><div style="border-top:1px solid ${C.border};font-size:0;line-height:0">&nbsp;</div></td></tr>`;
  }
}

/** رندر کامل یک ایمیل با سربرگ برند، بدنه بلوکی و پانوشت */
export function renderEmail(input: EmailInput): string {
  const year = faDigits(new Date().getFullYear());
  const preheader = input.preheader ?? input.title;

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg}">
  <!-- متن پیش‌نمایش صندوق ورودی -->
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${C.bg}">${esc(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg}" dir="rtl">
    <tr><td align="center" style="padding:32px 14px">

      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px">

        <!-- سربرگ برند -->
        <tr><td style="padding:0 4px 14px" align="right">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" dir="rtl"><tr>
            <td style="width:38px;height:38px;background:${C.brand};border-radius:11px;text-align:center;vertical-align:middle;font-family:${FONT};font-size:19px;color:#ffffff;font-weight:bold">☁</td>
            <td style="padding-right:10px;font-family:${FONT};text-align:right">
              <div style="font-size:16px;font-weight:bold;color:${C.text}">${esc(env.appName)}</div>
              <div style="font-size:11px;color:${C.muted}">پنل سرور ابری</div>
            </td>
          </tr></table>
        </td></tr>

        <!-- کارت اصلی -->
        <tr><td style="background:${C.card};border:1px solid ${C.border};border-radius:16px;padding:28px 24px 14px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="rtl">
            <tr><td style="padding:0 0 6px;font-family:${FONT};font-size:18px;font-weight:bold;color:${C.text};text-align:right">${esc(input.title)}</td></tr>
            <tr><td style="padding:0 0 16px"><div style="width:44px;border-top:3px solid ${C.brand};border-radius:3px"></div></td></tr>
            ${input.greeting ? `<tr><td style="padding:0 0 10px;font-family:${FONT};font-size:14px;line-height:26px;color:${C.text};text-align:right">${esc(input.greeting)}</td></tr>` : ''}
            ${input.blocks.map(renderBlock).join('\n')}
          </table>
        </td></tr>

        <!-- پانوشت -->
        <tr><td style="padding:18px 8px 0" align="center">
          <div style="font-family:${FONT};font-size:11px;line-height:20px;color:${C.faint};text-align:center">
            این ایمیل به صورت خودکار از ${esc(env.appName)} ارسال شده است؛ لطفاً به آن پاسخ ندهید.<br>
            <a href="${esc(env.appUrl)}" style="color:${C.brandDark};text-decoration:none">${esc(env.appUrl.replace(/^https?:\/\//, ''))}</a>
            &nbsp;·&nbsp; پشتیبانی از طریق <a href="${esc(env.appUrl)}/dashboard/tickets" style="color:${C.brandDark};text-decoration:none">تیکت</a>
            <br>© ${year} ${esc(env.appName)} — تمامی حقوق محفوظ است.
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * سازگاری با کد قدیمی: متن ساده + دکمه اختیاری.
 * همه ایمیل‌های اعلان از همین مسیر می‌گذرند و قالب کامل می‌گیرند.
 */
export function wrapHtml(title: string, body: string, action?: { label: string; url: string }): string {
  const blocks: EmailBlock[] = [{ type: 'text', text: body }];
  if (action) blocks.push({ type: 'button', label: action.label, url: action.url });
  return renderEmail({ title, blocks });
}

// ═══════════════════  قالب‌های آماده  ═══════════════════

export function verifyEmailTemplate(name: string, url: string) {
  return {
    subject: `تایید ایمیل حساب کاربری — ${env.appName}`,
    html: renderEmail({
      title: 'تایید آدرس ایمیل',
      preheader: 'یک قدم تا فعال شدن حساب شما مانده است',
      greeting: `${name} عزیز، خوش آمدید 👋`,
      blocks: [
        {
          type: 'text',
          text: 'برای فعال‌سازی حساب کاربری و شروع ساخت سرور، کافی است روی دکمه زیر بزنید.',
        },
        { type: 'button', label: 'تایید ایمیل و فعال‌سازی حساب', url },
        { type: 'note', tone: 'info', text: 'این لینک تا ۲۴ ساعت معتبر است.' },
        {
          type: 'text',
          muted: true,
          text: 'اگر شما در پنل ثبت‌نام نکرده‌اید، این ایمیل را نادیده بگیرید؛ هیچ اتفاقی نمی‌افتد.',
        },
      ],
    }),
    text: `برای تایید ایمیل به این آدرس بروید: ${url}`,
  };
}

export function resetPasswordTemplate(name: string, url: string) {
  return {
    subject: `بازیابی رمز عبور — ${env.appName}`,
    html: renderEmail({
      title: 'بازیابی رمز عبور',
      preheader: 'درخواست تعیین رمز عبور جدید',
      greeting: `${name} عزیز،`,
      blocks: [
        { type: 'text', text: 'درخواستی برای بازیابی رمز عبور حساب شما ثبت شده است. برای تعیین رمز جدید روی دکمه زیر بزنید.' },
        { type: 'button', label: 'تعیین رمز عبور جدید', url },
        { type: 'note', tone: 'warning', text: 'این لینک فقط تا ۱ ساعت معتبر است و پس از یک بار استفاده باطل می‌شود.' },
        {
          type: 'text',
          muted: true,
          text: 'اگر شما این درخواست را نداده‌اید، این ایمیل را نادیده بگیرید؛ رمز فعلی شما دست‌نخورده می‌ماند.',
        },
      ],
    }),
    text: `برای بازیابی رمز عبور به این آدرس بروید: ${url}`,
  };
}

export function serverReadyTemplate(server: {
  name: string;
  ipv4: string | null;
  ipv6: string | null;
  rootPassword?: string | null;
  location: string;
  plan: string;
}) {
  const blocks: EmailBlock[] = [
    { type: 'note', tone: 'success', text: `سرور «${server.name}» با موفقیت ساخته شد و آماده بهره‌برداری است.` },
    {
      type: 'kv',
      rows: [
        { label: 'پلن', value: server.plan.toUpperCase() },
        { label: 'لوکیشن', value: server.location },
        ...(server.ipv4 ? [{ label: 'آدرس IPv4', value: server.ipv4, mono: true, strong: true }] : []),
        ...(server.ipv6 ? [{ label: 'آدرس IPv6', value: server.ipv6, mono: true }] : []),
        { label: 'نام کاربری', value: 'root', mono: true },
      ],
    },
  ];

  if (server.rootPassword) {
    blocks.push({ type: 'code', label: 'رمز عبور روت', value: server.rootPassword });
  } else {
    blocks.push({ type: 'text', muted: true, text: 'ورود با کلید SSH انتخابی شما انجام می‌شود.' });
  }

  blocks.push(
    { type: 'button', label: 'مدیریت سرور در پنل', url: `${env.appUrl}/dashboard/servers` },
    {
      type: 'note',
      tone: 'warning',
      text: 'توصیه امنیتی: پس از اولین ورود، رمز عبور روت را تغییر دهید و ورود با کلید SSH را فعال کنید.',
    },
  );

  const lines = [
    `سرور «${server.name}» آماده است.`,
    `پلن: ${server.plan} · لوکیشن: ${server.location}`,
    `IPv4: ${server.ipv4 ?? '—'}`,
    `IPv6: ${server.ipv6 ?? '—'}`,
    `نام کاربری: root`,
    server.rootPassword ? `رمز عبور: ${server.rootPassword}` : 'ورود با کلید SSH',
  ];

  return {
    subject: `سرور ${server.name} آماده است — ${env.appName}`,
    html: renderEmail({
      title: 'سرور شما آماده است 🎉',
      preheader: `${server.name} ساخته شد — مشخصات اتصال داخل ایمیل`,
      blocks,
    }),
    text: lines.join('\n'),
  };
}
