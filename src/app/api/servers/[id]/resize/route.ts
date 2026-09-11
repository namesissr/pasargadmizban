import prisma from '@/lib/prisma';
import { ok, parseBody, route, ApiError } from '@/lib/api';
import { requireUser, clientIp, assertSameOrigin } from '@/lib/auth';
import { clientForServer } from '@/lib/hetzner-accounts';
import { getOwnedServer, assertOperable } from '@/lib/server-access';
import { resizeSchema } from '@/lib/validation';
import { priceFor, backupPrice } from '@/lib/pricing';
import { isAvailable } from '@/lib/catalog';
import { debit, canAfford } from '@/lib/wallet';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** پیش‌نمایش پلن‌های قابل ارتقا و تفاوت قیمت */
export const GET = route(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const server = await getOwnedServer(id, user);

  const current = await prisma.hetznerServerType.findUnique({ where: { name: server.serverTypeName } });
  const all = await prisma.hetznerServerType.findMany({
    where: { enabled: true, architecture: current?.architecture },
    orderBy: [{ sortOrder: 'asc' }],
  });

  const options: unknown[] = [];
  for (const st of all) {
    if (st.name === server.serverTypeName) continue;
    // هتزنر اجازه کاهش اندازه دیسک را نمی‌دهد
    if (current && st.disk < current.disk) continue;
    if (!(await isAvailable(st.name, server.locationName))) continue;

    try {
      const price = await priceFor(st.name, server.locationName, user.id, user.discountPct);
      options.push({
        name: st.name,
        description: st.description,
        cores: st.cores,
        memory: st.memory,
        disk: st.disk,
        cpuType: st.cpuType,
        hourly: Number(price.hourly),
        monthly: Number(price.monthly),
        deltaMonthly: Number(price.monthly - server.priceMonthly),
        deltaHourly: Number(price.hourly - server.priceHourly),
        isUpgrade: current ? st.cores >= current.cores && st.memory >= current.memory : true,
      });
    } catch {
      // این پلن در این لوکیشن قیمت ندارد
    }
  }

  return ok({
    current: {
      name: server.serverTypeName,
      cores: server.cores,
      memory: server.memory,
      disk: server.disk,
      hourly: Number(server.priceHourly),
      monthly: Number(server.priceMonthly),
    },
    options,
    note: 'برای تغییر پلن، سرور باید خاموش باشد. افزایش اندازه دیسک برگشت‌ناپذیر است.',
  });
});

export const POST = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireUser();
  const { id } = await ctx.params;
  const server = await getOwnedServer(id, user, { requireHetzner: true });
  assertOperable(server);

  if (server.status !== 'OFF') {
    throw new ApiError('برای تغییر پلن ابتدا سرور را خاموش کنید.', 409, { code: 'server_not_stopped' });
  }

  const input = await parseBody(req, resizeSchema);

  if (input.serverType === server.serverTypeName) {
    throw new ApiError('سرور در حال حاضر روی همین پلن است.', 400);
  }

  const newType = await prisma.hetznerServerType.findUnique({ where: { name: input.serverType } });
  if (!newType || !newType.enabled) throw new ApiError('پلن انتخابی در دسترس نیست.', 400);
  if (!(await isAvailable(newType.name, server.locationName))) {
    throw new ApiError('این پلن در لوکیشن سرور شما موجودی ندارد.', 409);
  }

  const newPrice = await priceFor(newType.name, server.locationName, user.id, user.discountPct);
  const newBackup = backupPrice(newPrice);

  // در دوره ماهانه، مابه‌التفاوت باقی‌مانده دوره را می‌گیریم
  let charged = 0n;
  if (server.billingCycle === 'MONTHLY' && server.expiresAt && server.expiresAt > new Date()) {
    const remainingMs = server.expiresAt.getTime() - Date.now();
    const ratio = Math.min(1, remainingMs / (30 * 24 * 3600_000));
    const delta = newPrice.monthly - server.priceMonthly;
    if (delta > 0n) {
      charged = BigInt(Math.ceil(Number(delta) * ratio));
      if (!(await canAfford(user.id, charged))) {
        throw new ApiError('موجودی کیف پول برای ارتقای پلن کافی نیست.', 402, { code: 'insufficient_funds' });
      }
    }
  } else if (server.billingCycle === 'HOURLY') {
    // در حالت ساعتی فقط بررسی می‌کنیم موجودی برای ادامه کافی باشد
    if (!(await canAfford(user.id, newPrice.hourly * 24n))) {
      throw new ApiError('برای این پلن باید حداقل معادل ۲۴ ساعت اعتبار داشته باشید.', 402, {
        code: 'insufficient_funds',
      });
    }
  }

  const res = await (await clientForServer(server)).changeType(server.hetznerId!, newType.name, input.upgradeDisk);

  if (charged > 0n) {
    await debit({
      userId: user.id,
      amount: charged,
      type: 'CHARGE',
      serverId: server.id,
      description: `مابه‌التفاوت ارتقای سرور ${server.name} به پلن ${newType.name}`,
    });
  }

  await prisma.server.update({
    where: { id: server.id },
    data: {
      serverTypeName: newType.name,
      cores: newType.cores,
      memory: newType.memory,
      disk: input.upgradeDisk ? newType.disk : server.disk,
      includedTraffic: newType.includedTraffic,
      priceHourly: newPrice.hourly,
      priceMonthly: newPrice.monthly,
      backupPriceHourly: newBackup.hourly,
      backupPriceMonthly: newBackup.monthly,
      status: 'MIGRATING',
    },
  });

  await prisma.serverAction.create({
    data: {
      serverId: server.id,
      userId: user.id,
      action: 'change_type',
      hetznerActionId: BigInt((res as { action: { id: number } }).action.id),
      status: 'RUNNING',
      meta: { from: server.serverTypeName, to: newType.name, upgradeDisk: input.upgradeDisk },
    },
  });

  await audit({
    userId: user.id,
    action: 'server.resize',
    entity: 'server',
    entityId: server.id,
    ip: await clientIp(),
    meta: { from: server.serverTypeName, to: newType.name, charged: charged.toString() },
  });

  await notify(user.id, {
    type: 'info',
    title: `ارتقای سرور ${server.name} آغاز شد`,
    body: `پلن جدید: ${newType.description}. پس از پایان عملیات، سرور را روشن کنید.`,
    link: `/dashboard/servers/${server.id}`,
  });

  return ok({
    newType: newType.name,
    charged: Number(charged),
    message: 'تغییر پلن آغاز شد. پس از تکمیل، سرور را روشن کنید.',
  });
});
