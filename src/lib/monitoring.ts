import net from 'node:net';
import prisma from './prisma';
import type { ServerMonitor } from '@prisma/client';
import { notify } from './notify';
import { getSettings } from './settings';

/**
 * پایش در دسترس بودن سرورهای مشتریان.
 *
 * برخلاف وضعیتی که هتزنر گزارش می‌دهد (که فقط می‌گوید ماشین مجازی روشن است)،
 * این پایش از بیرون به سرویس واقعی مشتری وصل می‌شود؛ پس اگر سیستم‌عامل هنگ کند
 * یا وب‌سرور بالا نیاید، مشتری بلافاصله باخبر می‌شود.
 */

export type CheckResult = { up: boolean; latencyMs: number | null; error: string | null };

/** بررسی باز بودن یک پورت TCP */
export function checkTcp(host: string, port: number, timeoutMs: number): Promise<CheckResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = new net.Socket();
    let settled = false;

    const finish = (result: CheckResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish({ up: true, latencyMs: Date.now() - started, error: null }));
    socket.once('timeout', () => finish({ up: false, latencyMs: null, error: 'پاسخی در مهلت مقرر دریافت نشد' }));
    socket.once('error', (err: NodeJS.ErrnoException) => {
      const reason =
        err.code === 'ECONNREFUSED'
          ? 'اتصال رد شد (سرویس روی این پورت اجرا نیست)'
          : err.code === 'EHOSTUNREACH'
            ? 'میزبان در دسترس نیست'
            : err.code === 'ENETUNREACH'
              ? 'شبکه در دسترس نیست'
              : (err.message ?? 'خطای اتصال');
      finish({ up: false, latencyMs: null, error: reason });
    });

    socket.connect(port, host);
  });
}

/** بررسی پاسخ HTTP یا HTTPS */
export async function checkHttp(
  host: string,
  port: number,
  path: string,
  secure: boolean,
  timeoutMs: number,
  expectStatus = 0,
): Promise<CheckResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const scheme = secure ? 'https' : 'http';
  const portPart = (secure && port === 443) || (!secure && port === 80) ? '' : `:${port}`;

  try {
    const res = await fetch(`${scheme}://${host}${portPart}${path.startsWith('/') ? path : `/${path}`}`, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'manual',
      headers: { 'User-Agent': 'PasargadMizban-Monitor/1.0' },
      cache: 'no-store',
    });
    const latencyMs = Date.now() - started;

    if (expectStatus > 0) {
      return res.status === expectStatus
        ? { up: true, latencyMs, error: null }
        : { up: false, latencyMs, error: `کد وضعیت ${res.status} به جای ${expectStatus}` };
    }
    return res.status < 500
      ? { up: true, latencyMs, error: null }
      : { up: false, latencyMs, error: `کد وضعیت ${res.status}` };
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError';
    return {
      up: false,
      latencyMs: null,
      error: aborted ? 'پاسخی در مهلت مقرر دریافت نشد' : 'اتصال برقرار نشد',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function runCheck(monitor: ServerMonitor, host: string): Promise<CheckResult> {
  const timeoutMs = Math.max(2, Math.min(30, monitor.timeoutSeconds)) * 1000;
  if (monitor.checkType === 'http') {
    return checkHttp(host, monitor.port, monitor.httpPath, false, timeoutMs, monitor.expectStatus);
  }
  if (monitor.checkType === 'https') {
    return checkHttp(host, monitor.port, monitor.httpPath, true, timeoutMs, monitor.expectStatus);
  }
  return checkTcp(host, monitor.port, timeoutMs);
}

/** یک دور پایش تمام سرورهایی که نوبتشان رسیده */
export async function runMonitors(now = new Date()): Promise<{
  checked: number;
  down: number;
  recovered: number;
  errors: string[];
}> {
  const out = { checked: 0, down: 0, recovered: 0, errors: [] as string[] };
  const settings = await getSettings();
  if (!settings.monitoringEnabled) return out;

  const monitors = await prisma.serverMonitor.findMany({
    where: {
      enabled: true,
      server: { status: { in: ['RUNNING'] }, deletedAt: null, ipv4: { not: null } },
    },
    include: { server: { select: { id: true, name: true, ipv4: true, userId: true } } },
    take: 500,
  });

  const due = monitors.filter(
    (m) => !m.lastCheckAt || now.getTime() - m.lastCheckAt.getTime() >= m.intervalMinutes * 60_000,
  );

  // بررسی‌ها موازی انجام می‌شوند ولی به صورت دسته‌ای تا شبکه اشباع نشود
  const BATCH = 25;
  for (let i = 0; i < due.length; i += BATCH) {
    const batch = due.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (monitor) => {
        const host = monitor.server.ipv4;
        if (!host) return;
        try {
          const result = await runCheck(monitor, host);
          out.checked++;
          const change = await applyResult(monitor, result, now);
          if (change === 'down') out.down++;
          if (change === 'up') out.recovered++;
        } catch (err) {
          out.errors.push(`${monitor.server.name}: ${err instanceof Error ? err.message : 'خطای نامشخص'}`);
        }
      }),
    );
  }

  return out;
}

