import prisma from './prisma';
import type { Server } from '@prisma/client';
import { env } from './env';
import { getSettings } from './settings';
import { notify, notifyStaff } from './notify';
import { audit } from './audit';
import { changeServerIp } from './ip-change';
import { isPrefixBlocked, recordPrefixResult } from './ip-prefix';

/**
 * بررسی اینکه آدرس یک سرور از داخل ایران باز می‌شود یا نه.
 *
 * مسئله: هتزنر هنگام ساخت سرور یک IPv4 تصادفی می‌دهد و بخشی از رنج‌هایش از قبل
 * در ایران مسدود است. مشتری پول می‌دهد و سروری تحویل می‌گیرد که به آن دسترسی
 * ندارد. تنها راه قابل اعتماد برای فهمیدن این موضوع، وصل شدن از داخل ایران است.
 *
 * چون پنل روی سرور خارج اجرا می‌شود، این کار را به یک سرویس کوچک می‌سپاریم که
 * روی سرور ایرانی خودمان اجرا شده است (فایل scripts/iran-probe-agent.mjs).
 *
 * برای اینکه «مسدود بودن» با «هنوز بوت نشده» اشتباه نشود، همزمان چند آدرس مرجع
 * از سرورهای سالم خودمان هم آزمایش می‌شود:
 *
 *   • مقصد جواب داد                       → آدرس سالم است
 *   • مقصد جواب نداد ولی مرجع‌ها دادند      → آدرس مسدود است
 *   • نه مقصد نه مرجع‌ها                    → نتیجه نامشخص، بعداً دوباره
 *   • خودِ سرویس آزمایش اینترنت نداشت      → نتیجه نامشخص
 */

export type ProbeVerdict = 'OK' | 'BLOCKED' | 'INCONCLUSIVE' | 'SKIPPED';

export type ProbeOutcome = {
  verdict: ProbeVerdict;
  latencyMs: number | null;
  error: string | null;
  controlsTried: number;
  controlsOk: number;
};

type AgentTarget = { ip: string; port: number };

type AgentResponse = {
  ok: boolean;
  online: boolean;
  results: { ip: string; port: number; reachable: boolean; latencyMs: number | null; error: string | null }[];
  controls: { ip: string; port: number; reachable: boolean }[];
  checkedAt: string;
};

export function probeConfigured(): boolean {
  return env.iranProbe.enabled;
}

