'use client';

import Link from 'next/link';
import useSWR from 'swr';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  FileText,
  Eye,
  Gauge,
  Bot,
  Plus,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  CalendarDays,
  FolderTree,
  Hash,
  Search,
  ExternalLink,
  PenLine,
  Sparkles,
} from 'lucide-react';
import { Alert, Badge, Card, EmptyState, LoadingBlock, Stat } from '@/components/ui';
import { fetcher } from '@/lib/client';
import { formatNumber } from '@/lib/money';
import { faDate, faDateTime, faRelative } from '@/lib/utils';
import { STATUS_FA, scoreTone, type PostStatus } from './blog/types';

type Overview = {
  posts: {
    total: number;
    published: number;
    scheduled: number;
    draft: number;
    featured: number;
    noindex: number;
    views: number;
    words: number;
    avgSeoScore: number;
    avgWords: number;
    publishedToday: number;
    published7: number;
    published30: number;
  };
  series: { day: string; posts: number; words: number; views: number }[];
  topPosts: { id: string; slug: string; title: string; views: number; seoScore: number; publishedAt: string | null }[];
  recentEdits: { id: string; slug: string; title: string; status: PostStatus; updatedAt: string; seoScore: number }[];
  needsWork: { id: string; slug: string; title: string; seoScore: number; wordCount: number; views: number }[];
  scheduled: { id: string; slug: string; title: string; publishedAt: string | null }[];
  categories: { id: string; slug: string; name: string; active: boolean; postCount: number }[];
  tags: { total: number; orphans: number };
  seo: {
    score: number;
    issues: { key: string; severity: 'critical' | 'warning' | 'info'; title: string; detail: string; count?: number; href?: string }[];
    criticalCount: number;
    checklist: { key: string; label: string; ok: boolean; hint: string }[];
    orphans: number;
    stale: number;
  };
  search: {
    configured: boolean;
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
    prevClicks?: number;
    topQueries?: { key: string; clicks: number; impressions: number; position: number }[];
    error?: string;
  };
  pipeline: {
    total: number;
    published: number;
    drafted: number;
    rejected: number;
    failed: number;
    today: number;
    queue: number;
    costUsd30d: number;
    tokens30d: { input: number; output: number };
    lastRun: { startedAt: string; finishedAt: string | null; status: string; processed: number; error: string | null } | null;
    config: {
      enabled: boolean;
      perDay: number;
      autoPublish: boolean;
      runHour: number;
      minSeoScore: number;
      apiKeyReady: boolean;
      serpKeyReady: boolean;
      model: string;
    };
  };
  activity: {
    id: string;
    action: string;
    label: string;
    entityId: string | null;
    createdAt: string;
    meta: Record<string, unknown>;
    user: { email: string; firstName: string | null; lastName: string | null } | null;
  }[];
  site: {
    blogEnabled: boolean;
    siteUrl: string;
    localSite: boolean;
    brandName: string;
    cloudConfigured: boolean;
    registerUrl: string;
    indexNowEnabled: boolean;
    googleVerified: boolean;
  };
};

