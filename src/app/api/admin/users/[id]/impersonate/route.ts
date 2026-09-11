import prisma from '@/lib/prisma';
import { ok, route, ApiError } from '@/lib/api';
import { requireAdmin, createSession, clientIp, clientUserAgent, assertSameOrigin } from '@/lib/auth';
import { audit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/**
 * ورود مدیر به حساب کاربر برای عیب‌یابی.
 * این عمل در دفتر ممیزی ثبت می‌شود و به کاربر اعلان داده نمی‌شود،
 * اما نشست ساخته‌شده مثل نشست عادی قابل ابطال است.
 */
export const POST = route(async (_req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const { id } = await ctx.params;

  if (id === admin.id) throw new ApiError('شما در حساب خودتان هستید.', 400);

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true, deletedAt: true },
  });
  if (!target || target.deletedAt) throw new ApiError('کاربر یافت نشد.', 404);
  if (target.role === 'ADMIN') throw new ApiError('ورود به حساب مدیر دیگر مجاز نیست.', 403);

  const ip = await clientIp();
  const userAgent = await clientUserAgent();

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.impersonate',
    entity: 'user',
    entityId: id,
    ip,
    userAgent,
    meta: { targetEmail: target.email },
  });

  await createSession(target.id, { ip, userAgent: `[impersonated by ${admin.email}] ${userAgent}`.slice(0, 255) });

  return ok({
    redirect: '/dashboard',
    message: `اکنون به عنوان ${target.email} وارد شده‌اید. برای بازگشت، از حساب خارج شوید و دوباره وارد شوید.`,
  });
});
