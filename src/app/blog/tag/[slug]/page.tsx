import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getTag,
  listPosts,
  popularPosts,
  categoriesWithCounts,
  tagsWithCounts,
  TAG_INDEX_THRESHOLD,
} from '@/lib/blog';
import { siteInfo, buildMetadata, breadcrumbSchema, itemListSchema, jsonLdGraph } from '@/lib/seo';
import { PostCard } from '@/components/blog/post-card';
import { BlogSidebar } from '@/components/blog/sidebar';
import { Pager } from '@/components/blog/pager';
import { JsonLd } from '@/components/blog/json-ld';

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ page?: string }>;

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const [{ slug }, { page: pageRaw }, site] = await Promise.all([params, searchParams, siteInfo()]);
  const tag = await getTag(decodeURIComponent(slug));
  if (!tag) return { title: 'برچسب یافت نشد', robots: { index: false, follow: false } };

  const page = Math.max(1, Number(pageRaw ?? 1) || 1);
  const base = `/blog/tag/${tag.slug}`;
  const { total } = await listPosts({ page: 1, perPage: 1, tagSlug: tag.slug });

  return buildMetadata({
    site,
    title: page > 1 ? `${tag.name} — صفحه ${page}` : `مقاله‌های ${tag.name} | ${site.blogTitle}`,
    description:
      tag.description || `همه مقاله‌های برچسب‌خورده با «${tag.name}» در وبلاگ ${site.brandName}.`,
    path: page > 1 ? `${base}?page=${page}` : base,
    noindex: total < TAG_INDEX_THRESHOLD,
    prev: page > 2 ? `${base}?page=${page - 1}` : page === 2 ? base : null,
    next: `${base}?page=${page + 1}`,
  });
}

export default async function TagPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ slug }, { page: pageRaw }] = await Promise.all([params, searchParams]);
  const tag = await getTag(decodeURIComponent(slug));
  if (!tag) notFound();

  const page = Math.max(1, Number(pageRaw ?? 1) || 1);
  const site = await siteInfo();

  const [list, popular, categories, tags] = await Promise.all([
    listPosts({ page, perPage: site.perPage, tagSlug: tag.slug }),
    popularPosts(5),
    categoriesWithCounts(),
    tagsWithCounts(24),
  ]);

  const base = `/blog/tag/${tag.slug}`;

  const jsonLd = jsonLdGraph([
    breadcrumbSchema(site, [
      { name: 'خانه', path: '/' },
      { name: 'وبلاگ', path: '/blog' },
      { name: tag.name, path: base },
    ]),
    itemListSchema(
      site,
      list.items.map((p) => ({ title: p.title, path: `/blog/${p.slug}` })),
    ),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <JsonLd json={jsonLd} />

      <div className="mb-7">
        <p className="text-[11px] muted">برچسب</p>
        <h1 className="mt-1.5 text-xl font-extrabold sm:text-2xl">{tag.name}</h1>
        {tag.description ? <p className="mt-2.5 max-w-2xl text-xs leading-7 muted">{tag.description}</p> : null}
        <p className="tabular mt-2 text-[11px] muted">
          {new Intl.NumberFormat('fa-IR').format(list.total)} مقاله با این برچسب
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div>
          {list.items.length === 0 ? (
            <div className="card p-10 text-center text-sm muted">مقاله‌ای با این برچسب منتشر نشده است.</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {list.items.map((post, i) => (
                <PostCard key={post.id} post={post} priority={i < 2} />
              ))}
            </div>
          )}
          <Pager basePath={base} page={list.page} totalPages={list.totalPages} />
        </div>

        <BlogSidebar popular={popular} categories={categories} tags={tags} brand={site.brandName} />
      </div>
    </main>
  );
}
