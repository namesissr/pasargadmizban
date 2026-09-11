import prisma from './prisma';
import { sendMail, wrapHtml } from './mail';
import { sendSms } from './sms';
import { readPreferences, kindEnabled, inQuietHours, type NotifyKind } from './preferences';
import { sendToUser as sendTelegram, esc as tgEsc, telegramConfigured } from './telegram';
import { getSettings } from './settings';
import { env } from './env';

export type { NotifyKind };

export type NotifyInput = {
  /**
   * دسته رویداد — تعیین می‌کند ترجیح کدام بخش کاربر بررسی شود.
   * دسته «security» همیشه و از همه کانال‌ها ارسال می‌شود.
   */
  kind?: NotifyKind;
  type?: 'info' | 'success' | 'warning' | 'error';
  title: string;
  body?: string;
  link?: string;
  /** اگر اعلانی با همین عنوان در N ساعت گذشته ساخته شده، دوباره نساز */
  dedupeHours?: number;
  /** درخواست صریح کانال — با ترجیح کاربر ترکیب می‌شود */
  email?: boolean;
  sms?: boolean;
  telegram?: boolean;
  /** رویداد فوری: ساعات سکوت را نادیده می‌گیرد */
  urgent?: boolean;
  /**
   * منتظر تحویل به کانال‌های بیرونی بماند.
   * در کارهای پس‌زمینه باید true باشد تا اگر پروسه تمام شد پیامی گم نشود؛
   * در مسیرهای وب false می‌ماند تا پاسخ کاربر معطل نشود.
   */
  wait?: boolean;
};

const TYPE_EMOJI: Record<string, string> = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '🔴',
};

export async function notify(userId: string, input: NotifyInput) {
  try {
    if (input.dedupeHours) {
      const since = new Date(Date.now() - input.dedupeHours * 3600_000);
      const existing = await prisma.notification.findFirst({
        where: { userId, title: input.title, createdAt: { gte: since } },
        select: { id: true },
      });
      if (existing) return null;
    }

    const created = await prisma.notification.create({
      data: {
        userId,
        type: input.type ?? 'info',
        title: input.title,
        body: input.body,
        link: input.link,
      },
    });

    const delivery = deliver(userId, input).catch((err) =>
      console.error('[notify] ارسال کانال بیرونی ناموفق:', err),
    );

    if (input.wait) {
      await delivery;
    } else {
      // در مسیرهای وب، ارسال بیرونی نباید پاسخ کاربر را معطل کند
      void delivery;
    }

    return created;
  } catch {
    // اعلان هرگز نباید عملیات اصلی را خراب کند
    return null;
  }
}

/** ارسال به کانال‌های بیرونی با رعایت ترجیحات کاربر */
async function deliver(userId: string, input: NotifyInput): Promise<void> {
  const kind = input.kind ?? 'server';
  const [prefs, settings, user] = await Promise.all([
    readPreferences(userId),
    getSettings(),
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true, firstName: true },
    }),
  ]);
  if (!user) return;

  // رویدادی که کاربر خاموش کرده — فقط داخل پنل ثبت می‌شود
  if (!kindEnabled(prefs, kind)) return;

  // ساعات سکوت، مگر اینکه رویداد فوری یا امنیتی باشد
  const quiet = !input.urgent && kind !== 'security' && inQuietHours(prefs);
  if (quiet) return;

  const always = kind === 'security';
  const wantEmail = input.email ?? false;
  const wantSms = input.sms ?? false;
  const wantTelegram = input.telegram ?? true;

  const canEmail = settings.channelEmail && (always || prefs?.emailEnabled !== false);
  const canSms = settings.channelSms && (always || prefs?.smsEnabled === true);
  const canTelegram =
    settings.telegramEnabled && settings.channelTelegram && (always || prefs?.telegramEnabled !== false);

  const tasks: Promise<unknown>[] = [];

  if (wantTelegram && canTelegram && telegramConfigured()) {
    tasks.push(sendTelegram(userId, buildTelegramMessage(input), telegramButtons(input)));
  }

  if (wantEmail && canEmail && user.email) {
    // ایمیل اعلان با همان قالب برنددار ارسال می‌شود؛ اگر لینکی باشد دکمه می‌شود
    tasks.push(
      sendMail({
        to: user.email,
        subject: `${input.title} — ${env.appName}`,
        text: [input.body ?? input.title, input.link ? `\n${env.appUrl}${input.link}` : ''].join(''),
        html: wrapHtml(
          input.title,
          input.body ?? input.title,
          input.link ? { label: 'مشاهده در پنل', url: `${env.appUrl}${input.link}` } : undefined,
        ),
      }),
    );
  }

  if (wantSms && canSms && user.phone) {
    tasks.push(sendSms(user.phone, `${input.title}\n${input.body ?? ''}`.trim().slice(0, 300)));
  }

  await Promise.allSettled(tasks);
}

function buildTelegramMessage(input: NotifyInput): string {
  const emoji = TYPE_EMOJI[input.type ?? 'info'] ?? 'ℹ️';
  const lines = [`${emoji} <b>${tgEsc(input.title)}</b>`];
  if (input.body) lines.push('', tgEsc(input.body));
  return lines.join('\n');
}

function telegramButtons(input: NotifyInput) {
  if (!input.link) return {};
  return {
    buttons: [[{ text: '🔗 مشاهده در پنل', url: `${env.appUrl}${input.link}` }]],
  };
}

export async function notifyStaff(input: NotifyInput) {
  const staff = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'SUPPORT'] }, deletedAt: null },
    select: { id: true },
  });
  await Promise.all(staff.map((s) => notify(s.id, input)));
}

export async function markRead(userId: string, ids?: string[]) {
  await prisma.notification.updateMany({
    where: { userId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}
