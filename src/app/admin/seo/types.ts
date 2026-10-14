/** نوع‌های مشترک بخش سئو و آمار */

export type AuditSeverity = 'critical' | 'warning' | 'info';

export type AuditIssue = {
  key: string;
  severity: AuditSeverity;
  title: string;
  detail: string;
  count?: number;
  posts?: { id: string; title: string; slug: string }[];
  href?: string;
};

export type SearchRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };

export type Totals = { clicks: number; impressions: number; ctr: number; position: number };

export type PostSeoRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  publishedAt: string | null;
  updatedAt: string;
  views: number;
  seoScore: number;
  wordCount: number;
  readingMinutes: number;
  focusKeyword: string | null;
  noindex: boolean;
  category: string | null;
  incomingLinks: number;
  hasCover: boolean;
  hasMeta: boolean;
  faqCount: number;
};

export type SeoResponse = {
  health: {
    score: number;
    issues: AuditIssue[];
    stats: {
      published: number;
      drafts: number;
      indexable: number;
      noindex: number;
      avgSeoScore: number;
      totalViews: number;
      totalWords: number;
      categories: number;
      tags: number;
      withCover: number;
      orphans: number;
      staleCount: number;
      publishedLast30: number;
    };
    checklist: { key: string; label: string; ok: boolean; hint: string }[];
  };
  posts: PostSeoRow[];
  search: {
    range: { start: string; end: string; label?: string | null };
    current: Totals;
    previous: Totals | null;
    topQueries: SearchRow[];
    topPages: SearchRow[];
    daily: SearchRow[];
  } | null;
  perPage: Record<string, Totals>;
  /** آمار گوگل از کجا آمده: API یا فایل خروجی بارگذاری‌شده */
  source: 'api' | 'import' | null;
  importInfo: ImportInfo | null;
  opportunities: Opportunity[];
  nearQueries: SearchRow[];
  gsc: { configured: boolean; property: string | null; error: string | null };
  site: { siteUrl: string; sitemap: string; robots: string; rss: string; indexNowKeyFile: string };
};

export type PostSeoDetail = {
  post: { id: string; slug: string; title: string; views: number; seoScore: number; noindex: boolean };
  url: string;
  performance: { totals: Totals; queries: SearchRow[] } | null;
  /** api: از API | page: خروجی فیلترشده همین مقاله | related: عبارت‌های هم‌خوان از خروجی کل سایت (تقریبی) */
  querySource: 'api' | 'page' | 'related' | null;
  index: {
    coverageState: string | null;
    indexingState: string | null;
    robotsTxtState: string | null;
    lastCrawlTime: string | null;
    verdict: string | null;
  } | null;
  error: string | null;
};

export type ImportInfo = {
  id: string;
  scope: string;
  fileName: string;
  rangeLabel: string | null;
  startDate: string | null;
  endDate: string | null;
  clicks: number;
  impressions: number;
  postId: string | null;
  pageUrl: string | null;
  createdAt: string;
  postTitle?: string | null;
};

export type Opportunity = Totals & {
  postId: string;
  title: string;
  slug: string;
  kind: 'near' | 'ctr';
  potential: number;
};
