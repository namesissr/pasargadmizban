import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { CalendarDays, Clock, Eye, RefreshCw, UserRound, ArrowLeft, ChevronLeft } from 'lucide-react';
import {
  getPublishedPost,
  resolveOldSlug,
  relatedPosts,
  popularPosts,
  categoriesWithCounts,
  tagsWithCounts,
  parseFaqs,
} from '@/lib/blog';
import { renderMarkdown } from '@/lib/markdown';
import { coverSize, schemaImages, socialImage } from '@/lib/images/urls';
import {
  siteInfo,
  cloudLinks,
  ownHosts,
  buildMetadata,
  breadcrumbSchema,
  articleSchema,
  faqSchema,
  jsonLdGraph,
  absoluteUrl,
} from '@/lib/seo';
import { faDate, faDateTime } from '@/lib/utils';
import { PostCard } from '@/components/blog/post-card';
import { BlogSidebar } from '@/components/blog/sidebar';
import { TableOfContents } from '@/components/blog/toc';
import { ShareRow } from '@/components/blog/share';
import { JsonLd } from '@/components/blog/json-ld';
import { ViewPing } from '@/components/blog/view-ping';

type Params = Promise<{ slug: string }>;

/** رندر در زمان درخواست؛ بیلد پروژه به دیتابیس دسترسی ندارد */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const [site, post] = await Promise.all([siteInfo(), getPublishedPost(decodeURIComponent(slug))]);
  if (!post) return { title: 'مقاله یافت نشد', robots: { index: false, follow: false } };

  const keywords = [
    post.focusKeyword,
    ...(post.keywords ?? '').split(',').map((k) => k.trim()),
    ...post.tags.map((t) => t.tag.name),
  ].filter((k): k is string => Boolean(k));

  return buildMetadata({
    site,
    title: post.metaTitle || post.title,
    description: post.metaDescription || post.excerpt,
    path: `/blog/${post.slug}`,
    canonical: post.canonicalUrl || null,
    // پیش‌نمایش تلگرام، واتس‌اپ و توییتر: JPEG (WebP را همه نشان نمی‌دهند)
    image: post.ogImage || socialImage(post.coverImage) || undefined,
    imageAlt: post.coverAlt,
    noindex: post.noindex,
    type: 'article',
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt,
    authors: post.authorName ? [post.authorName] : undefined,
    keywords: Array.from(new Set(keywords)).slice(0, 12),
  });
}

