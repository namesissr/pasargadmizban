import prisma from './prisma';
import { env } from './env';
import { getSettings } from './settings';

/**
 * ربات اطلاع‌رسانی تلگرام.
 *
 * دو حالت دریافت پیام پشتیبانی می‌شود:
 *  ۱) long polling در ورکر (پیش‌فرض؛ نیازی به دامنه و HTTPS ندارد)
 *  ۲) webhook روی مسیر /api/telegram/webhook (برای استقرارهای عمومی)
 *
 * هر دو حالت از همان handleUpdate استفاده می‌کنند.
 */



export function telegramConfigured(): boolean {
  return Boolean(env.telegram.token);
}

type TgResponse<T> = { ok: boolean; result?: T; description?: string; error_code?: number };

async function call<T>(method: string, payload?: Record<string, unknown>, timeoutMs = 20_000): Promise<T | null> {
  if (!env.telegram.token) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${env.telegram.apiUrl}/bot${env.telegram.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: controller.signal,
      cache: 'no-store',
    });
    const json = (await res.json()) as TgResponse<T>;
    if (!json.ok) {
      // ۴۰۳ یعنی کاربر ربات را بلاک کرده — این را جداگانه مدیریت می‌کنیم
      if (json.error_code === 403) throw new TelegramBlockedError(json.description ?? 'blocked');
      console.warn(`[telegram] ${method} ناموفق:`, json.description);
      return null;
    }
    return json.result ?? null;
  } catch (err) {
    if (err instanceof TelegramBlockedError) throw err;
    if ((err as Error)?.name !== 'AbortError') {
      console.warn(`[telegram] خطا در ${method}:`, err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export class TelegramBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TelegramBlockedError';
  }
}

/** فرار دادن کاراکترهای خاص HTML برای parse_mode=HTML */
export function esc(text: string): string {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export type InlineButton = { text: string; callback_data?: string; url?: string };

export async function sendMessage(
  chatId: string | number,
  text: string,
  opts: { buttons?: InlineButton[][]; silent?: boolean } = {},
): Promise<boolean> {
  const result = await call<{ message_id: number }>('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    disable_notification: opts.silent ?? false,
    ...(opts.buttons ? { reply_markup: { inline_keyboard: opts.buttons } } : {}),
  });
  return result !== null;
}

async function answerCallback(id: string, text?: string, alert = false) {
  await call('answerCallbackQuery', { callback_query_id: id, text, show_alert: alert });
}

async function editMessage(chatId: string | number, messageId: number, text: string, buttons?: InlineButton[][]) {
  await call('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

/** ارسال پیام به کاربر پنل (اگر حساب تلگرامش متصل و فعال باشد) */
export async function sendToUser(
  userId: string,
  text: string,
  opts: { buttons?: InlineButton[][]; silent?: boolean } = {},
): Promise<boolean> {
  const link = await prisma.telegramLink.findUnique({ where: { userId } });
  if (!link || !link.active) return false;

  try {
    return await sendMessage(link.chatId, text, opts);
  } catch (err) {
    if (err instanceof TelegramBlockedError) {
      // کاربر ربات را بلاک کرده — اتصال را غیرفعال کن تا دوباره تلاش نکنیم
      await prisma.telegramLink.update({ where: { userId }, data: { active: false } }).catch(() => null);
      return false;
    }
    return false;
  }
}

export async function getBotInfo(): Promise<{ id: number; username: string; first_name: string } | null> {
  return call<{ id: number; username: string; first_name: string }>('getMe', undefined, 10_000);
}

export async function setWebhook(url: string, secret: string): Promise<boolean> {
  const res = await call<boolean>('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true,
  });
  return res === true;
}

export async function deleteWebhook(): Promise<boolean> {
  const res = await call<boolean>('deleteWebhook', { drop_pending_updates: false });
  return res === true;
}

export async function getWebhookInfo() {
  return call<{ url: string; pending_update_count: number; last_error_message?: string }>('getWebhookInfo');
}

// ───────────────  انواع به‌روزرسانی  ───────────────

type TgUser = { id: number; is_bot: boolean; first_name?: string; username?: string };
type TgChat = { id: number; type: string };
type TgMessage = { message_id: number; from?: TgUser; chat: TgChat; text?: string };
type TgCallbackQuery = { id: string; from: TgUser; message?: TgMessage; data?: string };

export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
};

// ───────────────  پردازش پیام‌ها  ───────────────

const HELP = `<b>راهنمای ربات پاسارگاد میزبان</b>

/start &lt;کد&gt; — اتصال حساب پنل به تلگرام
/balance — موجودی کیف پول و اعتبار باقی‌مانده
/servers — فهرست سرورها و وضعیت آن‌ها
/server &lt;نام&gt; — جزئیات و کنترل یک سرور
/status — وضعیت کلی حساب
/mute — قطع موقت اعلان‌ها
/unmute — فعال‌سازی مجدد اعلان‌ها
/unlink — قطع اتصال حساب
/help — همین راهنما`;

export async function handleUpdate(update: TgUpdate): Promise<void> {
  try {
    if (update.callback_query) return await handleCallback(update.callback_query);
    if (update.message?.text) return await handleMessage(update.message);
  } catch (err) {
    console.error('[telegram] خطا در پردازش پیام:', err);
  }
}

async function linkedUser(chatId: number) {
  const link = await prisma.telegramLink.findUnique({
    where: { chatId: String(chatId) },
    include: {
      user: {
        select: { id: true, email: true, firstName: true, lastName: true, balance: true, status: true, deletedAt: true },
      },
    },
  });
  if (!link || !link.user || link.user.deletedAt) return null;
  await prisma.telegramLink.update({ where: { id: link.id }, data: { lastSeenAt: new Date() } }).catch(() => null);
  return link;
}

async function handleMessage(msg: TgMessage): Promise<void> {
  const chatId = msg.chat.id;
  const text = (msg.text ?? '').trim();
  const [rawCommand, ...args] = text.split(/\s+/);
  const command = rawCommand.split('@')[0].toLowerCase();

  if (command === '/start') {
    return handleStart(chatId, msg.from, args[0]);
  }

  const link = await linkedUser(chatId);
  if (!link) {
    await sendMessage(
      chatId,
      `سلام 👋\n\nبرای استفاده از این ربات باید حساب پنل خود را متصل کنید.\n\n۱. وارد پنل شوید\n۲. به بخش <b>اطلاع‌رسانی</b> بروید\n۳. کد اتصال را بگیرید و اینجا بفرستید:\n<code>/start کد</code>`,
    );
    return;
  }

  switch (command) {
    case '/help':
      await sendMessage(chatId, HELP);
      break;
    case '/balance':
      await sendBalance(chatId, link.userId);
      break;
    case '/servers':
      await sendServerList(chatId, link.userId);
      break;
    case '/server':
      await sendServerDetail(chatId, link.userId, args.join(' '));
      break;
    case '/status':
      await sendStatus(chatId, link.userId);
      break;
    case '/mute':
      await prisma.notificationPreference
        .updateMany({ where: { userId: link.userId }, data: { telegramEnabled: false } })
        .catch(() => null);
      await sendMessage(chatId, '🔕 اعلان‌های تلگرام خاموش شد. برای فعال‌سازی مجدد /unmute بفرستید.');
      break;
    case '/unmute':
      await prisma.notificationPreference
        .updateMany({ where: { userId: link.userId }, data: { telegramEnabled: true } })
        .catch(() => null);
      await sendMessage(chatId, '🔔 اعلان‌های تلگرام دوباره فعال شد.');
      break;
    case '/unlink':
      await prisma.telegramLink.delete({ where: { id: link.id } }).catch(() => null);
      await sendMessage(chatId, '❌ اتصال حساب قطع شد. برای اتصال دوباره از پنل کد جدید بگیرید.');
      break;
    default:
      await sendMessage(chatId, `دستور شناخته نشد.\n\n${HELP}`);
  }
}

async function handleStart(chatId: number, from: TgUser | undefined, code?: string): Promise<void> {
  const existing = await prisma.telegramLink.findUnique({ where: { chatId: String(chatId) } });

  if (!code) {
    if (existing) {
      await sendMessage(chatId, `حساب شما از قبل متصل است ✅\n\n${HELP}`);
    } else {
      await sendMessage(
        chatId,
        `سلام 👋\n\nمن ربات اطلاع‌رسانی <b>پاسارگاد میزبان</b> هستم.\n\nبا اتصال حساب، این‌ها را دریافت می‌کنید:\n• هشدار قبل از اتمام اعتبار\n• اطلاع فوری از قطعی سرور\n• گزارش کسر هزینه و تمدید\n• پاسخ تیکت پشتیبانی\n\nبرای اتصال، از بخش <b>اطلاع‌رسانی</b> در پنل کد بگیرید و اینجا بفرستید:\n<code>/start کد</code>`,
      );
    }
    return;
  }

  const record = await prisma.telegramLinkCode.findUnique({
    where: { code: code.trim().toUpperCase() },
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true, deletedAt: true } } },
  });

  if (!record || record.usedAt || record.expiresAt < new Date() || !record.user || record.user.deletedAt) {
    await sendMessage(chatId, '⛔️ این کد نامعتبر یا منقضی شده است. از پنل کد جدید بگیرید.');
    return;
  }

  // اگر این چت به حساب دیگری وصل بود، اتصال قبلی برداشته می‌شود
  await prisma.telegramLink.deleteMany({ where: { OR: [{ chatId: String(chatId) }, { userId: record.userId }] } });

  await prisma.$transaction([
    prisma.telegramLink.create({
      data: {
        userId: record.userId,
        chatId: String(chatId),
        username: from?.username ?? null,
        firstName: from?.first_name ?? null,
      },
    }),
    prisma.telegramLinkCode.update({ where: { code: record.code }, data: { usedAt: new Date() } }),
  ]);

  const name = [record.user.firstName, record.user.lastName].filter(Boolean).join(' ') || record.user.email;
  await sendMessage(
    chatId,
    `✅ حساب <b>${esc(name)}</b> با موفقیت متصل شد.\n\nاز این پس اعلان‌های مهم را همین‌جا دریافت می‌کنید.\n\n${HELP}`,
  );
}

