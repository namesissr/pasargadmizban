import { coverImage, findPostForImage, notFoundImage, splitFile } from '@/lib/images/serve';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ file: string }> };

/** کاور خودکار مقاله: /media/blog/cover/<slug>.webp|jpg|png */
export async function GET(req: Request, ctx: Ctx) {
  const { file } = await ctx.params;
  const { name, format } = splitFile(file);
  if (!format) return notFoundImage();

  const post = await findPostForImage(name);
  if (!post) return notFoundImage();

  return coverImage(req, {
    // بذر طرح از شناسه مقاله است، نه نشانی؛ با عوض شدن نشانی، طرح عوض نمی‌شود
    seed: post.id,
    title: post.title,
    category: post.category?.name,
    hints: [post.focusKeyword, ...post.tags.map((t) => t.tag.name)],
    format,
  });
}
