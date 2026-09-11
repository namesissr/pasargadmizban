#!/usr/bin/env node
/**
 * سرویس آزمایش دسترسی از ایران — «چشم» پنل در داخل کشور.
 *
 * پنل روی سرور خارج اجرا می‌شود، پس خودش نمی‌فهمد آدرس یک سرور از داخل ایران
 * باز می‌شود یا فیلتر است. این فایل را روی یکی از سرورهای ایرانی خودتان بگذارید؛
 * پنل آدرس را برایش می‌فرستد و این سرویس فقط یک اتصال TCP می‌زند و نتیجه را
 * برمی‌گرداند.
 *
 * ── اجرا ──
 *   IRAN_PROBE_SECRET=یک-کلید-تصادفی-بلند PORT=8787 node iran-probe-agent.mjs
 *
 * با pm2:
 *   pm2 start iran-probe-agent.mjs --name iran-probe \
 *     --env IRAN_PROBE_SECRET=... --env PORT=8787
 *
 * ── نکات امنیتی ──
 *   • این سرویس هیچ داده‌ای از پنل نمی‌گیرد و چیزی هم ذخیره نمی‌کند.
 *   • فقط به مقصدهایی وصل می‌شود که پنل می‌گوید، و فقط برای چند ثانیه.
 *   • آدرس‌های خصوصی و لوکال را رد می‌کند تا از آن به عنوان پروکسی داخلی
 *     سوءاستفاده نشود.
 *   • پشت Nginx با TLS بگذاریدش و پورتش را روی اینترنت باز نگذارید،
 *     یا دست‌کم فقط آی‌پی سرور پنل را در فایروال مجاز کنید.
 *
 * وابستگی ندارد؛ فقط ماژول‌های خود Node.
 */

import http from 'node:http';
import net from 'node:net';
import { timingSafeEqual } from 'node:crypto';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
// فاصله اضافه در انتهای متغیر محیطی، اشتباه رایجی است و خطای گیج‌کننده می‌دهد
const SECRET = (process.env.IRAN_PROBE_SECRET || '').trim();

/** مقصدهایی که برای اطمینان از سالم بودن اینترنتِ خودِ این سرور امتحان می‌شوند */
const SELF_CHECK = (process.env.PROBE_SELF_CHECK || '8.8.8.8:53,1.1.1.1:53')
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean)
  .map((t) => {
    const [ip, port] = t.split(':');
    return { ip, port: Number(port || 53) };
  });

const MAX_TARGETS = 12;
const MAX_TIMEOUT = 20_000;

if (!SECRET || SECRET.length < 16) {
  console.error('❌ متغیر IRAN_PROBE_SECRET تنظیم نشده یا کوتاه‌تر از ۱۶ کاراکتر است.');
  console.error('   یک کلید تصادفی بسازید:  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}

// ───────────────  ابزارها  ───────────────

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** آدرس‌های خصوصی، لوکال و رزروشده پذیرفته نمی‌شوند */
function isPublicIpv4(ip) {
  if (typeof ip !== 'string') return false;
  const parts = ip.split('.');
  if (parts.length !== 4) return false;

  const n = parts.map(Number);
  if (n.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return false;

  const [a, b] = n;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a >= 224) return false;
  return true;
}

/** یک اتصال TCP ساده؛ فقط می‌گوید طرف مقابل دست داد یا نه */
function tcpProbe(ip, port, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = new net.Socket();
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish({ reachable: true, latencyMs: Date.now() - started, error: null }));
    socket.once('timeout', () => finish({ reachable: false, latencyMs: null, error: 'timeout' }));
    socket.once('error', (err) => finish({ reachable: false, latencyMs: null, error: err.code || 'error' }));

    socket.connect(port, ip);
  });
}

/** چند تلاش پیاپی؛ یک پاسخ موفق کافی است */
async function probeWithRetries(ip, port, timeoutMs, tries) {
  let last = { reachable: false, latencyMs: null, error: 'no attempt' };
  for (let i = 0; i < tries; i++) {
    last = await tcpProbe(ip, port, timeoutMs);
    if (last.reachable) return last;
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 1200));
  }
  return last;
}

/** آیا خودِ این سرور به اینترنت وصل است؟ اگر نه، هیچ نتیجه‌ای معتبر نیست */
async function selfCheck(timeoutMs) {
  for (const target of SELF_CHECK) {
    const r = await tcpProbe(target.ip, target.port, Math.min(timeoutMs, 5000));
    if (r.reachable) return true;
  }
  return false;
}

function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(json) });
  res.end(json);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error('body too large');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function parseTargets(list) {
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, MAX_TARGETS)
    .map((t) => ({ ip: String(t?.ip ?? ''), port: Number(t?.port ?? 22) }))
    .filter((t) => isPublicIpv4(t.ip) && Number.isInteger(t.port) && t.port > 0 && t.port < 65536);
}

// ───────────────  سرور  ───────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/health' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, service: 'iran-probe-agent', version: 1 });
  }

  if (url.pathname !== '/probe' || req.method !== 'POST') {
    return sendJson(res, 404, { ok: false, error: 'not found' });
  }

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || !safeEqual(token, SECRET)) {
    return sendJson(res, 401, { ok: false, error: 'unauthorized' });
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    return sendJson(res, 400, { ok: false, error: 'invalid body' });
  }

  const timeoutMs = Math.min(Math.max(Number(body.timeoutMs) || 6000, 1000), MAX_TIMEOUT);
  const tries = Math.min(Math.max(Number(body.tries) || 3, 1), 10);
  const targets = parseTargets(body.targets);
  const controls = parseTargets(body.controls);

  if (targets.length === 0) {
    return sendJson(res, 400, { ok: false, error: 'no valid target' });
  }

  const online = await selfCheck(timeoutMs);

  const results = [];
  for (const t of targets) {
    const r = await probeWithRetries(t.ip, t.port, timeoutMs, tries);
    results.push({ ip: t.ip, port: t.port, ...r });
  }

  const controlResults = [];
  for (const c of controls) {
    const r = await probeWithRetries(c.ip, c.port, timeoutMs, Math.min(tries, 2));
    controlResults.push({ ip: c.ip, port: c.port, ...r });
  }

  const stamp = new Date().toISOString();
  console.log(
    `[${stamp}] ${results.map((r) => `${r.ip}:${r.port}=${r.reachable ? 'ok' : r.error}`).join(' ')}` +
      (controlResults.length ? ` | control ${controlResults.map((r) => (r.reachable ? 'ok' : 'bad')).join(',')}` : '') +
      ` | online=${online}`,
  );

  sendJson(res, 200, { ok: true, online, results, controls: controlResults, checkedAt: stamp });
});

server.listen(PORT, HOST, () => {
  console.log(`✅ سرویس آزمایش دسترسی روی http://${HOST}:${PORT} بالا آمد.`);
  console.log(`   سلامت: GET /health   ·   آزمایش: POST /probe`);
  console.log(`   مقصدهای بررسی اینترنت: ${SELF_CHECK.map((t) => `${t.ip}:${t.port}`).join(', ')}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log('\nخاموش می‌شود…');
    server.close(() => process.exit(0));
  });
}
