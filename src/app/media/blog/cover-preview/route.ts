import { coverImage, notFoundImage, requireStaffImage } from '@/lib/images/serve';
import { formatFromExt } from '@/lib/images/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * پیش‌نمایش کاور در ویرایشگر — پیش از ذخیره مقاله.
 * فقط برای مدیر؛ وگرنه هر کسی می‌توانست با دامنه سایت تصویر با متن دلخواه بسازد.
 */
export async function GET(req: Request) {
  if (!(await requireStaffImage())) return notFoundImage();
  const url = new URL(req.url);
  const title = (url.searchParams.get('title') ?? '').slice(0, 200).trim();
  if (!title) return notFoundImage();

  return coverImage(req, {
    seed: (url.searchParams.get('seed') ?? title).slice(0, 80),
    title,
    category: url.searchParams.get('category')?.slice(0, 80) || null,
    hints: [url.searchParams.get('hint')?.slice(0, 200)],
    format: formatFromExt(`x.${url.searchParams.get('f') ?? 'webp'}`) ?? 'webp',
  });
}
