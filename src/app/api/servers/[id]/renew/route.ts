import prisma from '@/lib/prisma';
import { ok, parseBody, route } from '@/lib/api';
import { requireUser, assertSameOrigin } from '@/lib/auth';
import { getOwnedServer } from '@/lib/server-access';
import { renewSchema } from '@/lib/validation';
import { renewServer } from '@/lib/provisioning';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireUser();
  const { id } = await ctx.params;
  const server = await getOwnedServer(id, user, { allowDeleted: false });

  const { months } = await parseBody(req, renewSchema);
  const updated = await renewServer({ serverId: server.id, userId: user.id, months });

  return ok({
    expiresAt: updated.expiresAt,
    months,
    message: `سرور با موفقیت ${months} ماه تمدید شد.`,
  });
});

const autoRenewSchema = z.object({ autoRenew: z.boolean() });

/** فعال/غیرفعال کردن تمدید خودکار */
export const PATCH = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireUser();
  const { id } = await ctx.params;
  const server = await getOwnedServer(id, user);
  const { autoRenew } = await parseBody(req, autoRenewSchema);

  await prisma.server.update({ where: { id: server.id }, data: { autoRenew } });

  return ok({
    autoRenew,
    message: autoRenew
      ? 'تمدید خودکار فعال شد. در سررسید، مبلغ از کیف پول کسر می‌شود.'
      : 'تمدید خودکار غیرفعال شد. در سررسید، سرویس تعلیق خواهد شد.',
  });
});
