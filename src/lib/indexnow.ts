import { randomBytes } from 'node:crypto';
import { getSettings, setSettings } from './settings';
import { absoluteUrl } from './seo';

/**
 * IndexNow — اعلام فوری آدرس تازه به موتورهای جستجو.
 *
 * بینگ، یاندکس، Naver و Seznam این پروتکل را پشتیبانی می‌کنند و معمولاً
 * چند دقیقه بعد سراغ آدرس می‌آیند. گوگل عضو IndexNow نیست؛ برای گوگل،
 * نقشه سایت ثبت‌شده در سرچ کنسول و لینک داخلی کار را انجام می‌دهد و هیچ
 * API عمومی برای «همین حالا ایندکس کن» وجود ندارد (Indexing API فقط برای
 * آگهی شغلی و رویداد پخش زنده مجاز است).
 */

const ENDPOINT = 'https://api.indexnow.org/indexnow';

/** کلید IndexNow؛ اگر نبود، یک کلید می‌سازد و در تنظیمات ذخیره می‌کند */
export async function ensureIndexNowKey(): Promise<string> {
  const settings = await getSettings();
  if (settings.indexNowKey) return settings.indexNowKey;

  const key = randomBytes(16).toString('hex');
  await setSettings({ indexNowKey: key });
  return key;
}

export type IndexNowResult = { sent: boolean; status?: number; reason?: string };

/**
 * اعلام یک یا چند آدرس. هرگز خطا پرتاب نمی‌کند: اعلام نشدن یک آدرس به
 * موتور جستجو، دلیل خوبی برای شکست خوردن انتشار مقاله نیست.
 */
export async function submitToIndexNow(paths: string[]): Promise<IndexNowResult> {
  try {
    const settings = await getSettings();
    if (!settings.indexNowEnabled) return { sent: false, reason: 'IndexNow در تنظیمات خاموش است.' };

    const siteUrl = settings.siteUrl?.replace(/\/+$/, '');
    if (!siteUrl || /localhost|127\.0\.0\.1/.test(siteUrl)) {
      return { sent: false, reason: 'آدرس سایت تنظیم نشده یا محلی است.' };
    }

    const key = await ensureIndexNowKey();
    const host = new URL(siteUrl).host;
    const urlList = paths.map((p) => absoluteUrl(siteUrl, p)).slice(0, 10_000);
    if (!urlList.length) return { sent: false, reason: 'آدرسی برای اعلام نبود.' };

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host,
        key,
        // محل کلید می‌تواند هر آدرسی روی همین دامنه باشد؛ ما آن را در
        // /indexnow.txt سرو می‌کنیم
        keyLocation: absoluteUrl(siteUrl, '/indexnow.txt'),
        urlList,
      }),
    });

    return { sent: res.ok, status: res.status, reason: res.ok ? undefined : `پاسخ ${res.status}` };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : 'خطای ناشناخته' };
  }
}