export function BlogDashboard() {
  const { data, isLoading } = useSWR<Overview>('/api/admin/blog/overview', fetcher, {
    refreshInterval: 120_000,
  });

  if (isLoading && !data) return <LoadingBlock label="در حال خواندن آمار وبلاگ…" />;
  if (!data) return <Alert tone="error">دریافت آمار وبلاگ ممکن نشد.</Alert>;

  const { posts, pipeline, seo, site, search } = data;
  const target = pipeline.config.enabled ? pipeline.config.perDay : 0;

  return (
    <div className="space-y-5">
      {/* ───── کارهایی که باید انجام شود ───── */}
      <div className="space-y-3">
        {!site.blogEnabled ? (
          <Alert
            tone="error"
            title="وبلاگ روی سایت عمومی خاموش است"
            action={
              <Link href="/admin/seo" className="btn btn-secondary btn-sm">
                روشن کردن
              </Link>
            }
          >
            بازدیدکننده صفحه‌های وبلاگ را نمی‌بیند و گوگل هم نمی‌تواند ایندکس کند.
          </Alert>
        ) : null}

        {site.localSite ? (
          <Alert
            tone="error"
            title="آدرس سایت تنظیم نشده است"
            action={
              <Link href="/admin/seo" className="btn btn-secondary btn-sm">
                تنظیم آدرس
              </Link>
            }
          >
            بدون آدرس درست، canonical و sitemap اشتباه ساخته می‌شوند و ایندکس گوگل به تأخیر می‌افتد.
          </Alert>
        ) : null}

        {!site.cloudConfigured ? (
          <Alert
            tone="warning"
            title="آدرس پنل ابری تنظیم نشده است"
            action={
              <Link href="/admin/seo" className="btn btn-secondary btn-sm">
                تنظیم آدرس
              </Link>
            }
          >
            دکمه‌های «ثبت‌نام» و «ساخت سرور» وبلاگ الان به{' '}
            <code className="mono ltr">{site.registerUrl}</code> می‌روند. آدرس پنل ابری را تنظیم کنید تا
            کاربر درست سر جای ثبت‌نام برود.
          </Alert>
        ) : null}

        {pipeline.config.enabled && !pipeline.config.apiKeyReady ? (
          <Alert tone="error" title="کلید هوش مصنوعی تنظیم نشده است">
            انتشار خودکار روشن است ولی <code className="mono ltr">ANTHROPIC_API_KEY</code> در فایل{' '}
            <code className="mono ltr">.env</code> خالی است؛ هیچ مقاله‌ای ساخته نمی‌شود.
          </Alert>
        ) : null}

        {pipeline.lastRun?.status === 'failed' ? (
          <Alert
            tone="warning"
            title="آخرین اجرای تولید محتوا با خطا تمام شد"
            action={
              <Link href="/admin/blog/content" className="btn btn-secondary btn-sm">
                بررسی صف
              </Link>
            }
          >
            {pipeline.lastRun.error ?? 'جزئیات خطا در گزارش رویدادها هست.'}
          </Alert>
        ) : null}
      </div>

      {/* ───── آمار اصلی ───── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat
          label="مقاله‌های منتشرشده"
          value={formatNumber(posts.published)}
          hint={`${formatNumber(posts.draft)} پیش‌نویس · ${formatNumber(posts.scheduled)} زمان‌بندی‌شده`}
          icon={<FileText size={16} />}
        />
        <Stat
          label="بازدید کل"
          value={formatNumber(posts.views)}
          hint={`میانگین ${formatNumber(posts.published ? Math.round(posts.views / posts.published) : 0)} بازدید برای هر مقاله`}
          icon={<Eye size={16} />}
          tone="ok"
        />
        <Stat
          label="میانگین امتیاز سئو"
          value={`${formatNumber(posts.avgSeoScore)} / ۱۰۰`}
          hint={`میانگین طول مقاله: ${formatNumber(posts.avgWords)} کلمه`}
          icon={<Gauge size={16} />}
          tone={scoreTone(posts.avgSeoScore)}
        />
        <Stat
          label="انتشار امروز"
          value={`${formatNumber(posts.publishedToday)}${target ? ` از ${formatNumber(target)}` : ''}`}
          hint={`${formatNumber(posts.published7)} مقاله در ۷ روز · ${formatNumber(posts.published30)} در ۳۰ روز`}
          icon={<Bot size={16} />}
          tone={target ? (posts.publishedToday >= target ? 'ok' : 'warn') : undefined}
        />
      </div>

      {/* ───── میان‌برها ───── */}
      <div className="flex flex-wrap gap-2">
        <Link href="/admin/blog/new" className="btn btn-primary btn-sm">
          <Plus size={14} /> مقاله جدید
        </Link>
        <Link href="/admin/blog" className="btn btn-secondary btn-sm">
          <FileText size={14} /> فهرست مقاله‌ها
        </Link>
        <Link href="/admin/blog/content" className="btn btn-secondary btn-sm">
          <Bot size={14} /> خط تولید محتوا
        </Link>
        <Link href="/admin/blog/calendar" className="btn btn-secondary btn-sm">
          <CalendarDays size={14} /> تقویم انتشار
        </Link>
        <Link href="/admin/seo" className="btn btn-secondary btn-sm">
          <TrendingUp size={14} /> سئو و آمار
        </Link>
        {site.siteUrl ? (
          <a href={`${site.siteUrl}/blog`} target="_blank" rel="noopener" className="btn btn-ghost btn-sm">
            <ExternalLink size={14} /> دیدن وبلاگ
          </a>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* نمودار انتشار */}
        <Card
          className="lg:col-span-2"
          title="آهنگ انتشار (۳۰ روز اخیر)"
          description="هر ستون، مقاله‌های منتشرشده همان روز است."
        >
          {posts.published30 === 0 ? (
            <p className="py-16 text-center text-xs muted">در ۳۰ روز گذشته مقاله‌ای منتشر نشده است.</p>
          ) : (
            <div className="h-56 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.series} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(d: string) => faDate(d)}
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                    stroke="var(--border)"
                    minTickGap={28}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                    stroke="var(--border)"
                    width={28}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      fontSize: 12,
                      direction: 'rtl',
                    }}
                    labelFormatter={(d) => faDate(String(d))}
                    formatter={(v: number) => [formatNumber(v), 'مقاله']}
                  />
                  <Bar dataKey="posts" fill="var(--color-brand-500)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-[11px] sm:grid-cols-4">
            <MiniStat label="کل کلمه‌های سایت" value={formatNumber(posts.words)} />
            <MiniStat label="مقاله ویژه" value={formatNumber(posts.featured)} />
            <MiniStat label="بدون ایندکس" value={formatNumber(posts.noindex)} />
            <MiniStat label="دسته و برچسب" value={`${formatNumber(data.categories.length)} / ${formatNumber(data.tags.total)}`} />
          </div>
        </Card>

        {/* سلامت سئو */}
        <Card
          title="سلامت سئوی سایت"
          action={
            <Link href="/admin/seo" className="btn btn-ghost btn-sm">
              جزئیات
            </Link>
          }
        >
          <div className="flex items-center gap-4">
            <ScoreRing score={seo.score} />
            <div className="min-w-0 text-xs leading-6">
              <p className="font-bold">
                {seo.score >= 85 ? 'وضعیت خوب است' : seo.score >= 65 ? 'جای بهتر شدن دارد' : 'نیازمند رسیدگی'}
              </p>
              <p className="muted">
                {seo.criticalCount > 0
                  ? `${formatNumber(seo.criticalCount)} مورد بحرانی`
                  : 'موردی بحرانی باقی نمانده است'}
              </p>
            </div>
          </div>

          {seo.issues.length === 0 ? (
            <p className="mt-4 text-xs muted">هیچ ایرادی پیدا نشد.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {seo.issues.map((issue) => (
                <li key={issue.key} className="flex items-start gap-2 border-b pb-2 text-[11px] leading-5 last:border-b-0">
                  <span className="mt-0.5 shrink-0">
                    {issue.severity === 'critical' ? (
                      <XCircle size={12} className="text-red-500" />
                    ) : issue.severity === 'warning' ? (
                      <AlertTriangle size={12} className="text-amber-500" />
                    ) : (
                      <CheckCircle2 size={12} className="text-sky-500" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    {issue.href ? (
                      <Link href={issue.href} className="font-semibold hover:underline">
                        {issue.title}
                      </Link>
                    ) : (
                      <span className="font-semibold">{issue.title}</span>
                    )}
                    {issue.count ? <span className="muted"> — {formatNumber(issue.count)} مورد</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* پربازدیدترین */}
        <Card title="پربازدیدترین مقاله‌ها">
          {data.topPosts.length === 0 ? (
            <p className="py-8 text-center text-xs muted">هنوز بازدیدی ثبت نشده است.</p>
          ) : (
            <ul className="space-y-2">
              {data.topPosts.map((post, i) => (
                <li key={post.id} className="flex items-center justify-between gap-2 border-b pb-2 text-xs last:border-b-0">
                  <Link href={`/admin/blog/${post.id}`} className="flex min-w-0 items-center gap-2 hover:underline">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded text-[10px] font-bold surface-2">
                      {formatNumber(i + 1)}
                    </span>
                    <span className="truncate">{post.title}</span>
                  </Link>
                  <span className="tabular shrink-0 muted">{formatNumber(post.views)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* بیشترین سود سئو */}
        <Card
          title="بیشترین سود از ویرایش"
          description="مقاله‌های منتشرشده با امتیاز سئوی پایین."
        >
          {data.needsWork.length === 0 ? (
            <p className="py-8 text-center text-xs muted">همه مقاله‌ها امتیاز خوبی دارند.</p>
          ) : (
            <ul className="space-y-2">
              {data.needsWork.map((post) => (
                <li key={post.id} className="flex items-center justify-between gap-2 border-b pb-2 text-xs last:border-b-0">
                  <Link href={`/admin/blog/${post.id}`} className="min-w-0 truncate hover:underline">
                    {post.title}
                  </Link>
                  <Badge tone={scoreTone(post.seoScore)}>{formatNumber(post.seoScore)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* دسته‌ها */}
        <Card
          title="توزیع موضوعی"
          action={
            <Link href="/admin/blog/categories" className="btn btn-ghost btn-sm">
              <FolderTree size={13} /> مدیریت
            </Link>
          }
        >
          {data.categories.length === 0 ? (
            <EmptyState icon={<FolderTree size={20} />} title="دسته‌ای ساخته نشده" />
          ) : (
            <ul className="space-y-2.5">
              {data.categories.map((cat) => {
                const max = Math.max(...data.categories.map((c) => c.postCount), 1);
                return (
                  <li key={cat.id}>
                    <div className="flex items-center justify-between text-xs">
                      <span className={cat.active ? '' : 'muted line-through'}>{cat.name}</span>
                      <span className="tabular font-bold">{formatNumber(cat.postCount)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                      <div
                        className="h-full rounded-full bg-[var(--color-brand-500)]"
                        style={{ width: `${(cat.postCount / max) * 100}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {data.tags.orphans > 0 ? (
            <Link
              href="/admin/blog/tags"
              className="mt-3 flex items-center gap-1 text-[11px] text-amber-600 hover:underline"
            >
              <Hash size={11} /> {formatNumber(data.tags.orphans)} برچسب بی‌مقاله — پاکسازی
            </Link>
          ) : null}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* خط تولید */}
        <Card
          className="lg:col-span-2"
          title="خط تولید محتوا"
          action={
            <Link href="/admin/blog/content" className="btn btn-ghost btn-sm">
              <Bot size={13} /> مدیریت صف
            </Link>
          }
        >
          <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <MiniStat label="امروز ساخته شد" value={formatNumber(pipeline.today)} />
            <MiniStat label="در صف" value={formatNumber(pipeline.queue)} />
            <MiniStat label="منتشرشده (کل)" value={formatNumber(pipeline.published)} />
            <MiniStat label="ناموفق / ردشده" value={`${formatNumber(pipeline.failed)} / ${formatNumber(pipeline.rejected)}`} />
          </div>

          <dl className="mt-4 space-y-2 border-t pt-3 text-[11px]">
            <Row
              label="انتشار خودکار"
              value={
                pipeline.config.enabled ? (
                  <Badge tone="ok">
                    روشن — روزی {formatNumber(pipeline.config.perDay)} مقاله
                  </Badge>
                ) : (
                  <Badge tone="muted">خاموش</Badge>
                )
              }
            />
            <Row
              label="حالت انتشار"
              value={pipeline.config.autoPublish ? 'انتشار مستقیم' : 'ذخیره به عنوان پیش‌نویس'}
            />
            <Row
              label="ساعت اجرا (تهران)"
              value={`${formatNumber(pipeline.config.runHour)}:۰۰ — حد امتیاز سئو ${formatNumber(pipeline.config.minSeoScore)}`}
            />
            <Row
              label="آخرین اجرا"
              value={
                pipeline.lastRun ? (
                  <span className="flex items-center gap-1.5">
                    {pipeline.lastRun.status === 'done' ? (
                      <CheckCircle2 size={11} className="text-emerald-500" />
                    ) : pipeline.lastRun.status === 'failed' ? (
                      <XCircle size={11} className="text-red-500" />
                    ) : (
                      <Clock size={11} className="text-amber-500" />
                    )}
                    <span title={faDateTime(pipeline.lastRun.startedAt)}>{faRelative(pipeline.lastRun.startedAt)}</span>
                  </span>
                ) : (
                  <span className="text-amber-600">هرگز — ورکر را با npm run worker اجرا کنید</span>
                )
              }
            />
            <Row
              label="هزینه تقریبی ۳۰ روز"
              value={`${pipeline.costUsd30d.toFixed(2)}$ — ${formatNumber(pipeline.tokens30d.input + pipeline.tokens30d.output)} توکن`}
            />
            <Row label="مدل" value={<code className="mono ltr text-[10px]">{pipeline.config.model}</code>} />
          </dl>
        </Card>

        {/* سرچ کنسول */}
        <Card
          title="گوگل سرچ کنسول"
          action={
            <Link href="/admin/seo" className="btn btn-ghost btn-sm">
              <Search size={13} /> آمار کامل
            </Link>
          }
        >
          {!search.configured ? (
            <div className="text-xs leading-6 muted">
              <p>سرچ کنسول وصل نیست؛ کلیک و رتبه واقعی گوگل در دسترس نیست.</p>
              <Link href="/admin/seo" className="mt-2 inline-block text-[var(--color-brand-600)] hover:underline">
                راهنمای اتصال
              </Link>
            </div>
          ) : search.error ? (
            <Alert tone="warning">{search.error}</Alert>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <MiniStat label="کلیک (۲۸ روز)" value={formatNumber(search.clicks ?? 0)} />
                <MiniStat label="نمایش" value={formatNumber(search.impressions ?? 0)} />
                <MiniStat label="نرخ کلیک" value={`${formatNumber((search.ctr ?? 0) * 100, 1)}٪`} />
                <MiniStat label="میانگین رتبه" value={formatNumber(search.position ?? 0, 1)} />
              </div>
              {search.topQueries?.length ? (
                <ul className="mt-4 space-y-1.5 border-t pt-3">
                  {search.topQueries.map((q) => (
                    <li key={q.key} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate">{q.key}</span>
                      <span className="tabular shrink-0 muted">
                        {formatNumber(q.clicks)} کلیک · رتبه {formatNumber(q.position, 1)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* در دست ویرایش */}
        <Card
          title="آخرین ویرایش‌ها"
          action={
            <Link href="/admin/blog" className="btn btn-ghost btn-sm">
              همه مقاله‌ها
            </Link>
          }
        >
          {data.recentEdits.length === 0 ? (
            <EmptyState
              icon={<PenLine size={20} />}
              title="هنوز مقاله‌ای ندارید"
              description="نخستین مقاله را بنویسید یا خط تولید را یک‌بار دستی اجرا کنید."
            />
          ) : (
            <ul className="space-y-2">
              {data.recentEdits.map((post) => (
                <li key={post.id} className="flex items-center justify-between gap-2 border-b pb-2 text-xs last:border-b-0">
                  <Link href={`/admin/blog/${post.id}`} className="min-w-0 truncate hover:underline">
                    {post.title}
                  </Link>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Badge tone={STATUS_FA[post.status].tone}>{STATUS_FA[post.status].label}</Badge>
                    <span className="muted" title={faDateTime(post.updatedAt)}>
                      {faRelative(post.updatedAt)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* صف انتشار */}
        <Card
          title="در نوبت انتشار"
          action={
            <Link href="/admin/blog/calendar" className="btn btn-ghost btn-sm">
              <CalendarDays size={13} /> تقویم
            </Link>
          }
        >
          {data.scheduled.length === 0 ? (
            <p className="py-8 text-center text-xs muted">مقاله زمان‌بندی‌شده‌ای ندارید.</p>
          ) : (
            <ul className="space-y-2">
              {data.scheduled.map((post) => (
                <li key={post.id} className="flex items-center justify-between gap-2 border-b pb-2 text-xs last:border-b-0">
                  <Link href={`/admin/blog/${post.id}`} className="min-w-0 truncate hover:underline">
                    {post.title}
                  </Link>
                  <span className="tabular shrink-0 muted">{post.publishedAt ? faDate(post.publishedAt) : '—'}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* رویدادهای تازه */}
        <Card
          title="رویدادهای تازه وبلاگ"
          action={
            <Link href="/admin/logs" className="btn btn-ghost btn-sm">
              گزارش کامل
            </Link>
          }
        >
          {data.activity.length === 0 ? (
            <p className="py-8 text-center text-xs muted">رویدادی ثبت نشده است.</p>
          ) : (
            <ul className="space-y-2">
              {data.activity.map((row) => {
                const who = row.user
                  ? [row.user.firstName, row.user.lastName].filter(Boolean).join(' ') || row.user.email
                  : 'سیستم';
                const title = typeof row.meta?.title === 'string' ? row.meta.title : null;
                const keyword = typeof row.meta?.keyword === 'string' ? row.meta.keyword : null;
                return (
                  <li key={row.id} className="border-b pb-2 text-[11px] leading-5 last:border-b-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{row.label}</span>
                      <span className="shrink-0 muted" title={faDateTime(row.createdAt)}>
                        {faRelative(row.createdAt)}
                      </span>
                    </div>
                    <div className="truncate muted">
                      {who}
                      {title || keyword ? ` — ${title ?? keyword}` : ''}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* چک‌لیست فنی */}
      <Card
        title="چک‌لیست فنی سئو"
        description="کارهای پایه‌ای که ایندکس شدن سریع را ممکن می‌کنند."
        action={
          <Link href="/admin/seo" className="btn btn-ghost btn-sm">
            <Sparkles size={13} /> تنظیمات سئو
          </Link>
        }
      >
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {seo.checklist.map((item) => (
            <li key={item.key} className="flex items-start gap-2 rounded-xl p-2.5 text-[11px] leading-5 surface-2">
              {item.ok ? (
                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-500" />
              ) : (
                <XCircle size={13} className="mt-0.5 shrink-0 text-red-500" />
              )}
              <span className="min-w-0">
                <span className="block font-semibold">{item.label}</span>
                {!item.ok ? <span className="muted">{item.hint}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl p-2.5 surface-2">
      <div className="muted">{label}</div>
      <div className="tabular mt-0.5 text-sm font-bold">{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <dt className="muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

/** حلقه امتیاز سئو — خواندنش از یک عدد خالی سریع‌تر است */
function ScoreRing({ score }: { score: number }) {
  const tone = score >= 85 ? '#10b981' : score >= 65 ? '#f59e0b' : '#ef4444';
  return (
    <div
      className="grid h-20 w-20 shrink-0 place-items-center rounded-full"
      style={{ background: `conic-gradient(${tone} ${score * 3.6}deg, var(--border) 0deg)` }}
      role="img"
      aria-label={`امتیاز سئو ${score} از ۱۰۰`}
    >
      <span className="grid h-16 w-16 place-items-center rounded-full text-sm font-extrabold" style={{ background: 'var(--surface)' }}>
        {formatNumber(score)}
      </span>
    </div>
  );
}
