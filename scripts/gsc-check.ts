import 'dotenv/config';
import { SignJWT, importPKCS8, type KeyLike } from 'jose';

/**
 * بررسی اتصال سرچ کنسول، گام به گام، با پیام دقیق گوگل.
 *
 *   npm run gsc:check
 *   docker compose exec app npm run gsc:check
 *
 * فهرست پراپرتی‌هایی را که سرویس‌اکانت واقعاً می‌بیند چاپ می‌کند؛ مقدار
 * GSC_SITE_URL باید دقیقاً یکی از همان‌ها باشد. کلید خصوصی چاپ نمی‌شود.
 */

async function main() {
  const email = (process.env.GSC_CLIENT_EMAIL || '').trim();
  const site = (process.env.GSC_SITE_URL || '').trim();
  const pem = (process.env.GSC_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  const out = (...a: unknown[]) => console.log(...a);

  out('ایمیل سرویس‌اکانت:', email || '— خالی —');
  out('GSC_SITE_URL      :', site ? JSON.stringify(site) : '— خالی —');
  if (!email || !site || !pem) { out('\n❌ یکی از سه متغیر GSC_ خالی است.'); process.exit(1); }

  let key: KeyLike;
  try { key = await importPKCS8(pem, 'RS256'); }
  catch { out('\n❌ کلید خصوصی خوانده نشد (GSC_PRIVATE_KEY خراب کپی شده).'); process.exit(1); }

  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/webmasters.readonly' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(email).setSubject(email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now).setExpirationTime(now + 3600).sign(key);

  let tokenRes: Response;
  try {
    tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    });
  } catch (e) { const err = e as Error & { cause?: { code?: string } }; out('\n❌ سرور به گوگل وصل نشد:', err.cause?.code || err.message); process.exit(1); }
  const tok = (await tokenRes.json().catch(() => ({}))) as { access_token?: string };
  if (!tok.access_token) { out('\n❌ گرفتن توکن ناموفق:', tokenRes.status, JSON.stringify(tok)); process.exit(1); }
  out('\n✅ ورود سرویس‌اکانت به گوگل موفق بود.');

  const auth = { authorization: `Bearer ${tok.access_token}` };
  type ApiBody = { error?: { message?: string; details?: { reason?: string }[] } };
  /** پاسخ گوگل همیشه JSON نیست (مثلاً صفحه HTML وقتی پیش از API رد می‌شود)؛ متن خام را هم نگه می‌داریم */
  const readBody = async <T,>(res: Response): Promise<{ json: (T & ApiBody) | null; text: string }> => {
    const text = await res.text().catch(() => '');
    try {
      return { json: JSON.parse(text) as T & ApiBody, text };
    } catch {
      return { json: null, text };
    }
  };
  const showError = (res: Response, body: { json: ApiBody | null; text: string }) => {
    const e = body.json?.error;
    if (!e) {
      const text = body.text.replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      out(`   وضعیت ${res.status} — پاسخ JSON نیست (content-type: ${res.headers.get('content-type') || '—'})`);
      out(`   متن پاسخ: ${text ? text.slice(0, 400) : '— خالی —'}`);
      out('   یعنی گوگل درخواست را پیش از رسیدن به Search Console API رد کرده است، نه به خاطر تنظیمات سرچ کنسول.');
      return;
    }
    out(`   وضعیت ${res.status}: ${e.message || JSON.stringify(e).slice(0, 300)}`);
    const reasons = (e.details || []).map((d) => d.reason).filter(Boolean);
    if (reasons.length) out('   علت:', reasons.join(', '));
    const link = body.text.match(/https:\/\/console\.developers\.google\.com[^"\s]*/);
    if (link) out('   لینک روشن کردن API:', link[0]);
  };

  const sitesRes = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites', { headers: auth });
  const sitesBody = await readBody<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(sitesRes);
  if (!sitesRes.ok) {
    out('\n❌ فهرست پراپرتی‌ها خوانده نشد:');
    showError(sitesRes, sitesBody);
    process.exit(1);
  }
  const list = sitesBody.json?.siteEntry || [];
  out(`\nپراپرتی‌هایی که این سرویس‌اکانت به آن‌ها دسترسی دارد (${list.length}):`);
  for (const s of list) out(`   • ${JSON.stringify(s.siteUrl)}  ← ${s.permissionLevel}`);
  if (!list.length) out('   — هیچ —  (ایمیل سرویس‌اکانت در Users and permissions سرچ کنسول اضافه نشده)');

  const match = list.find((s) => s.siteUrl === site);
  if (!match) {
    out(`\n❌ ${JSON.stringify(site)} در این فهرست نیست.`);
    if (list.length) out('   GSC_SITE_URL را دقیقاً یکی از مقدارهای بالا بگذارید.');
    process.exit(1);
  }
  out(`\n✅ GSC_SITE_URL با پراپرتی می‌خواند (دسترسی: ${match.permissionLevel}).`);

  const day = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const qRes = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ startDate: day(30), endDate: day(2), rowLimit: 1 }),
  });
  const qBody = await readBody<{ rows?: unknown[] }>(qRes);
  if (!qRes.ok) { out('\n❌ خواندن آمار ناموفق:'); showError(qRes, qBody); process.exit(1); }
  out(`\n✅ همه چیز درست است. ${(qBody.json?.rows || []).length ? 'آمار موجود است.' : 'هنوز آماری نیست (برای پراپرتی تازه ۲ تا ۳ روز طول می‌کشد).'}`);
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
