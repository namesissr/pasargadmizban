import { z } from 'zod';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { rateLimit } from '@/lib/rate-limit';
import { visitorIp } from '@/lib/tools/visitor';
import { ToolError } from '@/lib/tools/net';
import { tcpCheck, dnsLookup, sslCheck, httpCheck } from '@/lib/tools/checks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Ctx = { params: Promise<{ tool: string }> };

const schema = z.object({
  target: z.string().trim().min(1, 'نشانی یا آی‌پی را وارد کنید.').max(300),
  port: z.coerce.number().int().min(1).max(65535).optional().nullable(),
});

const HANDLERS: Record<string, (target: string, port?: number | null) => Promise<unknown>> = {
  tcp: tcpCheck,
  dns: (target) => dnsLookup(target),
  ssl: sslCheck,
  http: (target) => httpCheck(target),
};

/** شمار بررسی‌های هم‌زمان؛ ابزار رایگان نباید سرور را از کار بیندازد */
let inFlight = 0;
const MAX_IN_FLIGHT = 25;

/**
 * اجرای ابزارهای شبکه (عمومی، بدون ورود).
 * محدودیت: ۱۵ بررسی در دقیقه و ۳۰۰ در روز برای هر آی‌پی.
 */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const { tool } = await ctx.params;
  const handler = HANDLERS[tool];
  if (!handler) throw new ApiError('این ابزار وجود ندارد.', 404);

  const ip = (await visitorIp()) ?? 'unknown';
  const minute = await rateLimit(`tools:m:${ip}`, 15, 60);
  if (!minute.allowed) throw new ApiError(`کمی صبر کنید؛ ${minute.retryAfterSeconds} ثانیه دیگر دوباره امتحان کنید.`, 429);
  const day = await rateLimit(`tools:d:${ip}`, 300, 86_400, { persistent: true });
  if (!day.allowed) throw new ApiError('سقف استفاده امروز از ابزارها پر شده است؛ فردا دوباره امتحان کنید.', 429);

  if (inFlight >= MAX_IN_FLIGHT) throw new ApiError('سرور ابزارها الان شلوغ است؛ چند ثانیه دیگر امتحان کنید.', 503);

  const { target, port } = await parseBody(req, schema);
  inFlight++;
  try {
    return ok({ result: await handler(target, port) });
  } catch (err) {
    if (err instanceof ToolError) throw new ApiError(err.message, err.status);
    throw err;
  } finally {
    inFlight--;
  }
});