export default async function BlogPostPage({ params }: { params: Params }) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);

  const post = await getPublishedPost(slug);

  if (!post) {
    // آدرس قدیمی؟ با ۳۰۱ به آدرس تازه برو تا رتبه و لینک‌های بیرونی نسوزد
    const current = await resolveOldSlug(slug);
    if (current) permanentRedirect(`/blog/${current}`);
    notFound();
  }

  const site = await siteInfo();
  const rendered = renderMarkdown(post.content, { ownHosts: ownHosts(site), slug: post.slug });
  const faqs = parseFaqs(post.faqs);
  const tags = post.tags.map((t) => t.tag);

  const [related, popular, categories, sidebarTags] = await Promise.all([
    relatedPosts({ id: post.id, categoryId: post.categoryId, tags: post.tags }, 3),
    popularPosts(5),
    categoriesWithCounts(),
    tagsWithCounts(24),
  ]);

  const cloud = cloudLinks(site);
  const path = `/blog/${post.slug}`;
  const url = absoluteUrl(site.siteUrl, path);
  const authorName = post.authorName || site.brandName;

  const breadcrumb = [
    { name: 'خانه', path: '/' },
    { name: 'وبلاگ', path: '/blog' },
    ...(post.category ? [{ name: post.category.name, path: `/blog/category/${post.category.slug}` }] : []),
    { name: post.title, path },
  ];

  const jsonLd = jsonLdGraph([
    breadcrumbSchema(site, breadcrumb),
    articleSchema({
      site,
      title: post.metaTitle || post.title,
      description: post.metaDescription || post.excerpt,
      path,
      image: post.ogImage ? [post.ogImage] : schemaImages(post.coverImage),
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
      authorName,
      authorTitle: post.authorTitle,
      section: post.category?.name ?? null,
      tags: tags.map((t) => t.name),
      wordCount: post.wordCount || rendered.wordCount,
      readingMinutes: post.readingMinutes || rendered.readingMinutes,
    }),
    faqSchema(faqs),
  ]);

  const updatedLater =
    post.publishedAt && post.updatedAt.getTime() - post.publishedAt.getTime() > 24 * 3600 * 1000;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <JsonLd json={jsonLd} />
      <ViewPing slug={post.slug} />

      {/* مسیر صفحه — هم برای کاربر، هم برای خزنده */}
      <nav aria-label="مسیر صفحه" className="mb-5 flex flex-wrap items-center gap-1 text-[11px] muted">
        {breadcrumb.map((item, i) => (
          <span key={item.path} className="flex items-center gap-1">
            {i > 0 ? <ChevronLeft size={12} className="opacity-50" /> : null}
            {i === breadcrumb.length - 1 ? (
              <span className="line-clamp-1 font-semibold">{item.name}</span>
            ) : (
              <Link href={item.path} className="hover:underline">
                {item.name}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        {/* min-w-0: بدون آن، خط بلند بلوک کد ستون را در گوشی از عرض صفحه بیرون می‌زند */}
        <article className="min-w-0">
          <header>
            {post.category ? (
              <Link
                href={`/blog/category/${post.category.slug}`}
                className="text-xs font-bold text-[var(--color-brand-600)] hover:underline"
              >
                {post.category.name}
              </Link>
            ) : null}

            <h1 className="mt-2 text-xl font-extrabold leading-[1.7] sm:text-[26px]">{post.title}</h1>

            <p className="mt-3 text-sm leading-8 muted">{post.excerpt}</p>

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b pb-4 text-[11px] muted">
              <span className="flex items-center gap-1.5">
                <UserRound size={13} /> {authorName}
                {post.authorTitle ? <span className="opacity-70">({post.authorTitle})</span> : null}
              </span>
              <span className="flex items-center gap-1.5">
                <CalendarDays size={13} />
                <time dateTime={post.publishedAt?.toISOString()}>{faDate(post.publishedAt)}</time>
              </span>
              {updatedLater ? (
                <span className="flex items-center gap-1.5">
                  <RefreshCw size={13} /> به‌روزرسانی:{' '}
                  <time dateTime={post.updatedAt.toISOString()}>{faDate(post.updatedAt)}</time>
                </span>
              ) : null}
              <span className="flex items-center gap-1.5">
                <Clock size={13} /> {post.readingMinutes || rendered.readingMinutes} دقیقه مطالعه
              </span>
              {post.views > 0 ? (
                <span className="tabular flex items-center gap-1.5">
                  <Eye size={13} /> {new Intl.NumberFormat('fa-IR').format(post.views)} بازدید
                </span>
              ) : null}
            </div>
          </header>

          {post.coverImage ? (
            <figure className="mt-6 overflow-hidden rounded-xl border">
              {/* تصویر شاخص بالای صفحه است، پس lazy نمی‌شود تا LCP سریع بماند */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={post.coverImage}
                alt={post.coverAlt || post.title}
                {...(coverSize(post.coverImage) ?? {})}
                className="h-auto w-full object-cover"
                fetchPriority="high"
                decoding="async"
              />
              {post.coverAlt ? (
                <figcaption className="border-t px-3 py-2 text-[11px] muted">{post.coverAlt}</figcaption>
              ) : null}
            </figure>
          ) : null}

          <TableOfContents items={rendered.toc} />

          <div className="prose" dangerouslySetInnerHTML={{ __html: rendered.html }} />

          {faqs.length > 0 ? (
            <section className="mt-10" aria-labelledby="faq-heading">
              <h2 id="faq-heading" className="text-base font-extrabold">
                پرسش‌های پرتکرار
              </h2>
              <div className="mt-4 space-y-2.5">
                {faqs.map((faq) => (
                  <details key={faq.q} className="card p-4">
                    <summary className="cursor-pointer list-none text-sm font-bold">{faq.q}</summary>
                    <p className="mt-2.5 whitespace-pre-line text-xs leading-7 muted">{faq.a}</p>
                  </details>
                ))}
              </div>
            </section>
          ) : null}

          {tags.length > 0 ? (
            <div className="mt-8 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold muted">برچسب‌ها:</span>
              {tags.map((tag) => (
                <Link
                  key={tag.slug}
                  href={`/blog/tag/${tag.slug}`}
                  className="rounded-full border px-2.5 py-1 text-[11px] transition hover:border-[var(--color-brand-500)]"
                >
                  {tag.name}
                </Link>
              ))}
            </div>
          ) : null}

          <div className="mt-6 border-t pt-5">
            <ShareRow url={url} title={post.title} />
          </div>

          {/* جعبه نویسنده — اعتبار نویسنده یکی از سیگنال‌های کیفیت محتواست */}
          <section className="card mt-6 flex flex-wrap items-start gap-4 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-brand-500)_14%,transparent)] text-[var(--color-brand-600)]">
              <UserRound size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{authorName}</p>
              {post.authorTitle ? <p className="mt-0.5 text-[11px] muted">{post.authorTitle}</p> : null}
              <p className="mt-2 text-xs leading-7 muted">
                {post.authorBio ||
                  `تیم فنی ${site.brandName} — تجربه‌های راه‌اندازی و نگهداری سرور ابری را به زبان ساده می‌نویسیم.`}
              </p>
            </div>
          </section>

          {/* فراخوان — هدف وبلاگ در نهایت فروش سرور است */}
          <section
            className="card mt-6 p-6 text-center"
            style={{ background: 'color-mix(in srgb, var(--color-brand-500) 8%, var(--surface))' }}
          >
            <h2 className="text-base font-extrabold">سرور ساعتی ایران و خارج، در کمتر از یک دقیقه</h2>
            <p className="mx-auto mt-2 max-w-xl text-xs leading-7 muted">
              پرداخت ساعتی به تومان، آی‌پی تست‌شده از ایران و تعویض آدرس با یک کلیک. ثبت‌نام رایگان است و همین حالا
              می‌توانید سرورتان را بسازید.
            </p>
            <a href={cloud.register} rel="noopener" className="btn btn-primary mt-4">
              {site.cloudCtaLabel} <ArrowLeft size={15} />
            </a>
          </section>

          {related.length > 0 ? (
            <section className="mt-10" aria-labelledby="related-heading">
              <h2 id="related-heading" className="text-base font-extrabold">
                مقاله‌های مرتبط
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((item) => (
                  <PostCard key={item.id} post={item} />
                ))}
              </div>
            </section>
          ) : null}

          <p className="mt-8 text-[11px] muted">
            آخرین بازبینی این مقاله: <time dateTime={post.updatedAt.toISOString()}>{faDateTime(post.updatedAt)}</time>
          </p>
        </article>

        <BlogSidebar popular={popular} categories={categories} tags={sidebarTags} site={site} />
      </div>
    </main>
  );
}
