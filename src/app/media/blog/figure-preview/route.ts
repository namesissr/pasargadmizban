import { figureImage, notFoundImage, requireStaffImage } from '@/lib/images/serve';
import { decodeFigure } from '@/lib/images/figure-spec';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** پیش‌نمایش نمودار در ویرایشگر، از روی متن هنوز ذخیره‌نشده — فقط برای مدیر */
export async function GET(req: Request) {
  if (!(await requireStaffImage())) return notFoundImage();
  const encoded = new URL(req.url).searchParams.get('d') ?? '';
  if (!encoded || encoded.length > 6000) return notFoundImage();
  const spec = decodeFigure(encoded);
  if (!spec) return notFoundImage();
  return figureImage(req, spec, 'webp', 'preview');
}
