import { z } from 'zod';
import { ok, parseBody, route } from '@/lib/api';
import { clientIp } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { bumpViews } from '@/lib/blog';

/**
 * شمارش بازدید مقاله. عمداً بدون احراز هویت است و خطا هم برنمی‌گرداند؛
 * شمارنده بازدید ارزش خراب کردن تجربه کاربر را ندارد.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ slug: z.string().trim().min(1).max(200) });

export const POST = route(async (req: Request) => {
  const { slug } = await parseBody(req, schema);

  // سقف معقول برای هر آی‌پی تا شمارنده دستی باد نشود
  const ip = await clientIp();
  const limit = await rateLimit(`blog-view:${ip}`, 60, 600);
  if (!limit.allowed) return ok({ counted: false });

  await bumpViews(slug);
  return ok({ counted: true });
});
