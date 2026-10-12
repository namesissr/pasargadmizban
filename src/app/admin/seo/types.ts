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
    range: { start: string; end: string };
    current: Totals;
    previous: Totals;
    topQueries: SearchRow[];
    topPages: SearchRow[];
    daily: SearchRow[];
  } | null;
  perPage: Record<string, Totals>;
  gsc: { configured: boolean; property: string | null; error: string | null };
  site: { siteUrl: string; sitemap: string; robots: string; rss: string; indexNowKeyFile: string };
};

export type PostSeoDetail = {
  post: { id: string; slug: string; title: string; views: number; seoScore: number; noindex: boolean };
  url: string;
  performance: { totals: Totals; queries: SearchRow[] } | null;
  index: {
    coverageState: string | null;
    indexingState: string | null;
    robotsTxtState: string | null;
    lastCrawlTime: string | null;
    verdict: string | null;
  } | null;
  error: string | null;
};
