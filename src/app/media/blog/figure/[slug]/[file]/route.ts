import { figureImage, figureOf, findPostForImage, notFoundImage, safeDecode, splitFile } from '@/lib/images/serve';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slug: string; file: string }> };

/** نمودار n‌اُم مقاله: /media/blog/figure/<slug>/<n>.webp */
export async function GET(req: Request, ctx: Ctx) {
  const { slug, file } = await ctx.params;
  const { name, format } = splitFile(file);
  const index = Number(name) - 1;
  if (!format || !Number.isInteger(index) || index < 0 || index > 50) return notFoundImage();

  const post = await findPostForImage(safeDecode(slug));
  if (!post) return notFoundImage();

  const spec = figureOf(post.content, index);
  if (!spec) return notFoundImage();

  return figureImage(req, spec, format, `${post.id}#${index}`);
}
