import { z } from 'zod';
import { ok, parseBody, route } from '@/lib/api';
import { requireAdmin, clientIp, assertSameOrigin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { applyAutoImages } from '@/lib/images/apply';
import { clearImageCache } from '@/lib/images/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const schema = z.object({
  covers: z.boolean().default(true),
  figures: z.boolean().default(true),
  reshuffle: z.boolean().optional(),
  postIds: z.array(z.string().trim().min(1).max(40)).max(500).optional(),
  dryRun: z.boolean().optional(),
});

/**
 * ساخت گروهی تصویرها برای مقاله‌های موجود: کاور برای مقاله‌های بی‌تصویر و
 * یک نمودار از ساختار مقاله برای مقاله‌های بی‌نمودار. کاور دستی دست نمی‌خورد.
 */
export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const input = await parseBody(req, schema);

  const result = await applyAutoImages(input);
  if (!input.dryRun) clearImageCache();

  if (!input.dryRun && (result.covers || result.figures)) {
    await audit({
      userId: admin.id,
      actorType: 'admin',
      action: 'admin.blog_images_auto',
      entity: 'blog_post',
      ip: await clientIp(),
      meta: { covers: result.covers, figures: result.figures, scanned: result.scanned, reshuffle: Boolean(input.reshuffle) },
    });
  }

  const fa = (n: number) => new Intl.NumberFormat('fa-IR').format(n);
  const message =
    result.covers || result.figures
      ? `${fa(result.covers)} کاور و ${fa(result.figures)} نمودار ${input.dryRun ? 'ساخته خواهد شد' : 'ساخته شد'}.`
      : 'همه مقاله‌ها تصویر دارند؛ چیزی برای ساختن نبود.';

  return ok({ result, message });
});
