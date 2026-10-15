import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { PageHeader } from '@/components/app/shell';
import { requireAdmin } from '@/lib/auth';
import { siteInfo, ownHosts } from '@/lib/seo';
import { parseFaqs } from '@/lib/blog';
import { PostEditor } from '../editor';
import type { AdminPost } from '../types';

export const metadata: Metadata = { title: 'ویرایش مقاله' };
export const dynamic = 'force-dynamic';

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const [site, post] = await Promise.all([
    siteInfo(),
    prisma.blogPost.findUnique({
      where: { id },
      include: { tags: { select: { tag: { select: { name: true } } } } },
    }),
  ]);

  if (!post) notFound();

  // داده‌ها به شکل قابل انتقال به کامپوننت کلاینت تبدیل می‌شوند
  const initial: AdminPost = {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    content: post.content,
    coverImage: post.coverImage,
    coverAlt: post.coverAlt,
    metaTitle: post.metaTitle,
    metaDescription: post.metaDescription,
    focusKeyword: post.focusKeyword,
    keywords: post.keywords,
    canonicalUrl: post.canonicalUrl,
    ogImage: post.ogImage,
    noindex: post.noindex,
    faqs: parseFaqs(post.faqs),
    seoScore: post.seoScore,
    status: post.status,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    featured: post.featured,
    readingMinutes: post.readingMinutes,
    wordCount: post.wordCount,
    views: post.views,
    authorName: post.authorName,
    authorTitle: post.authorTitle,
    authorBio: post.authorBio,
    categoryId: post.categoryId,
    tags: post.tags.map((t) => t.tag.name),
  };

  return (
    <>
      <PageHeader
        title="ویرایش مقاله"
        description={post.title}
        breadcrumb={[
          { href: '/admin', label: 'مدیریت' },
          { href: '/admin/blog', label: 'وبلاگ' },
          { href: `/admin/blog/${post.id}`, label: 'ویرایش' },
        ]}
      />
      <PostEditor post={initial} siteUrl={site.siteUrl} ownHosts={ownHosts(site)} />
    </>
  );
}
