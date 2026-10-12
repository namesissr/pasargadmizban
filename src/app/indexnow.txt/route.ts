import { ensureIndexNowKey } from '@/lib/indexnow';

/**
 * فایل تأیید کلید IndexNow. موتورهای جستجو این آدرس را می‌خوانند تا مطمئن
 * شوند کلید اعلام‌شده واقعاً مال صاحب دامنه است.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const key = await ensureIndexNowKey();
  return new Response(key, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
