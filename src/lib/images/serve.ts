import prisma from '../prisma';
import { getCurrentUser } from '../auth';
import { siteInfo } from '../seo';
import { publishedWhere } from '../blog';
import { renderSvg, imageResponse, formatFromExt, type ImageFormat } from './engine';
import { buildCoverSvg, COVER_SIZES, TOPIC_FA, type CoverRatio, type Topic } from './cover';
import { buildFigureSvg } from './figures';
import { extractFigures, type FigureSpec } from './figure-spec';

/**
 * منطق مشترک مسیرهای /media/blog/*.
 *
 * تصویر مقاله منتشرنشده فقط به مدیر نشان داده می‌شود؛ وگرنه عنوان پیش‌نویس‌ها
 * با حدس زدن نشانی لو می‌رفت.
 */

export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function splitFile(file: string): { name: string; format: ImageFormat | null } {
  const decoded = safeDecode(file);
  const dot = decoded.lastIndexOf('.');
  if (dot <= 0) return { name: decoded, format: null };
  return { name: decoded.slice(0, dot), format: formatFromExt(decoded) };
}

async function isStaff(): Promise<boolean> {
  const user = await getCurrentUser().catch(() => null);
  return Boolean(user && (user.role === 'ADMIN' || user.role === 'SUPPORT'));
}

export async function requireStaffImage(): Promise<boolean> {
  return isStaff();
}

/** مقاله با نشانی فعلی یا قدیمی؛ پیش‌نویس فقط برای مدیر */
export async function findPostForImage(slug: string) {
  const select = {
    id: true,
    slug: true,
    title: true,
    content: true,
    focusKeyword: true,
    status: true,
    publishedAt: true,
    category: { select: { name: true } },
    tags: { select: { tag: { select: { name: true } } } },
  } as const;

  let post = await prisma.blogPost.findUnique({ where: { slug }, select });
  if (!post) {
    const old = await prisma.blogSlugHistory.findUnique({ where: { slug }, select: { postId: true } });
    if (old) post = await prisma.blogPost.findUnique({ where: { id: old.postId }, select });
  }
  if (!post) return null;

  const published = await prisma.blogPost.count({ where: { id: post.id, ...publishedWhere() } });
  if (!published && !(await isStaff())) return null;
  return post;
}

export async function brandForImages() {
  const site = await siteInfo();
  let domain = '';
  try {
    domain = new URL(site.siteUrl).host;
  } catch {
    domain = '';
  }
  return { color: site.brandColor, name: site.brandName, domain };
}

export function parseRatio(value: string | null): CoverRatio {
  return value && value in COVER_SIZES ? (value as CoverRatio) : 'og';
}

export function parseTopic(value: string | null): Topic | undefined {
  return value && value in TOPIC_FA ? (value as Topic) : undefined;
}

export async function coverImage(
  req: Request,
  input: {
    seed: string;
    title: string;
    category?: string | null;
    hints?: (string | null | undefined)[];
    format: ImageFormat;
  },
): Promise<Response> {
  const url = new URL(req.url);
  const ratio = parseRatio(url.searchParams.get('r'));
  const variant = Math.max(0, Math.min(99, Number(url.searchParams.get('n')) || 0));
  const topic = parseTopic(url.searchParams.get('t'));
  const brand = await brandForImages();

  const key = ['cover', input.seed, input.title, input.category ?? '', ratio, variant, topic ?? '', brand.color, brand.name, brand.domain].join('|');
  const image = await renderSvg(
    key,
    (measure) =>
      buildCoverSvg(
        { title: input.title, category: input.category, hints: input.hints, seed: input.seed, variant, ratio, topic, brand },
        measure,
      ),
    input.format,
  );
  return imageResponse(req, image);
}

export async function figureImage(req: Request, spec: FigureSpec, format: ImageFormat, cacheTag: string): Promise<Response> {
  const brand = await brandForImages();
  const key = ['figure', cacheTag, JSON.stringify(spec), brand.color, brand.domain].join('|');
  const image = await renderSvg(key, (measure) => buildFigureSvg(spec, brand, measure), format);
  return imageResponse(req, image);
}

export function figureOf(markdown: string, index: number): FigureSpec | null {
  return extractFigures(markdown)[index] ?? null;
}

export const notFoundImage = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
