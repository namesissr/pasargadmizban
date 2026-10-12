import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCategory, listPosts, popularPosts, categoriesWithCounts, tagsWithCounts } from '@/lib/blog';
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
  const category = await getCategory(decodeURIComponent(slug));
  if (!category) return { title: 'دسته یافت نشد', robots: { index: false, follow: false } };

  const page = Math.max(1, Number(pageRaw ?? 1) || 1);
  const base = `/blog/category/${category.slug}`;

  return buildMetadata({
    site,
    title: page > 1 ? `${category.metaTitle || category.name} — صفحه ${page}` : category.metaTitle || `${category.name} | ${site.blogTitle}`,
    description:
      category.metaDescription ||
      category.description ||
      `همه مقاله‌های ${site.brandName} درباره ${category.name}؛ آموزش‌ها و راهنماهای کاربردی.`,
    path: page > 1 ? `${base}?page=${page}` : base,
    image: category.coverImage || undefined,
    prev: page > 2 ? `${base}?page=${page - 1}` : page === 2 ? base : null,
    next: `${base}?page=${page + 1}`,
  });
}

export default async function CategoryPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ slug }, { page: pageRaw }] = await Promise.all([params, searchParams]);
  const category = await getCategory(decodeURIComponent(slug));
  if (!category) notFound();

  const page = Math.max(1, Number(pageRaw ?? 1) || 1);
  const site = await siteInfo();

  const [list, popular, categories, tags] = await Promise.all([
    listPosts({ page, perPage: site.perPage, categorySlug: category.slug, featuredFirst: true }),
    popularPosts(5),
    categoriesWithCounts(),
    tagsWithCounts(24),
  ]);

  const base = `/blog/category/${category.slug}`;

  const jsonLd = jsonLdGraph([
    breadcrumbSchema(site, [
      { name: 'خانه', path: '/' },
      { name: 'وبلاگ', path: '/blog' },
      { name: category.name, path: base },
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
        <p className="text-[11px] muted">دسته‌بندی وبلاگ</p>
        <h1 className="mt-1.5 text-xl font-extrabold sm:text-2xl">{category.name}</h1>
        {category.description ? (
          <p className="mt-2.5 max-w-2xl text-xs leading-7 muted">{category.description}</p>
        ) : null}
        <p className="tabular mt-2 text-[11px] muted">
          {new Intl.NumberFormat('fa-IR').format(list.total)} مقاله در این دسته
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div>
          {list.items.length === 0 ? (
            <div className="card p-10 text-center text-sm muted">هنوز مقاله‌ای در این دسته منتشر نشده است.</div>
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
