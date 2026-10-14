import Link from 'next/link';
import { Flame, Tags, FolderTree, ArrowLeft, Clock, Wrench } from 'lucide-react';
import { TOOLS } from '@/lib/tools/registry';
import type { PostCard as PostCardData } from '@/lib/blog';
import type { SiteInfo } from '@/lib/seo';
import { cloudLinks } from '@/lib/seo';

/**
 * ستون کنار فهرست و مقاله: پربازدیدها، دسته‌ها، برچسب‌ها و یک جعبه فروش.
 * هر مقاله از این راه به ده‌ها صفحه دیگر لینک می‌دهد و صفحه‌های تازه
 * سریع‌تر خزیده می‌شوند.
 */
export function BlogSidebar({
  popular,
  categories,
  tags,
  site,
}: {
  popular: PostCardData[];
  categories: { slug: string; name: string; count: number }[];
  tags: { slug: string; name: string; count: number }[];
  site: SiteInfo;
}) {
  const cloud = cloudLinks(site);

  return (
    <aside className="space-y-4 lg:sticky lg:top-24">
      {/* جعبه فروش — پرکلیک‌ترین جای وبلاگ، چون کنار متن و چسبان است */}
      <div className="card p-4" style={{ background: 'color-mix(in srgb, var(--color-brand-500) 7%, var(--surface))' }}>
        <p className="text-sm font-extrabold">سرور ساعتی ایران و خارج</p>
        <p className="mt-2 text-[11px] leading-6 muted">
          پرداخت ساعتی به تومان، تحویل خودکار زیر یک دقیقه و تعویض آی‌پی با یک کلیک. ثبت‌نام رایگان است.
        </p>
        <a href={cloud.register} rel="noopener" className="btn btn-primary btn-sm mt-3 w-full">
          {site.cloudCtaLabel} <ArrowLeft size={14} />
        </a>
        <a href={cloud.pricing} rel="noopener" className="btn btn-ghost btn-sm mt-1.5 w-full">
          دیدن قیمت‌ها
        </a>
        <p className="mt-2 flex items-center justify-center gap-1 text-[10px] muted">
          <Clock size={10} /> تحویل خودکار، بدون انتظار
        </p>
      </div>

      <section className="card p-4">
        <p className="flex items-center gap-2 text-xs font-bold">
          <Wrench size={14} /> ابزارهای رایگان
        </p>
        <ul className="mt-3 space-y-1.5">
          {TOOLS.slice(0, 5).map((tool) => (
            <li key={tool.slug}>
              <Link href={`/tools/${tool.slug}`} className="text-xs muted hover:text-[var(--color-brand-600)]">
                {tool.name}
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/tools" className="mt-2 inline-flex items-center gap-1 text-[11px] text-[var(--color-brand-600)] hover:underline">
          همه ابزارها <ArrowLeft size={11} />
        </Link>
      </section>

      {popular.length > 0 ? (
        <section className="card p-4">
          <p className="flex items-center gap-2 text-xs font-bold">
            <Flame size={14} /> پربازدیدترین مقاله‌ها
          </p>
          <ol className="mt-3 space-y-2.5">
            {popular.map((post, i) => (
              <li key={post.slug} className="flex gap-2.5">
                <span className="tabular mt-0.5 text-xs font-extrabold text-[var(--color-brand-600)]">
                  {new Intl.NumberFormat('fa-IR').format(i + 1)}
                </span>
                <Link href={`/blog/${post.slug}`} className="text-xs leading-6 hover:text-[var(--color-brand-600)]">
                  {post.title}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {categories.length > 0 ? (
        <section className="card p-4">
          <p className="flex items-center gap-2 text-xs font-bold">
            <FolderTree size={14} /> دسته‌ها
          </p>
          <ul className="mt-3 space-y-1.5">
            {categories.map((c) => (
              <li key={c.slug} className="flex items-center justify-between gap-2">
                <Link href={`/blog/category/${c.slug}`} className="text-xs muted hover:text-[var(--color-brand-600)]">
                  {c.name}
                </Link>
                <span className="tabular text-[11px] muted">{new Intl.NumberFormat('fa-IR').format(c.count)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tags.length > 0 ? (
        <section className="card p-4">
          <p className="flex items-center gap-2 text-xs font-bold">
            <Tags size={14} /> برچسب‌ها
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <Link
                key={t.slug}
                href={`/blog/tag/${t.slug}`}
                className="rounded-full border px-2.5 py-1 text-[11px] transition hover:border-[var(--color-brand-500)]"
              >
                {t.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </aside>
  );
}
