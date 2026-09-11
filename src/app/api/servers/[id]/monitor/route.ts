import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireUser, assertSameOrigin } from '@/lib/auth';
import { getOwnedServer } from '@/lib/server-access';
import { getSettings } from '@/lib/settings';
import { uptimeSummary, runCheck, suggestedPort } from '@/lib/monitoring';
import { enforceRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  enabled: z.boolean().optional(),
  checkType: z.enum(['tcp', 'http', 'https']).optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  httpPath: z.string().trim().max(200).optional(),
  expectStatus: z.coerce.number().int().min(0).max(599).optional(),
  intervalMinutes: z.coerce.number().int().min(1).max(60).optional(),
  failThreshold: z.coerce.number().int().min(1).max(10).optional(),
  timeoutSeconds: z.coerce.number().int().min(2).max(30).optional(),
});

export const GET = route(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const server = await getOwnedServer(id, user);
  const settings = await getSettings();

  const monitor = await prisma.serverMonitor.findUnique({ where: { serverId: server.id } });

  if (!monitor) {
    const suggestion = suggestedPort(server.appTemplate);
    return ok({
      available: settings.monitoringEnabled,
      monitor: null,
      suggestion: { ...suggestion, intervalMinutes: settings.monitorDefaultInterval },
      summary: null,
    });
  }

  const summary = await uptimeSummary(monitor.id, 30);

  return ok({
    available: settings.monitoringEnabled,
    monitor,
    suggestion: null,
    summary,
  });
});

/** فعال‌سازی یا به‌روزرسانی پایش */
export const POST = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireUser();
  const { id } = await ctx.params;

  await enforceRateLimit(`monitor:${user.id}`, 30, 600, { persistent: true });

  const server = await getOwnedServer(id, user);
  const settings = await getSettings();

  if (!settings.monitoringEnabled) {
    throw new ApiError('پایش سرور در حال حاضر غیرفعال است.', 400, { code: 'disabled' });
  }
  if (!server.ipv4) {
    throw new ApiError('این سرور آدرس IPv4 ندارد و قابل پایش نیست.', 400, { code: 'no_ip' });
  }

  const input = await parseBody(req, schema);
  const existing = await prisma.serverMonitor.findUnique({ where: { serverId: server.id } });

  if (!existing) {
    const count = await prisma.serverMonitor.count({ where: { userId: server.userId, enabled: true } });
    if (count >= settings.monitorMaxPerUser) {
      throw new ApiError(`حداکثر ${settings.monitorMaxPerUser} سرور را می‌توانید هم‌زمان پایش کنید.`, 400);
    }
  }

  const suggestion = suggestedPort(server.appTemplate);
  const data = {
    enabled: input.enabled ?? true,
    checkType: input.checkType ?? existing?.checkType ?? suggestion.checkType,
    port: input.port ?? existing?.port ?? suggestion.port,
    httpPath: input.httpPath || existing?.httpPath || '/',
    expectStatus: input.expectStatus ?? existing?.expectStatus ?? 0,
    intervalMinutes: input.intervalMinutes ?? existing?.intervalMinutes ?? settings.monitorDefaultInterval,
    failThreshold: input.failThreshold ?? existing?.failThreshold ?? 2,
    timeoutSeconds: input.timeoutSeconds ?? existing?.timeoutSeconds ?? 8,
  };

  const monitor = existing
    ? await prisma.serverMonitor.update({
        where: { id: existing.id },
        data: {
          ...data,
          // با تغییر تنظیمات، شمارش خطاها از نو شروع می‌شود
          consecutiveFails: 0,
          status: data.enabled ? 'UNKNOWN' : 'PAUSED',
        },
      })
    : await prisma.serverMonitor.create({
        data: { ...data, serverId: server.id, userId: server.userId },
      });

  // یک بررسی فوری تا کاربر بلافاصله نتیجه را ببیند
  let firstCheck = null;
  try {
    firstCheck = await runCheck(monitor, server.ipv4);
    await prisma.serverMonitor.update({
      where: { id: monitor.id },
      data: {
        status: firstCheck.up ? 'UP' : 'UNKNOWN',
        lastCheckAt: new Date(),
        lastLatencyMs: firstCheck.latencyMs,
        lastError: firstCheck.error,
      },
    });
  } catch {
    // بررسی فوری اجباری نیست
  }

  return ok({
    monitor: { ...monitor, status: firstCheck?.up ? 'UP' : monitor.status },
    firstCheck,
    message: data.enabled
      ? firstCheck?.up
        ? 'پایش فعال شد و سرور در دسترس است.'
        : 'پایش فعال شد. اولین بررسی موفق نبود؛ اگر ادامه پیدا کند به شما اطلاع می‌دهیم.'
      : 'پایش متوقف شد.',
  });
});

export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireUser();
  const { id } = await ctx.params;
  const server = await getOwnedServer(id, user, { allowDeleted: true });

  await prisma.serverMonitor.deleteMany({ where: { serverId: server.id } });

  return ok({ deleted: true, message: 'پایش این سرور حذف شد.' });
});
