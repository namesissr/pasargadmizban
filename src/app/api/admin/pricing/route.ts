import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireAdmin, clientIp, assertSameOrigin } from '@/lib/auth';
import { pricingRuleSchema } from '@/lib/validation';
import { invalidatePricingCache, buildCatalogPrices } from '@/lib/pricing';
import { getSettings } from '@/lib/settings';
import { audit } from '@/lib/audit';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  await requireAdmin();
  const [rules, settings, preview] = await Promise.all([
    prisma.pricingRule.findMany({ orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }] }),
    getSettings(),
    buildCatalogPrices(),
  ]);

  return ok({
    rules: rules.map((r) => ({ ...r, markupFixed: Number(r.markupFixed) })),
    settings: {
      eurRate: settings.eurRate,
      markupPercent: settings.markupPercent,
      markupFixed: settings.markupFixed,
      vatPercent: settings.vatPercent,
      roundMonthly: settings.roundMonthly,
      roundHourly: settings.roundHourly,
    },
    eurAuto: {
      enabled: settings.eurAutoEnabled,
      source: settings.eurAutoSource,
      hasApiKey: Boolean(settings.eurAutoApiKey),
      url: settings.eurAutoUrl,
      jsonPath: settings.eurAutoJsonPath,
      unit: settings.eurAutoUnit,
      markupFixed: settings.eurAutoMarkupFixed,
      markupPercent: settings.eurAutoMarkupPercent,
      intervalHours: settings.eurAutoIntervalHours,
      maxChangePercent: settings.eurAutoMaxChangePercent,
      roundTo: settings.eurAutoRoundTo,
    },
    preview: preview.items.slice(0, 60).map(({ serverType, prices }) => ({
      name: serverType.name,
      description: serverType.description,
      cores: serverType.cores,
      memory: serverType.memory,
      disk: serverType.disk,
      prices: Object.fromEntries(
        Object.entries(prices).map(([loc, p]) => [
          loc,
          {
            eurMonthly: p.eurMonthly,
            hourly: Number(p.hourly),
            monthly: Number(p.monthly),
            markupPercent: p.markupPercent,
            available: p.available,
          },
        ]),
      ),
    })),
    locations: preview.locations.map((l) => ({ name: l.name, title: l.faTitle ?? l.description })),
  });
});

export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const input = await parseBody(req, pricingRuleSchema);

  if (input.scope !== 'GLOBAL' && !input.targetKey) {
    throw new ApiError('برای این نوع قانون باید مقصد را مشخص کنید.', 400, {
      fields: { targetKey: 'مقصد را انتخاب کنید.' },
    });
  }

  const existing = await prisma.pricingRule.findFirst({
    where: { scope: input.scope, targetKey: input.targetKey || null },
  });

  const data = {
    scope: input.scope,
    targetKey: input.targetKey || null,
    markupPercent: input.markupPercent,
    markupFixed: BigInt(input.markupFixed ?? 0),
    priority: input.priority,
    active: input.active,
    note: input.note || null,
  };

  const rule = existing
    ? await prisma.pricingRule.update({ where: { id: existing.id }, data })
    : await prisma.pricingRule.create({ data });

  invalidatePricingCache();

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.pricing_update',
    entity: 'pricing_rule',
    entityId: rule.id,
    ip: await clientIp(),
    meta: { ...input, markupFixed: input.markupFixed ?? 0 },
  });

  return ok({
    id: rule.id,
    message: existing ? 'قانون قیمت‌گذاری به‌روزرسانی شد.' : 'قانون قیمت‌گذاری جدید ثبت شد.',
  });
});

const deleteSchema = z.object({ id: z.string().min(1) });

export const DELETE = route(async (req: Request) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { id } = await parseBody(req, deleteSchema);

  await prisma.pricingRule.delete({ where: { id } }).catch(() => {
    throw new ApiError('قانون یافت نشد.', 404);
  });
  invalidatePricingCache();

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.pricing_update',
    entity: 'pricing_rule',
    entityId: id,
    ip: await clientIp(),
    meta: { deleted: true },
  });

  return ok({ deleted: true, message: 'قانون قیمت‌گذاری حذف شد.' });
});
