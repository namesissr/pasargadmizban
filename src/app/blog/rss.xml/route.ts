import prisma from '@/lib/prisma';
import { publishedWhere } from '@/lib/blog';
import { siteInfo, absoluteUrl } from '@/lib/seo';
import { renderMarkdown } from '@/lib/markdown';

/**
 * خوراک RSS وبلاگ.
 *
 * هنوز هم یکی از سریع‌ترین راه‌های دیده‌شدن مقاله تازه است: خواننده‌ها و
 * سرویس‌های جمع‌آورنده محتوا، انتشار را همان ساعت اول می‌بینند و لینک
 * طبیعی اولیه از همین راه می‌آید.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function xmlEscape(text: string): string {
  return (text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET() {
  const site = await siteInfo();

  const posts = await prisma.blogPost
    .findMany({
      where: { ...publishedWhere(), noindex: false },
      orderBy: { publishedAt: 'desc' },
      take: 30,
      select: {
        slug: true,
        title: true,
        excerpt: true,
        content: true,
        contentHtml: true,
        publishedAt: true,
        updatedAt: true,
        authorName: true,
        coverImage: true,
        category: { select: { name: true } },
        tags: { select: { tag: { select: { name: true } } } },
      },
    })
    .catch(() => []);

  const feedUrl = absoluteUrl(site.siteUrl, '/blog/rss.xml');
  const blogUrl = absoluteUrl(site.siteUrl, '/blog');
  const lastBuild = posts[0]?.publishedAt ?? new Date();

  const items = posts
    .map((post) => {
      const url = absoluteUrl(site.siteUrl, `/blog/${post.slug}`);
      const html = post.contentHtml || renderMarkdown(post.content).html;
      const categories = [
        ...(post.category ? [post.category.name] : []),
        ...post.tags.map((t) => t.tag.name),
      ]
        .map((name) => `      <category>${xmlEscape(name)}</category>`)
        .join('\n');

      return `    <item>
      <title>${xmlEscape(post.title)}</title>
      <link>${xmlEscape(url)}</link>
      <guid isPermaLink="true">${xmlEscape(url)}</guid>
      <pubDate>${(post.publishedAt ?? post.updatedAt).toUTCString()}</pubDate>
      <description>${xmlEscape(post.excerpt)}</description>
      <content:encoded><![CDATA[${html.replace(/]]>/g, ']]&gt;')}]]></content:encoded>
${post.authorName ? `      <dc:creator>${xmlEscape(post.authorName)}</dc:creator>\n` : ''}${categories}${
        post.coverImage
          ? `\n      <enclosure url="${xmlEscape(absoluteUrl(site.siteUrl, post.coverImage))}" type="image/jpeg" />`
          : ''
      }
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${xmlEscape(site.blogTitle)}</title>
    <link>${xmlEscape(blogUrl)}</link>
    <description>${xmlEscape(site.blogDescription)}</description>
    <language>fa-ir</language>
    <lastBuildDate>${lastBuild.toUTCString()}</lastBuildDate>
    <atom:link href="${xmlEscape(feedUrl)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=600, s-maxage=600, stale-while-revalidate=86400',
    },
  });
}
