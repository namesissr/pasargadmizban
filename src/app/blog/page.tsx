import type { Metadata } from 'next';
import Link from 'next/link';
import { Rss, SearchX } from 'lucide-react';
import {
  listPosts,
  featuredPost,
  popularPosts,
  categoriesWithCounts,
  tagsWithCounts,
} from '@/lib/blog';
import {
  siteInfo,
  buildMetadata,
  breadcrumbSchema,
  itemListSchema,
  jsonLdGraph,
  absoluteUrl,
} from '@/lib/seo';
import { PostCard, FeaturedPostCard } from '@/components/blog/post-card';
import { BlogSidebar } from '@/components/blog/sidebar';
import { Pager } from '@/components/blog/pager';
import { JsonLd } from '@/components/blog/json-ld';

type SearchParams = Promise<{ page?: string; q?: string }>;

/**
 * رندر در زمان درخواست. پروژه بدون دیتابیس بیلد می‌شود (به Dockerfile نگاه
 * کنید)، پس صفحه‌ها نمی‌توانند در زمان بیلد از پیش ساخته شوند. کوئری‌ها سبک
 * و ایندکس‌دار هستند؛ برای کاهش بار، جلوی سایت یک کش CDN بگذارید.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { page: pageRaw, q } = await searchParams;
  const site = await siteInfo();
  const page = Math.max(1, Number(pageRaw ?? 1) || 1);

  // صفحه نتایج جستجو محتوای یکتا ندارد؛ ایندکس نمی‌شود تا صفحه‌های بی‌ارزش
  // سهم خزش سایت را هدر ندهند
  if (q?.trim()) {
    return buildMetadata({
      site,
      title: `جستجوی «${q.trim()}» در وبلاگ`,
      description: site.blogDescription,
      path: '/blog',
      noindex: true,
      canonical: '/blog',
    });
  }

  const title = page > 1 ? `${site.blogTitle} — صفحه ${page}` : site.blogTitle;

  return buildMetadata({
    site,
    title,
    description: site.blogDescription,
    path: page > 1 ? `/blog?page=${page}` : '/blog',
    prev: page > 2 ? `/blog?page=${page - 1}` : page === 2 ? '/blog' : null,
    next: `/blog?page=${page + 1}`,
  });
}

export default async function BlogIndexPage({ searchParams }: { searchParams: SearchParams }) {
  const { page: pageRaw, q: qRaw } = await searchParams;
  const page = Math.max(1, Number(pageRaw ?? 1) || 1);
  const q = qRaw?.trim() || undefined;

  const site = await siteInfo();

  const hero = !q && page === 1 ? await featuredPost() : null;

  const [list, popular, categories, tags] = await Promise.all([
    listPosts({
      page,
      perPage: site.perPage,
      q,
      excludeIds: hero ? [hero.id] : undefined,
    }),
    popularPosts(5),
    categoriesWithCounts(),
    tagsWithCounts(24),
  ]);

  const jsonLd = jsonLdGraph([
    breadcrumbSchema(site, [
      { name: 'خانه', path: '/' },
      { name: 'وبلاگ', path: '/blog' },
    ]),
    itemListSchema(
      site,
      list.items.map((p) => ({ title: p.title, path: `/blog/${p.slug}` })),
    ),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <JsonLd json={jsonLd} />

      <div className="mb-7 text-center">
        <h1 className="text-xl font-extrabold sm:text-2xl">{q ? `نتیجه جستجو برای «${q}»` : site.blogTitle}</h1>
        <p className="mx-auto mt-2.5 max-w-2xl text-xs leading-7 muted">
          {q
            ? `${new Intl.NumberFormat('fa-IR').format(list.total)} مقاله پیدا شد.`
            : site.blogDescription}
        </p>
        {!q ? (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Link href="/blog/rss.xml" className="btn btn-ghost btn-sm">
              <Rss size={14} /> خوراک RSS
            </Link>
            <Link href="/register" className="btn btn-primary btn-sm">
              ساخت سرور ابری
            </Link>
          </div>
        ) : null}
      </div>

      {/* جستجو برای موبایل؛ در دسکتاپ داخل سربرگ است */}
      <form action="/blog" className="mb-6 flex gap-2 sm:hidden">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="جستجو در مقاله‌ها…"
          className="input h-10 flex-1 text-xs"
          aria-label="جستجو در وبلاگ"
        />
        <button type="submit" className="btn btn-secondary btn-sm">
          جستجو
        </button>
      </form>

      {hero ? (
        <div className="mb-6">
          <FeaturedPostCard post={hero} />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div>
          {list.items.length === 0 ? (
            <div className="card grid place-items-center p-10 text-center">
              <SearchX size={26} className="muted" />
              <p className="mt-3 text-sm font-bold">مقاله‌ای پیدا نشد</p>
              <p className="mt-1.5 text-xs leading-6 muted">
                {q ? 'عبارت دیگری را امتحان کنید یا همه مقاله‌ها را ببینید.' : 'به‌زودی نخستین مقاله‌ها منتشر می‌شود.'}
              </p>
              {q ? (
                <Link href="/blog" className="btn btn-secondary btn-sm mt-4">
                  همه مقاله‌ها
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {list.items.map((post, i) => (
                <PostCard key={post.id} post={post} priority={i < 2} />
              ))}
            </div>
          )}

          <Pager basePath="/blog" page={list.page} totalPages={list.totalPages} query={q} />
        </div>

        <BlogSidebar popular={popular} categories={categories} tags={tags} brand={site.brandName} />
      </div>

      <p className="mt-10 text-center text-[11px] muted">
        خوراک RSS وبلاگ:{' '}
        <span className="ltr inline-block">{absoluteUrl(site.siteUrl, '/blog/rss.xml')}</span>
      </p>
    </main>
  );
}