async function sendBalance(chatId: number, userId: string): Promise<void> {
  const { burnRate } = await import('./billing');
  const [user, burn] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { balance: true } }),
    burnRate(userId),
  ]);
  if (!user) return;

  const hoursLeft = burn.hourly > 0n ? Number(user.balance / burn.hourly) : null;
  const lines = [
    `💰 <b>موجودی کیف پول</b>`,
    ``,
    `موجودی فعلی: <b>${fa(user.balance)} تومان</b>`,
    `مصرف روزانه: ${fa(burn.daily)} تومان`,
    `مصرف ماهانه: ${fa(burn.monthly)} تومان`,
  ];
  if (hoursLeft !== null) {
    lines.push('', `⏳ با این مصرف، اعتبار شما ${faDuration(hoursLeft)} دیگر کافی است.`);
  } else {
    lines.push('', 'سرویس فعالی ندارید، پس هزینه‌ای کسر نمی‌شود.');
  }

  await sendMessage(chatId, lines.join('\n'), {
    buttons: [[{ text: '💳 شارژ کیف پول', url: `${env.appUrl}/dashboard/wallet` }]],
  });
}

async function sendServerList(chatId: number, userId: string): Promise<void> {
  const servers = await prisma.server.findMany({
    where: { userId, status: { not: 'DELETED' }, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { name: true, status: true, ipv4: true, serverTypeName: true, locationName: true },
  });

  if (!servers.length) {
    await sendMessage(chatId, 'سروری ندارید.', {
      buttons: [[{ text: '➕ ساخت سرور', url: `${env.appUrl}/dashboard/servers/new` }]],
    });
    return;
  }

  const lines = [`🖥 <b>سرورهای شما (${fa(servers.length)})</b>`, ''];
  for (const s of servers) {
    lines.push(
      `${statusEmoji(s.status)} <b>${esc(s.name)}</b>`,
      `   ${esc(s.ipv4 ?? 'بدون IP')} · ${esc(s.serverTypeName.toUpperCase())} · ${esc(s.locationName.toUpperCase())}`,
      '',
    );
  }
  lines.push('برای کنترل یک سرور: <code>/server نام‌سرور</code>');

  await sendMessage(chatId, lines.join('\n'));
}

async function sendServerDetail(chatId: number, userId: string, name: string): Promise<void> {
  if (!name) {
    await sendMessage(chatId, 'نام سرور را بنویسید. مثال:\n<code>/server web-01</code>');
    return;
  }

  const server = await prisma.server.findFirst({
    where: { userId, name: { equals: name, mode: 'insensitive' }, status: { not: 'DELETED' }, deletedAt: null },
    include: { monitor: true },
  });

  if (!server) {
    await sendMessage(chatId, `سروری با نام «${esc(name)}» پیدا نشد. /servers را بفرستید تا فهرست را ببینید.`);
    return;
  }

  const settings = await getSettings();
  const lines = [
    `${statusEmoji(server.status)} <b>${esc(server.name)}</b>`,
    '',
    `وضعیت: ${esc(statusFa(server.status))}`,
    `آدرس: <code>${esc(server.ipv4 ?? '—')}</code>`,
    `پلن: ${esc(server.serverTypeName.toUpperCase())} — ${fa(server.cores)} هسته، ${fa(server.memory)} گیگ رم`,
    `لوکیشن: ${esc(server.locationName.toUpperCase())}`,
    `هزینه: ${server.billingCycle === 'HOURLY' ? `${fa(server.priceHourly)} تومان در ساعت` : `${fa(server.priceMonthly)} تومان در ماه`}`,
  ];

  if (server.monitor?.enabled) {
    lines.push(
      '',
      `📡 پایش: ${server.monitor.status === 'UP' ? 'در دسترس ✅' : server.monitor.status === 'DOWN' ? 'قطع ❌' : 'در حال بررسی'}`,
    );
    if (server.monitor.lastLatencyMs) lines.push(`   زمان پاسخ: ${fa(server.monitor.lastLatencyMs)} میلی‌ثانیه`);
  }

  const buttons: InlineButton[][] = [];
  if (settings.telegramAllowActions && server.hetznerId && server.status !== 'SUSPENDED') {
    if (server.status === 'RUNNING') {
      buttons.push([
        { text: '🔄 راه‌اندازی مجدد', callback_data: `srv:reboot:${server.id}` },
        { text: '⏹ خاموش کردن', callback_data: `srv:poweroff:${server.id}` },
      ]);
    } else if (server.status === 'OFF') {
      buttons.push([{ text: '▶️ روشن کردن', callback_data: `srv:poweron:${server.id}` }]);
    }
  }
  buttons.push([{ text: '🔗 مدیریت در پنل', url: `${env.appUrl}/dashboard/servers/${server.id}` }]);

  await sendMessage(chatId, lines.join('\n'), { buttons });
}

async function sendStatus(chatId: number, userId: string): Promise<void> {
  const [user, servers, openTickets, down] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { balance: true } }),
    prisma.server.groupBy({
      by: ['status'],
      where: { userId, status: { not: 'DELETED' }, deletedAt: null },
      _count: true,
    }),
    prisma.ticket.count({ where: { userId, status: { notIn: ['CLOSED'] } } }),
    prisma.serverMonitor.count({ where: { userId, status: 'DOWN' } }),
  ]);

  const total = servers.reduce((n, s) => n + s._count, 0);
  const running = servers.find((s) => s.status === 'RUNNING')?._count ?? 0;
  const suspended = servers.find((s) => s.status === 'SUSPENDED')?._count ?? 0;

  const lines = [
    '📊 <b>وضعیت حساب</b>',
    '',
    `موجودی: <b>${fa(user?.balance ?? 0n)} تومان</b>`,
    `سرورها: ${fa(running)} روشن از ${fa(total)}`,
  ];
  if (suspended) lines.push(`⚠️ ${fa(suspended)} سرور تعلیق‌شده`);
  if (down) lines.push(`❌ ${fa(down)} سرور در حال حاضر قطع است`);
  if (openTickets) lines.push(`💬 ${fa(openTickets)} تیکت باز`);
  if (!suspended && !down) lines.push('', 'همه چیز مرتب است ✅');

  await sendMessage(chatId, lines.join('\n'), {
    buttons: [[{ text: '🔗 باز کردن پنل', url: `${env.appUrl}/dashboard` }]],
  });
}

