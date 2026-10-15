import prisma from '@/lib/prisma';
import { ok, route } from '@/lib/api';
import { requireStaff } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { env } from '@/lib/env';
import { siteInfo, cloudLinks } from '@/lib/seo';
import { publishedWhere } from '@/lib/blog';
import { auditLabel } from '@/lib/audit';
import { auditSite } from '@/lib/seo-audit';
import { pipelineStats } from '@/lib/content/pipeline';
import { gscConfigured, sitePerformance, GscError } from '@/lib/gsc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** میانگین قیمت تقریبی هزار توکن مدل، برای برآورد هزینه ماه */
const USD_PER_1K_INPUT = 0.005;
const USD_PER_1K_OUTPUT = 0.025;

const DAY_MS = 24 * 3600 * 1000;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * همه‌چیزِ داشبورد وبلاگ در یک درخواست: انتشار، بازدید، خط تولید، سلامت سئو
 * و کارهایی که روی زمین مانده است.
 */
export const GET = route(async () => {
  await requireStaff();

  const since30 = new Date(Date.now() - 30 * DAY_MS);
  const since7 = new Date(Date.now() - 7 * DAY_MS);
  const startOfToday = new Date(new Date().setHours(0, 0, 0, 0));

  const [settings, site, audit, pipeline] = await Promise.all([
    getSettings(),
    siteInfo(),
    auditSite(),
    pipelineStats(),
  ]);

  const [
    statusCounts,
    featuredCount,
    publishedAgg,
    recentPublished,
    topPosts,
    recentEdits,
    needsWork,
    scheduled,
    categories,
    tagCount,
    orphanTags,
    activity,
    lastJob,
    pipelineQueue,
  ] = await Promise.all([
    prisma.blogPost.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.blogPost.count({ where: { featured: true } }),
    prisma.blogPost.aggregate({
      where: publishedWhere(),
      _sum: { views: true, wordCount: true },
      _avg: { seoScore: true, wordCount: true },
    }),
    // برای نمودار انتشار ۳۰ روز اخیر
    prisma.blogPost.findMany({
      where: { publishedAt: { gte: since30 }, status: { in: ['PUBLISHED', 'SCHEDULED'] } },
      select: { publishedAt: true, views: true, wordCount: true },
    }),
    prisma.blogPost.findMany({
      where: publishedWhere(),
      orderBy: { views: 'desc' },
      take: 8,
      select: { id: true, slug: true, title: true, views: true, seoScore: true, publishedAt: true },
    }),
    prisma.blogPost.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: { id: true, slug: true, title: true, status: true, updatedAt: true, seoScore: true },
    }),
    // کم‌امتیازترین مقاله‌های منتشرشده — جایی که بیشترین سود سئو خوابیده است
    prisma.blogPost.findMany({
      where: { ...publishedWhere(), seoScore: { lt: 80 } },
      orderBy: { seoScore: 'asc' },
      take: 6,
      select: { id: true, slug: true, title: true, seoScore: true, wordCount: true, views: true },
    }),
    prisma.blogPost.findMany({
      where: { status: 'SCHEDULED', publishedAt: { gt: new Date() } },
      orderBy: { publishedAt: 'asc' },
      take: 6,
      select: { id: true, slug: true, title: true, publishedAt: true },
    }),
    prisma.blogCategory.findMany({
      orderBy: { order: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        active: true,
        _count: { select: { posts: true } },
      },
    }),
    prisma.blogTag.count(),
    prisma.blogTag.count({ where: { posts: { none: {} } } }),
    prisma.auditLog.findMany({
      where: {
        OR: [
          { action: { startsWith: 'admin.blog_' } },
          { action: { startsWith: 'admin.content_' } },
          { action: { startsWith: 'admin.indexnow_' } },
          { action: { startsWith: 'content.' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        action: true,
        entityId: true,
        createdAt: true,
        meta: true,
        user: { select: { email: true, firstName: true, lastName: true } },
      },
    }),
    prisma.jobRun.findFirst({
      where: { job: 'content-pipeline' },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true, finishedAt: true, status: true, processed: true, error: true },
    }),
    prisma.contentJob.count({ where: { status: { in: ['PENDING', 'RESEARCHING'] } } }),
  ]);

  const byStatus = (status: string) => statusCounts.find((c) => c.status === status)?._count._all ?? 0;

  // سری روزانه ۳۰ روز: هر روز چند مقاله منتشر شد و چند کلمه نوشته شد
  const buckets = new Map<string, { day: string; posts: number; words: number; views: number }>();
  for (let i = 29; i >= 0; i--) {
    const key = dayKey(new Date(Date.now() - i * DAY_MS));
    buckets.set(key, { day: key, posts: 0, words: 0, views: 0 });
  }
  for (const post of recentPublished) {
    if (!post.publishedAt) continue;
    const bucket = buckets.get(dayKey(post.publishedAt));
    if (!bucket) continue;
    bucket.posts += 1;
    bucket.words += post.wordCount;
    bucket.views += post.views;
  }

  const published30 = recentPublished.filter((p) => p.publishedAt && p.publishedAt <= new Date()).length;
  const published7 = recentPublished.filter(
    (p) => p.publishedAt && p.publishedAt >= since7 && p.publishedAt <= new Date(),
  ).length;
  const publishedToday = recentPublished.filter((p) => p.publishedAt && p.publishedAt >= startOfToday).length;

  // هزینه تقریبی تولید محتوا در ۳۰ روز گذشته
  const costUsd =
    (pipeline.tokens30d.input / 1000) * USD_PER_1K_INPUT +
    (pipeline.tokens30d.output / 1000) * USD_PER_1K_OUTPUT;

  // آمار سرچ کنسول، اگر وصل باشد
  let search: {
    configured: boolean;
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
    prevClicks?: number;
    topQueries?: { key: string; clicks: number; impressions: number; position: number }[];
    error?: string;
  } = { configured: gscConfigured() };
  if (search.configured) {
    try {
      const perf = await sitePerformance(28);
      search = {
        configured: true,
        clicks: perf.current.clicks,
        impressions: perf.current.impressions,
        ctr: perf.current.ctr,
        position: perf.current.position,
        prevClicks: perf.previous.clicks,
        topQueries: perf.topQueries.slice(0, 6).map((r) => ({
          key: r.keys[0] ?? '',
          clicks: r.clicks,
          impressions: r.impressions,
          position: r.position,
        })),
      };
    } catch (err) {
      search = { configured: true, error: err instanceof GscError ? err.message : 'دریافت آمار گوگل ممکن نشد.' };
    }
  }

  const cloud = cloudLinks(site);
  const localSite = !site.siteUrl || /localhost|127\.0\.0\.1/.test(site.siteUrl);

  return ok({
    posts: {
      total: statusCounts.reduce((sum, c) => sum + c._count._all, 0),
      published: byStatus('PUBLISHED'),
      scheduled: byStatus('SCHEDULED'),
      draft: byStatus('DRAFT'),
      featured: featuredCount,
      noindex: audit.stats.noindex,
      views: Number(publishedAgg._sum.views ?? 0),
      words: Number(publishedAgg._sum.wordCount ?? 0),
      avgSeoScore: Math.round(publishedAgg._avg.seoScore ?? 0),
      avgWords: Math.round(publishedAgg._avg.wordCount ?? 0),
      publishedToday,
      published7,
      published30,
    },
    series: [...buckets.values()],
    topPosts,
    recentEdits,
    needsWork,
    scheduled,
    categories: categories.map(({ _count, ...c }) => ({ ...c, postCount: _count.posts })),
    tags: { total: tagCount, orphans: orphanTags },
    seo: {
      score: audit.score,
      issues: audit.issues.slice(0, 6).map(({ posts: _posts, ...rest }) => rest),
      criticalCount: audit.issues.filter((i) => i.severity === 'critical').length,
      checklist: audit.checklist,
      orphans: audit.stats.orphans,
      stale: audit.stats.staleCount,
    },
    search,
    pipeline: {
      ...pipeline,
      queue: pipelineQueue,
      costUsd30d: Math.round(costUsd * 100) / 100,
      lastRun: lastJob,
      config: {
        enabled: settings.contentAutoEnabled,
        perDay: settings.contentPerDay,
        autoPublish: settings.contentAutoPublish,
        runHour: settings.contentRunHour,
        minSeoScore: settings.contentMinSeoScore,
        apiKeyReady: Boolean(env.content.apiKey),
        serpKeyReady: Boolean(env.content.serpKey),
        model: env.content.model,
      },
    },
    activity: activity.map((row) => ({ ...row, label: auditLabel(row.action) })),
    site: {
      blogEnabled: settings.blogEnabled,
      siteUrl: site.siteUrl,
      localSite,
      brandName: site.brandName,
      cloudConfigured: cloud.configured,
      registerUrl: cloud.register,
      indexNowEnabled: settings.indexNowEnabled,
      googleVerified: Boolean(settings.googleSiteVerification),
    },
  });
});