/** فراخوانی سرویس آزمایش روی سرور ایرانی */
async function callAgent(body: {
  targets: AgentTarget[];
  controls: AgentTarget[];
  timeoutMs: number;
  tries: number;
}): Promise<AgentResponse | null> {
  if (!env.iranProbe.enabled) return null;

  const base = env.iranProbe.url.replace(/\/$/, '');
  // مهلت کل درخواست: زمان لازم برای همه مقصدها به علاوه سربار شبکه
  const budget = body.timeoutMs * body.tries * (body.targets.length + body.controls.length) + 10_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(budget, 120_000));

  try {
    const res = await fetch(`${base}/probe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.iranProbe.secret}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[ip-probe] سرویس آزمایش پاسخ ${res.status} داد.`);
      return null;
    }
    return (await res.json()) as AgentResponse;
  } catch (err) {
    console.warn('[ip-probe] ارتباط با سرویس آزمایش برقرار نشد:', err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** بررسی سلامت خود سرویس آزمایش — برای نمایش در پنل مدیریت */
export async function probeAgentHealth(): Promise<{ ok: boolean; message: string }> {
  if (!env.iranProbe.enabled) {
    return {
      ok: false,
      message: 'آدرس یا کلید سرویس آزمایش در فایل .env تنظیم نشده است.',
    };
  }
  try {
    const base = env.iranProbe.url.replace(/\/$/, '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${base}/health`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, message: `سرویس آزمایش پاسخ ${res.status} داد.` };
    return { ok: true, message: 'سرویس آزمایش روی سرور ایران در دسترس است.' };
  } catch {
    return { ok: false, message: 'سرویس آزمایش پاسخ نداد. اجرا و فایروال سرور ایرانی را بررسی کنید.' };
  }
}

/**
 * چند آدرس مرجع از سرورهای سالم خودمان.
 * هم‌لوکیشن بودن ارجح است، ولی اگر نبود از هر لوکیشنی می‌گیریم؛ همین‌قدر هم
 * ثابت می‌کند سرویس آزمایش به شبکه هتزنر دسترسی دارد.
 */
async function controlTargets(locationName: string | null, port: number, excludeId: string): Promise<AgentTarget[]> {
  const base = {
    status: 'RUNNING' as const,
    deletedAt: null,
    ipReachState: 'OK' as const,
    ipv4: { not: null },
    id: { not: excludeId },
  };

  const sameLocation = locationName
    ? await prisma.server.findMany({
        where: { ...base, locationName },
        orderBy: { ipCheckedAt: 'desc' },
        take: 2,
        select: { ipv4: true },
      })
    : [];

  const rest =
    sameLocation.length >= 2
      ? []
      : await prisma.server.findMany({
          where: { ...base, ...(locationName ? { locationName: { not: locationName } } : {}) },
          orderBy: { ipCheckedAt: 'desc' },
          take: 2 - sameLocation.length,
          select: { ipv4: true },
        });

  return [...sameLocation, ...rest]
    .map((s) => s.ipv4)
    .filter((ip): ip is string => Boolean(ip))
    .map((ip) => ({ ip, port }));
}

/** یک دور بررسی کامل روی یک آدرس */
export async function probeIp(
  ip: string,
  options: { locationName?: string | null; excludeServerId?: string; port?: number } = {},
): Promise<ProbeOutcome> {
  const settings = await getSettings();

  if (!settings.ipProbeEnabled || !env.iranProbe.enabled) {
    return { verdict: 'SKIPPED', latencyMs: null, error: null, controlsTried: 0, controlsOk: 0 };
  }

  const port = options.port ?? settings.ipProbePort;
  const controls = await controlTargets(options.locationName ?? null, port, options.excludeServerId ?? '');

  const response = await callAgent({
    targets: [{ ip, port }],
    controls,
    timeoutMs: settings.ipProbeTimeoutMs,
    tries: settings.ipProbeTries,
  });

  if (!response || !response.ok) {
    return {
      verdict: 'INCONCLUSIVE',
      latencyMs: null,
      error: 'سرویس آزمایش در دسترس نبود.',
      controlsTried: controls.length,
      controlsOk: 0,
    };
  }

  const target = response.results[0];
  const controlsOk = response.controls.filter((c) => c.reachable).length;

  if (target?.reachable) {
    return { verdict: 'OK', latencyMs: target.latencyMs, error: null, controlsTried: controls.length, controlsOk };
  }

  if (!response.online) {
    return {
      verdict: 'INCONCLUSIVE',
      latencyMs: null,
      error: 'سرور آزمایش در ایران به اینترنت دسترسی نداشت.',
      controlsTried: controls.length,
      controlsOk,
    };
  }

  // بدون مرجع سالم نمی‌شود بین «مسدود» و «هنوز بالا نیامده» فرق گذاشت
  if (controls.length === 0 || controlsOk === 0) {
    return {
      verdict: 'INCONCLUSIVE',
      latencyMs: null,
      error:
        controls.length === 0
          ? 'هنوز سرور سالمی برای مقایسه وجود ندارد.'
          : 'آدرس‌های مرجع هم پاسخ ندادند؛ احتمالاً مشکل از مسیر شبکه است.',
      controlsTried: controls.length,
      controlsOk,
    };
  }

  return {
    verdict: 'BLOCKED',
    latencyMs: null,
    error: target?.error ?? 'پاسخی دریافت نشد',
    controlsTried: controls.length,
    controlsOk,
  };
}

// ───────────────  بررسی و تعویض خودکار  ───────────────

type ServerRow = Pick<
  Server,
  | 'id'
  | 'name'
  | 'userId'
  | 'ipv4'
  | 'locationName'
  | 'datacenterName'
  | 'status'
  | 'provisionedAt'
  | 'ipReachState'
  | 'ipCheckRounds'
  | 'ipAutoSwaps'
  | 'appTemplate'
>;

/**
 * یک سرور را بررسی می‌کند و در صورت لزوم آدرسش را رایگان عوض می‌کند.
 * خروجی برای گزارش کار پس‌زمینه است.
 */
export async function verifyServer(row: ServerRow): Promise<{ verdict: ProbeVerdict; swapped: boolean }> {
  const settings = await getSettings();
  if (!row.ipv4) return { verdict: 'SKIPPED', swapped: false };

  // اگر بلوک آدرس از قبل سوخته شناخته شده، آزمایش لازم نیست
  const knownBad = await isPrefixBlocked(row.ipv4);
  const outcome: ProbeOutcome = knownBad
    ? {
        verdict: 'BLOCKED',
        latencyMs: null,
        error: 'این رنج آدرس پیش‌تر برای ایران مسدود شناخته شده بود.',
        controlsTried: 0,
        controlsOk: 0,
      }
    : await probeIp(row.ipv4, { locationName: row.locationName, excludeServerId: row.id });

  if (outcome.verdict === 'SKIPPED') {
    await prisma.server.update({
      where: { id: row.id },
      data: { ipReachState: 'SKIPPED', ipCheckedAt: new Date() },
    });
    return { verdict: 'SKIPPED', swapped: false };
  }

  if (outcome.verdict === 'INCONCLUSIVE') {
    // نتیجه نامشخص نه ثبت می‌شود نه شمرده؛ دور بعد دوباره امتحان می‌کنیم
    await prisma.server.update({
      where: { id: row.id },
      data: { ipReachState: 'INCONCLUSIVE', ipCheckedAt: new Date() },
    });
    return { verdict: 'INCONCLUSIVE', swapped: false };
  }

  if (outcome.verdict === 'OK') {
    await recordPrefixResult({
      ip: row.ipv4,
      ok: true,
      locationName: row.locationName,
      datacenter: row.datacenterName,
    });
    await prisma.server.update({
      where: { id: row.id },
      data: { ipReachState: 'OK', ipCheckedAt: new Date(), ipCheckRounds: 0 },
    });
    return { verdict: 'OK', swapped: false };
  }

  // ── مسدود ──
  if (!knownBad) {
    await recordPrefixResult({
      ip: row.ipv4,
      ok: false,
      locationName: row.locationName,
      datacenter: row.datacenterName,
    });
  }

  const rounds = row.ipCheckRounds + 1;
  const decided = knownBad || rounds >= settings.ipProbeRoundsToFail;

  await prisma.server.update({
    where: { id: row.id },
    data: {
      ipReachState: decided ? 'BLOCKED' : 'UNKNOWN',
      ipCheckedAt: new Date(),
      ipCheckRounds: rounds,
    },
  });

  if (!decided) return { verdict: 'BLOCKED', swapped: false };

  // ── تعویض خودکار ──
  const canSwap = settings.ipAutoSwapEnabled && row.ipAutoSwaps < settings.ipAutoSwapMax;
  if (!canSwap) {
    await notify(row.userId, {
      kind: 'server',
      type: 'warning',
      title: `آدرس سرور ${row.name} از ایران باز نمی‌شود`,
      body:
        settings.ipAutoSwapEnabled
          ? 'پنل چند بار آدرس را عوض کرد ولی همچنان مسدود است. لطفاً از بخش «تعویض آی‌پی» سرور اقدام کنید یا با پشتیبانی تماس بگیرید.'
          : 'می‌توانید از تب «تعویض آی‌پی» در صفحه سرور، آدرس تازه‌ای بگیرید.',
      link: `/dashboard/servers/${row.id}`,
      email: true,
      urgent: true,
      wait: true,
    });
    await notifyStaff({
      title: `آدرس سرور ${row.name} مسدود است و تعویض خودکار ممکن نشد`,
      body: `کاربر ${row.userId} · لوکیشن ${row.locationName} · آدرس ${row.ipv4}`,
      type: 'warning',
    }).catch(() => null);
    return { verdict: 'BLOCKED', swapped: false };
  }

  const full = await prisma.server.findUnique({ where: { id: row.id } });
  if (!full) return { verdict: 'BLOCKED', swapped: false };

  const oldIp = full.ipv4;

  try {
    const result = await changeServerIp({
      server: full,
      userId: full.userId,
      automatic: true,
      reason: knownBad
        ? 'تعویض خودکار: رنج آدرس در ایران مسدود شناخته شده بود'
        : 'تعویض خودکار: آدرس از داخل ایران باز نمی‌شد',
    });

    await prisma.server.update({
      where: { id: row.id },
      data: {
        ipAutoSwaps: { increment: 1 },
        ipReachState: 'UNKNOWN',
        ipCheckRounds: 0,
        ipCheckedAt: null,
      },
    });

    await audit({
      userId: full.userId,
      actorType: 'system',
      action: 'server.ip_auto_swap',
      entity: 'server',
      entityId: full.id,
      meta: { oldIp, newIp: result.newIp, reason: knownBad ? 'prefix_blocked' : 'probe_failed' },
    });

    await notify(full.userId, {
      kind: 'server',
      type: 'info',
      title: `آدرس سرور ${full.name} پیش از تحویل عوض شد`,
      body: [
        'آدرس اولی که هتزنر به این سرور داده بود از داخل ایران باز نمی‌شد.',
        `پنل خودش و بدون هیچ هزینه‌ای آدرس تازه گرفت: ${result.newIp}`,
        'آدرس تازه هم بررسی می‌شود و اگر مشکلی داشت دوباره عوض خواهد شد.',
      ].join('\n'),
      link: `/dashboard/servers/${full.id}`,
      email: true,
      wait: true,
    });

    return { verdict: 'BLOCKED', swapped: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'خطای نامشخص';
    console.error(`[ip-probe] تعویض خودکار آدرس سرور ${row.name} ناموفق بود:`, message);
    await notifyStaff({
      title: `تعویض خودکار آدرس سرور ${row.name} ناموفق بود`,
      body: `${message}\nآدرس فعلی: ${oldIp}`,
      type: 'error',
    }).catch(() => null);
    return { verdict: 'BLOCKED', swapped: false };
  }
}

export type VerificationReport = {
  checked: number;
  ok: number;
  blocked: number;
  inconclusive: number;
  swapped: number;
  skipped: boolean;
};

/**
 * کار پس‌زمینه: سرورهای تازه‌ای که هنوز آدرسشان بررسی نشده را پیدا و بررسی می‌کند.
 *
 * فقط سرورهای چند ساعت اخیر بررسی می‌شوند؛ هدف این است که مشتری سرور سالم
 * تحویل بگیرد، نه اینکه برای همیشه همه سرورها را بپاییم. پایش دائمی کار
 * ماژول monitoring است.
 */
export async function runIpVerification(): Promise<VerificationReport> {
  const settings = await getSettings();
  const empty: VerificationReport = {
    checked: 0,
    ok: 0,
    blocked: 0,
    inconclusive: 0,
    swapped: 0,
    skipped: true,
  };

  if (!settings.ipProbeEnabled || !env.iranProbe.enabled) return empty;

  // به سیستم‌عامل فرصت بوت شدن می‌دهیم، وگرنه سرور سالم هم جواب نمی‌دهد
  const readyBefore = new Date(Date.now() - 90_000);
  const windowStart = new Date(Date.now() - 6 * 3600_000);

  const candidates = await prisma.server.findMany({
    where: {
      status: 'RUNNING',
      deletedAt: null,
      ipv4: { not: null },
      ipReachState: { in: ['UNKNOWN', 'INCONCLUSIVE'] },
      OR: [
        // سرورهای تازه ساخته‌شده
        { provisionedAt: { not: null, lte: readyBefore, gte: windowStart } },
        // سرورهایی که به‌تازگی آدرسشان عوض شده — آدرس تازه هم باید بررسی شود
        {
          ipChanges: {
            some: { status: 'SUCCESS', finishedAt: { gte: windowStart, lte: readyBefore } },
          },
        },
      ],
    },
    orderBy: { updatedAt: 'asc' },
    take: 20,
    select: {
      id: true,
      name: true,
      userId: true,
      ipv4: true,
      locationName: true,
      datacenterName: true,
      status: true,
      provisionedAt: true,
      ipReachState: true,
      ipCheckRounds: true,
      ipAutoSwaps: true,
      appTemplate: true,
    },
  });

  const report: VerificationReport = { ...empty, skipped: false };

  for (const row of candidates) {
    try {
      const { verdict, swapped } = await verifyServer(row);
      report.checked++;
      if (verdict === 'OK') report.ok++;
      else if (verdict === 'BLOCKED') report.blocked++;
      else if (verdict === 'INCONCLUSIVE') report.inconclusive++;
      if (swapped) report.swapped++;
    } catch (err) {
      console.error(`[ip-probe] بررسی سرور ${row.name} با خطا مواجه شد:`, err);
    }
  }

  return report;
}