type MonitorWithServer = ServerMonitor & { server: { id: string; name: string; ipv4: string | null; userId: string } };

async function applyResult(
  monitor: MonitorWithServer,
  result: CheckResult,
  now: Date,
): Promise<'up' | 'down' | null> {
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);

  // آمار روزانه برای محاسبه درصد آپ‌تایم
  await prisma.monitorDaily.upsert({
    where: { monitorId_date: { monitorId: monitor.id, date: today } },
    create: {
      monitorId: monitor.id,
      date: today,
      upChecks: result.up ? 1 : 0,
      downChecks: result.up ? 0 : 1,
      avgLatencyMs: result.latencyMs ?? 0,
    },
    update: {
      upChecks: { increment: result.up ? 1 : 0 },
      downChecks: { increment: result.up ? 0 : 1 },
      ...(result.latencyMs ? { avgLatencyMs: Math.round((monitor.lastLatencyMs ?? result.latencyMs) * 0.7 + result.latencyMs * 0.3) } : {}),
    },
  });

  const fails = result.up ? 0 : monitor.consecutiveFails + 1;
  const oks = result.up ? monitor.consecutiveOks + 1 : 0;

  let transition: 'up' | 'down' | null = null;
  let downSince = monitor.downSince;

  // قطعی تایید شد
  if (!result.up && fails >= monitor.failThreshold && monitor.status !== 'DOWN') {
    transition = 'down';
    downSince = now;
    await prisma.monitorIncident.create({
      data: { monitorId: monitor.id, startedAt: now, reason: result.error ?? 'در دسترس نیست' },
    });
  }

  // بازگشت به مدار
  if (result.up && monitor.status === 'DOWN') {
    transition = 'up';
    const incident = await prisma.monitorIncident.findFirst({
      where: { monitorId: monitor.id, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (incident) {
      await prisma.monitorIncident.update({
        where: { id: incident.id },
        data: {
          endedAt: now,
          durationSeconds: Math.round((now.getTime() - incident.startedAt.getTime()) / 1000),
        },
      });
    }
    downSince = null;
  }

  await prisma.serverMonitor.update({
    where: { id: monitor.id },
    data: {
      status: result.up ? 'UP' : fails >= monitor.failThreshold ? 'DOWN' : monitor.status,
      consecutiveFails: fails,
      consecutiveOks: oks,
      lastCheckAt: now,
      lastLatencyMs: result.latencyMs,
      lastError: result.error,
      downSince,
    },
  });

  if (transition === 'down') {
    await notify(monitor.server.userId, {
      kind: 'monitor',
      type: 'error',
      title: `سرور ${monitor.server.name} در دسترس نیست`,
      body: `پایش خودکار نتوانست به ${monitor.server.ipv4} روی پورت ${monitor.port} وصل شود. علت: ${result.error ?? 'نامشخص'}`,
      link: `/dashboard/servers/${monitor.server.id}`,
      email: true,
      urgent: true,
      wait: true,
    });
  }

  if (transition === 'up') {
    const downMs = monitor.downSince ? now.getTime() - monitor.downSince.getTime() : 0;
    await notify(monitor.server.userId, {
      kind: 'monitor',
      type: 'success',
      title: `سرور ${monitor.server.name} دوباره در دسترس است`,
      body: downMs > 0 ? `مدت قطعی: ${humanDuration(downMs)}` : 'اتصال برقرار شد.',
      link: `/dashboard/servers/${monitor.server.id}`,
      urgent: true,
      wait: true,
    });
  }

  return transition;
}

function humanDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${new Intl.NumberFormat('fa-IR').format(minutes)} دقیقه`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const fa = (n: number) => new Intl.NumberFormat('fa-IR').format(n);
  return rest ? `${fa(hours)} ساعت و ${fa(rest)} دقیقه` : `${fa(hours)} ساعت`;
}

/** خلاصه آپ‌تایم برای نمایش در پنل */
export async function uptimeSummary(monitorId: string, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);

  const [rows, incidents] = await Promise.all([
    prisma.monitorDaily.findMany({
      where: { monitorId, date: { gte: since } },
      orderBy: { date: 'asc' },
    }),
    prisma.monitorIncident.findMany({
      where: { monitorId, startedAt: { gte: since } },
      orderBy: { startedAt: 'desc' },
      take: 30,
    }),
  ]);

  const totalUp = rows.reduce((n, r) => n + r.upChecks, 0);
  const totalDown = rows.reduce((n, r) => n + r.downChecks, 0);
  const total = totalUp + totalDown;

  const latencies = rows.filter((r) => r.avgLatencyMs > 0).map((r) => r.avgLatencyMs);
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

  const downtimeSeconds = incidents.reduce((n, i) => n + (i.durationSeconds ?? 0), 0);

  return {
    uptimePercent: total ? Number(((totalUp / total) * 100).toFixed(2)) : null,
    totalChecks: total,
    avgLatencyMs: avgLatency,
    downtimeSeconds,
    incidents: incidents.map((i) => ({
      id: i.id,
      startedAt: i.startedAt,
      endedAt: i.endedAt,
      durationSeconds: i.durationSeconds,
      reason: i.reason,
    })),
    daily: rows.map((r) => {
      const dayTotal = r.upChecks + r.downChecks;
      return {
        date: r.date,
        uptime: dayTotal ? Number(((r.upChecks / dayTotal) * 100).toFixed(2)) : null,
        checks: dayTotal,
        avgLatencyMs: r.avgLatencyMs,
      };
    }),
  };
}

/** پاکسازی داده‌های قدیمی پایش */
export async function purgeOldMonitorData(keepDays = 90): Promise<number> {
  const cutoff = new Date(Date.now() - keepDays * 86_400_000);
  const [daily, incidents] = await Promise.all([
    prisma.monitorDaily.deleteMany({ where: { date: { lt: cutoff } } }),
    prisma.monitorIncident.deleteMany({ where: { startedAt: { lt: cutoff }, endedAt: { not: null } } }),
  ]);
  return daily.count + incidents.count;
}

/** پیشنهاد پورت پیش‌فرض بر اساس قالب نصب‌شده */
export function suggestedPort(appTemplate: string | null | undefined): { checkType: string; port: number } {
  switch (appTemplate) {
    case 'lemp':
    case 'wordpress':
    case 'nginx':
      return { checkType: 'http', port: 80 };
    default:
      return { checkType: 'tcp', port: 22 };
  }
}