async function handleCallback(cb: TgCallbackQuery): Promise<void> {
  const chatId = cb.message?.chat.id;
  if (!chatId || !cb.data) return;

  const link = await linkedUser(chatId);
  if (!link) {
    await answerCallback(cb.id, 'ابتدا حساب خود را متصل کنید.', true);
    return;
  }

  const [scope, action, serverId] = cb.data.split(':');
  if (scope !== 'srv') return answerCallback(cb.id);

  const settings = await getSettings();
  if (!settings.telegramAllowActions) {
    await answerCallback(cb.id, 'اجرای دستور از تلگرام غیرفعال است.', true);
    return;
  }

  const server = await prisma.server.findFirst({
    where: { id: serverId, userId: link.userId, status: { not: 'DELETED' }, deletedAt: null },
  });
  if (!server?.hetznerId) {
    await answerCallback(cb.id, 'سرور پیدا نشد.', true);
    return;
  }

  // مرحله تایید برای عملیات پرخطر
  if (action === 'poweroff') {
    await answerCallback(cb.id);
    await editMessage(chatId, cb.message!.message_id, `آیا از خاموش کردن <b>${esc(server.name)}</b> مطمئن هستید؟`, [
      [
        { text: '✅ بله، خاموش کن', callback_data: `srv:confirm-poweroff:${server.id}` },
        { text: '↩️ انصراف', callback_data: `srv:cancel:${server.id}` },
      ],
    ]);
    return;
  }

  if (action === 'cancel') {
    await answerCallback(cb.id, 'لغو شد.');
    await editMessage(chatId, cb.message!.message_id, `عملیات روی <b>${esc(server.name)}</b> لغو شد.`);
    return;
  }

  const operation = action === 'confirm-poweroff' ? 'poweroff' : action;
  if (!['poweron', 'poweroff', 'reboot'].includes(operation)) {
    await answerCallback(cb.id, 'عملیات نامعتبر است.', true);
    return;
  }

  const { clientForServer } = await import('./hetzner-accounts');
  const { audit } = await import('./audit');
  const client = await clientForServer(server);

  try {
    await answerCallback(cb.id, 'در حال اجرا…');
    if (operation === 'poweron') await client.powerOn(server.hetznerId);
    else if (operation === 'poweroff') await client.powerOff(server.hetznerId);
    else await client.reboot(server.hetznerId);

    await prisma.serverAction.create({
      data: { serverId: server.id, userId: link.userId, action: operation, status: 'RUNNING', meta: { via: 'telegram' } },
    });
    await audit({
      userId: link.userId,
      action: 'server.action',
      entity: 'server',
      entityId: server.id,
      meta: { operation, via: 'telegram' },
    });

    const label = operation === 'poweron' ? 'روشن کردن' : operation === 'poweroff' ? 'خاموش کردن' : 'راه‌اندازی مجدد';
    await editMessage(chatId, cb.message!.message_id, `✅ دستور «${label}» برای <b>${esc(server.name)}</b> ارسال شد.`);

    const { syncServer } = await import('./provisioning');
    void syncServer(server.id).catch(() => null);
  } catch (err) {
    await editMessage(
      chatId,
      cb.message!.message_id,
      `❌ اجرای دستور ناموفق بود: ${esc(err instanceof Error ? err.message : 'خطای نامشخص')}`,
    );
  }
}

