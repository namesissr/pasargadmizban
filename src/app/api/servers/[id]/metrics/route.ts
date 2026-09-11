import { z } from 'zod';
import { ok, parseQuery, route } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { clientForServer } from '@/lib/hetzner-accounts';
import { getOwnedServer } from '@/lib/server-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const querySchema = z.object({
  type: z.enum(['cpu', 'disk', 'network']).default('cpu'),
  range: z.enum(['1h', '6h', '24h', '7d', '30d']).default('24h'),
});

const RANGE_MS: Record<string, number> = {
  '1h': 3600_000,
  '6h': 6 * 3600_000,
  '24h': 24 * 3600_000,
  '7d': 7 * 24 * 3600_000,
  '30d': 30 * 24 * 3600_000,
};

const RANGE_STEP: Record<string, number> = {
  '1h': 60,
  '6h': 180,
  '24h': 600,
  '7d': 3600,
  '30d': 14400,
};

/** نمودار مصرف پردازنده، دیسک و شبکه از API هتزنر */
export const GET = route(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const server = await getOwnedServer(id, user, { requireHetzner: true });
  const q = parseQuery(req, querySchema);

  const end = new Date();
  const start = new Date(end.getTime() - RANGE_MS[q.range]);

  const metrics = await (await clientForServer(server)).getMetrics(server.hetznerId!, q.type, start, end, RANGE_STEP[q.range]);

  // تبدیل به آرایه‌ای که Recharts بتواند مستقیم بخواند
  const seriesKeys = Object.keys(metrics.time_series ?? {});
  const byTime = new Map<number, Record<string, number | string>>();

  for (const key of seriesKeys) {
    for (const [ts, value] of metrics.time_series[key].values ?? []) {
      const t = Math.round(ts * 1000);
      const row = byTime.get(t) ?? { t };
      row[key] = Number(value);
      byTime.set(t, row);
    }
  }

  const rows = [...byTime.values()].sort((a, b) => Number(a.t) - Number(b.t));

  return ok({
    type: q.type,
    range: q.range,
    step: metrics.step,
    series: seriesKeys,
    rows,
  });
});
