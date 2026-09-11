import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, parseBody, route } from '@/lib/api';
import { requireAdmin, requireStaff, clientIp, assertSameOrigin } from '@/lib/auth';
import { blockedPrefixes, locationReachability, prefixOverview, prefixOf } from '@/lib/ip-prefix';
import { probeAgentHealth, probeIp, runIpVerification } from '@/lib/ip-reachability';
import { enforceRateLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** وضعیت سرویس آزمایش، آمار رنج‌ها و نرخ موفقیت هر لوکیشن */
export const GET = route(async () => {
  await requireStaff();

  const [agent, overview, byLocation, blocked, servers] = await Promise.all([
    probeAgentHealth(),
    prefixOverview(),
    locationReachability(),
    blockedPrefixes(100),
    prisma.server.groupBy({
      by: ['ipReachState'],
      where: { deletedAt: null, status: { notIn: ['DELETED'] } },
      _count: true,
    }),
  ]);

  const autoSwaps = await prisma.serverIpChange.count({
    where: { automatic: true, status: 'SUCCESS' },
  });
  const autoSwapsThisMonth = await prisma.serverIpChange.count({
    where: {
      automatic: true,
      status: 'SUCCESS',
      startedAt: { gte: new Date(Date.now() - 30 * 24 * 3600_000) },
    },
  });

  return ok({
    agent,
    overview,
    byLocation,
    blocked,
    servers: Object.fromEntries(servers.map((s) => [s.ipReachState, s._count])),
    autoSwaps: { total: autoSwaps, last30Days: autoSwapsThisMonth },
  });
});

const testSchema = z.object({
  ip: z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,3}){3}$/, 'آدرس IPv4 معتبر وارد کنید.'),
  port: z.coerce.number().int().min(1).max(65535).optional(),
});

/** آزمایش دستی یک آدرس از داخل ایران */
export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  await enforceRateLimit(`ip-probe:${admin.id}`, 60, 600, { persistent: true });

  const input = await parseBody(req, testSchema);
  const outcome = await probeIp(input.ip, { port: input.port });

  const label =
    outcome.verdict === 'OK'
      ? 'این آدرس از داخل ایران باز می‌شود.'
      : outcome.verdict === 'BLOCKED'
        ? 'این آدرس از داخل ایران باز نمی‌شود.'
        : outcome.verdict === 'SKIPPED'
          ? 'بررسی غیرفعال است یا سرویس آزمایش تنظیم نشده.'
          : `نتیجه قطعی نشد: ${outcome.error ?? 'نامشخص'}`;

  return ok({ ...outcome, prefix: prefixOf(input.ip), message: label });
});

const patchSchema = z.object({
  prefix: z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,3}){2}$/, 'بلوک آدرس را به شکل «۹۵.۲۱۶.۱۸۱» وارد کنید.'),
  blocked: z.boolean().optional(),
  pinned: z.boolean().optional(),
  note: z.string().trim().max(200).optional(),
});

/** تعیین دستی وضعیت یک بلوک آدرس */
export const PATCH = route(async (req: Request) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const input = await parseBody(req, patchSchema);

  const row = await prisma.ipPrefixHealth.upsert({
    where: { prefix: input.prefix },
    create: {
      prefix: input.prefix,
      blocked: input.blocked ?? true,
      pinned: input.pinned ?? true,
      note: input.note || null,
      badCount: input.blocked === false ? 0 : 1,
      lastBadAt: input.blocked === false ? null : new Date(),
    },
    update: {
      ...(input.blocked !== undefined ? { blocked: input.blocked } : {}),
      ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
      ...(input.note !== undefined ? { note: input.note || null } : {}),
    },
  });

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.ip_prefix_update',
    entity: 'ip_prefix',
    entityId: row.prefix,
    ip: await clientIp(),
    meta: { blocked: row.blocked, pinned: row.pinned },
  });

  return ok({
    prefix: row,
    message: row.blocked
      ? `بلوک ${row.prefix} سوخته علامت خورد و دیگر سرور تازه رویش تحویل نمی‌شود.`
      : `بلوک ${row.prefix} دوباره سالم در نظر گرفته شد.`,
  });
});

/** اجرای دستی دور بررسی سرورهای تازه */
export const PUT = route(async () => {
  await assertSameOrigin();
  await requireAdmin();
  const report = await runIpVerification();
  return ok({
    ...report,
    message: report.skipped
      ? 'بررسی غیرفعال است یا سرویس آزمایش تنظیم نشده.'
      : `${report.checked} سرور بررسی شد: ${report.ok} سالم، ${report.blocked} مسدود، ${report.swapped} آدرس عوض شد.`,
  });
});
