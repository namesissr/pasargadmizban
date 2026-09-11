import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { handleUpdate, type TgUpdate } from '@/lib/telegram';
import { timingSafeEqual } from '@/lib/crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * دریافت به‌روزرسانی‌های تلگرام از طریق webhook.
 *
 * تلگرام مقدار TELEGRAM_WEBHOOK_SECRET را در هدر زیر می‌فرستد و ما آن را بررسی می‌کنیم
 * تا کسی نتواند از بیرون پیام جعلی بفرستد:
 *   X-Telegram-Bot-Api-Secret-Token
 *
 * اگر از long polling در ورکر استفاده می‌کنید، به این مسیر نیازی نیست.
 *
 * همیشه ۲۰۰ برمی‌گردانیم؛ در غیر این صورت تلگرام همان پیام را بارها دوباره می‌فرستد.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const secret = env.telegram.webhookSecret;
  if (!secret) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const provided = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!provided || !timingSafeEqual(provided, secret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    await handleUpdate(update);
  } catch (err) {
    console.error('[telegram/webhook] خطا در پردازش:', err);
  }

  return NextResponse.json({ ok: true });
}