// ───────────────  long polling  ───────────────

let pollOffset = 0;
let polling = false;

/** یک دور دریافت پیام. در ورکر به صورت حلقه صدا زده می‌شود. */
export async function pollOnce(timeoutSeconds = 25): Promise<number> {
  if (!telegramConfigured() || polling) return 0;
  polling = true;
  try {
    const updates = await call<TgUpdate[]>(
      'getUpdates',
      { offset: pollOffset, timeout: timeoutSeconds, allowed_updates: ['message', 'callback_query'] },
      (timeoutSeconds + 10) * 1000,
    );
    if (!updates?.length) return 0;

    for (const update of updates) {
      pollOffset = Math.max(pollOffset, update.update_id + 1);
      await handleUpdate(update);
    }
    return updates.length;
  } finally {
    polling = false;
  }
}

// ───────────────  کمکی‌ها  ───────────────

function fa(n: bigint | number): string {
  return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 }).format(Number(n));
}

function faDuration(hours: number): string {
  if (hours >= 48) return `${fa(Math.floor(hours / 24))} روز`;
  if (hours >= 1) return `${fa(Math.floor(hours))} ساعت`;
  return 'کمتر از یک ساعت';
}

function statusEmoji(status: string): string {
  return (
    { RUNNING: '🟢', OFF: '⚪️', SUSPENDED: '🔴', PROVISIONING: '🟡', REBUILDING: '🟡', MIGRATING: '🟡', ERROR: '❌' }[
      status
    ] ?? '⚪️'
  );
}

function statusFa(status: string): string {
  return (
    {
      RUNNING: 'روشن',
      OFF: 'خاموش',
      SUSPENDED: 'تعلیق‌شده',
      PROVISIONING: 'در حال ساخت',
      REBUILDING: 'در حال نصب مجدد',
      MIGRATING: 'در حال انتقال',
      DELETING: 'در حال حذف',
      ERROR: 'خطا',
    }[status] ?? status
  );
}
