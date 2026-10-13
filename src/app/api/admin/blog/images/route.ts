import prisma from '@/lib/prisma';
import { ok, route } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { renderMarkdown } from '@/lib/markdown';
import { siteInfo, ownHosts } from '@/lib/seo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ImageRow = {
  src: string;
  alt: string;
  /** کجا استفاده شده: تصویر شاخص یا داخل متن */
  kind: 'cover' | 'inline';
  postId: string;
  postTitle: string;
  postSlug: string;
  status: string;
  /** میزبان تصویر؛ خالی یعنی مسیر نسبی روی همین سایت */
  host: string;
};

/**
 * فهرست همه تصویرهای وبلاگ، با ایرادهایشان.
 *
 * تصویر بی‌متن جانشین (alt) هم برای کاربر نابینا بی‌فایده است و هم جست‌وجوی
 * تصویر گوگل آن را نمی‌فهمد؛ مقاله بی‌تصویر شاخص هم در کارت اشتراک‌گذاری و
 * نتایج گوگل بی‌عکس دیده می‌شود و کلیک کمتری می‌گیرد.
 */
export const GET = route(async () => {
  await requireStaff();

  const site = await siteInfo();
  const hosts = ownHosts(site);

  const posts = await prisma.blogPost.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      coverImage: true,
      coverAlt: true,
      ogImage: true,
      content: true,
    },
  });

  const images: ImageRow[] = [];
  const missingCover: { id: string; title: string; slug: string; status: string }[] = [];

  const hostOf = (src: string) => {
    try {
      return new URL(src, site.siteUrl || 'https://example.com').host.toLowerCase();
    } catch {
      return '';
    }
  };

  for (const post of posts) {
    if (post.coverImage) {
      images.push({
        src: post.coverImage,
        alt: post.coverAlt ?? '',
        kind: 'cover',
        postId: post.id,
        postTitle: post.title,
        postSlug: post.slug,
        status: post.status,
        host: hostOf(post.coverImage),
      });
    } else {
      missingCover.push({ id: post.id, title: post.title, slug: post.slug, status: post.status });
    }

    const rendered = renderMarkdown(post.content, { ownHosts: hosts });
    for (const img of rendered.images) {
      images.push({
        src: img.src,
        alt: img.alt,
        kind: 'inline',
        postId: post.id,
        postTitle: post.title,
        postSlug: post.slug,
        status: post.status,
        host: hostOf(img.src),
      });
    }
  }

  const ownHostSet = new Set(hosts);
  const external = images.filter((i) => i.host && !ownHostSet.has(i.host));
  const noAlt = images.filter((i) => !i.alt.trim());

  // میزبان‌ها را گروه می‌کنیم تا ببینیم چند تصویر روی سرور دیگری است
  const byHost = new Map<string, number>();
  for (const img of images) {
    const key = img.host || '(نسبی)';
    byHost.set(key, (byHost.get(key) ?? 0) + 1);
  }

  return ok({
    images,
    missingCover,
    stats: {
      total: images.length,
      covers: images.filter((i) => i.kind === 'cover').length,
      inline: images.filter((i) => i.kind === 'inline').length,
      noAlt: noAlt.length,
      external: external.length,
      missingCover: missingCover.length,
      posts: posts.length,
    },
    hosts: [...byHost.entries()]
      .map(([host, count]) => ({ host, count, own: host === '(نسبی)' || ownHostSet.has(host) }))
      .sort((a, b) => b.count - a.count),
  });
});
