import Link from 'next/link';
import { Clock, Eye, CalendarDays } from 'lucide-react';
import { faDate } from '@/lib/utils';
import type { PostCard as PostCardData } from '@/lib/blog';

/**
 * کارت مقاله در فهرست‌ها.
 * عنوان داخل h2 و در تگ <a> است تا متن لنگر لینک داخلی، خود عنوان مقاله باشد.
 */
export function PostCard({ post, priority = false }: { post: PostCardData; priority?: boolean }) {
  return (
    <article className="card group flex flex-col overflow-hidden">
      <Link href={`/blog/${post.slug}`} className="block" tabIndex={-1} aria-hidden="true">
        <div className="aspect-[16/9] w-full overflow-hidden bg-[color-mix(in_srgb,var(--color-brand-500)_8%,var(--surface))]">
          {post.coverImage ? (
            // تصویرها از منابع گوناگون می‌آیند؛ img ساده، وابستگی به تنظیم دامنه ندارد
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.coverImage}
              alt={post.coverAlt || post.title}
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-xs muted">{post.category?.name ?? 'مقاله'}</div>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-4">
        {post.category ? (
          <Link
            href={`/blog/category/${post.category.slug}`}
            className="text-[11px] font-bold text-[var(--color-brand-600)] hover:underline"
          >
            {post.category.name}
          </Link>
        ) : null}

        <h2 className="mt-1.5 text-sm font-extrabold leading-7">
          <Link href={`/blog/${post.slug}`} className="hover:text-[var(--color-brand-600)]">
            {post.title}
          </Link>
        </h2>

        <p className="mt-2 line-clamp-3 flex-1 text-xs leading-6 muted">{post.excerpt}</p>

        <div className="mt-3 flex flex-wrap items-center gap-3 border-t pt-2.5 text-[11px] muted">
          <span className="flex items-center gap-1">
            <CalendarDays size={12} />
            <time dateTime={post.publishedAt?.toISOString()}>{faDate(post.publishedAt)}</time>
          </span>
          <span className="flex items-center gap-1">
            <Clock size={12} /> {post.readingMinutes} دقیقه مطالعه
          </span>
          {post.views > 0 ? (
            <span className="tabular flex items-center gap-1">
              <Eye size={12} /> {new Intl.NumberFormat('fa-IR').format(post.views)}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/** کارت بزرگ برای مقاله شاخص بالای فهرست */
export function FeaturedPostCard({ post }: { post: PostCardData }) {
  return (
    <article className="card overflow-hidden lg:flex">
      <Link href={`/blog/${post.slug}`} className="block lg:w-1/2" tabIndex={-1} aria-hidden="true">
        <div className="aspect-[16/9] h-full w-full overflow-hidden bg-[color-mix(in_srgb,var(--color-brand-500)_8%,var(--surface))]">
          {post.coverImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.coverImage}
              alt={post.coverAlt || post.title}
              className="h-full w-full object-cover"
              decoding="async"
            />
          ) : (
            <div className="grid h-full min-h-40 w-full place-items-center text-xs muted">مقاله ویژه</div>
          )}
        </div>
      </Link>

      <div className="flex flex-col justify-center p-5 lg:w-1/2">
        <span className="badge badge-ok w-fit">مقاله ویژه</span>
        <h2 className="mt-3 text-base font-extrabold leading-8 sm:text-lg">
          <Link href={`/blog/${post.slug}`} className="hover:text-[var(--color-brand-600)]">
            {post.title}
          </Link>
        </h2>
        <p className="mt-2.5 text-xs leading-7 muted">{post.excerpt}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] muted">
          <time dateTime={post.publishedAt?.toISOString()}>{faDate(post.publishedAt)}</time>
          <span className="flex items-center gap-1">
            <Clock size={12} /> {post.readingMinutes} دقیقه
          </span>
          {post.authorName ? <span>نوشته {post.authorName}</span> : null}
        </div>
      </div>
    </article>
  );
}
