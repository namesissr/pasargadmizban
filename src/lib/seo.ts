import type { Metadata } from 'next';
import { env } from './env';
import { getSettings } from './settings';

/**
 * ابزارهای سئو: آدرس مطلق، متادیتای صفحه و داده‌های ساخت‌یافته (JSON-LD).
 *
 * هر صفحه عمومی باید سه چیز را درست داشته باشد تا گوگل سریع بفهمدش:
 *  ۱) عنوان و توضیح یکتا و در طول مناسب،
 *  ۲) آدرس canonical تا نسخه‌های تکراری رتبه را تقسیم نکنند،
 *  ۳) داده ساخت‌یافته تا در نتایج، کارت غنی بگیرد.
 */

export type SiteInfo = {
  siteUrl: string;
  brandName: string;
  blogTitle: string;
  blogDescription: string;
  defaultOgImage: string;
  supportEmail: string;
  supportPhone: string;
  perPage: number;
  enabled: boolean;
  twitter: string;
  verification: { google: string; bing: string };
};

/** تنظیمات عمومی سایت برای ساخت متادیتا؛ siteUrl از پنل مدیریت خوانده می‌شود */
export async function siteInfo(): Promise<SiteInfo> {
  const s = await getSettings();
  const siteUrl = (s.siteUrl || env.appUrl || 'http://localhost:3000').replace(/\/+$/, '');
  return {
    siteUrl,
    brandName: s.brandName,
    blogTitle: s.blogTitle || `وبلاگ ${s.brandName}`,
    blogDescription:
      s.blogDescription ||
      'آموزش، راهنما و تجربه‌های واقعی درباره سرور ابری، سرور مجازی، لینوکس و زیرساخت — به زبان ساده.',
    defaultOgImage: s.blogOgImage || '',
    supportEmail: s.supportEmail,
    supportPhone: s.supportPhone,
    perPage: Math.min(24, Math.max(4, s.blogPerPage || 9)),
    enabled: s.blogEnabled !== false,
    twitter: s.blogTwitter || '',
    verification: { google: s.googleSiteVerification || '', bing: s.bingSiteVerification || '' },
  };
}

export function absoluteUrl(siteUrl: string, path = '/'): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${siteUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/** متن را برای توضیحات متا به طول مناسب می‌رساند (گوگل حدود ۱۶۰ نویسه نشان می‌دهد) */
export function clampDescription(text: string, max = 160): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

type MetaInput = {
  site: SiteInfo;
  title: string;
  description: string;
  /** مسیر صفحه، مثل /blog/my-post */
  path: string;
  image?: string | null;
  imageAlt?: string | null;
  noindex?: boolean;
  type?: 'website' | 'article';
  publishedTime?: Date | string | null;
  modifiedTime?: Date | string | null;
  authors?: string[];
  keywords?: string[];
  canonical?: string | null;
  /** صفحه‌بندی: آدرس صفحه قبل و بعد */
  prev?: string | null;
  next?: string | null;
};

export function buildMetadata(input: MetaInput): Metadata {
  const { site } = input;
  const url = input.canonical ? absoluteUrl(site.siteUrl, input.canonical) : absoluteUrl(site.siteUrl, input.path);
  const image = input.image ? absoluteUrl(site.siteUrl, input.image) : input.image === null ? '' : site.defaultOgImage
    ? absoluteUrl(site.siteUrl, site.defaultOgImage)
    : '';

  const images = image ? [{ url: image, alt: input.imageAlt || input.title }] : undefined;

  const meta: Metadata = {
    title: input.title,
    description: clampDescription(input.description),
    alternates: {
      canonical: url,
      types: { 'application/rss+xml': absoluteUrl(site.siteUrl, '/blog/rss.xml') },
    },
    robots: input.noindex
      ? { index: false, follow: true }
      : {
          index: true,
          follow: true,
          googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
        },
    openGraph: {
      type: input.type === 'article' ? 'article' : 'website',
      title: input.title,
      description: clampDescription(input.description),
      url,
      siteName: site.brandName,
      locale: 'fa_IR',
      images,
      ...(input.type === 'article'
        ? {
            publishedTime: input.publishedTime ? new Date(input.publishedTime).toISOString() : undefined,
            modifiedTime: input.modifiedTime ? new Date(input.modifiedTime).toISOString() : undefined,
            authors: input.authors,
          }
        : {}),
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title: input.title,
      description: clampDescription(input.description),
      images: image || undefined,
      site: site.twitter || undefined,
    },
  };

  if (input.keywords?.length) meta.keywords = input.keywords;
  if (site.verification.google || site.verification.bing) {
    meta.verification = {
      google: site.verification.google || undefined,
      other: site.verification.bing ? { 'msvalidate.01': site.verification.bing } : undefined,
    };
  }
  if (input.prev || input.next) {
    // لینک‌های صفحه‌بندی برای خزنده‌ها
    meta.other = {
      ...(input.prev ? { 'link:prev': absoluteUrl(site.siteUrl, input.prev) } : {}),
      ...(input.next ? { 'link:next': absoluteUrl(site.siteUrl, input.next) } : {}),
    };
  }
  return meta;
}

// ─────────────────────────  داده ساخت‌یافته  ─────────────────────────

type Json = Record<string, unknown>;

export function organizationSchema(site: SiteInfo): Json {
  return {
    '@type': 'Organization',
    '@id': `${site.siteUrl}/#organization`,
    name: site.brandName,
    url: site.siteUrl,
    ...(site.defaultOgImage ? { logo: absoluteUrl(site.siteUrl, site.defaultOgImage) } : {}),
    ...(site.supportEmail || site.supportPhone
      ? {
          contactPoint: [
            {
              '@type': 'ContactPoint',
              contactType: 'customer support',
              ...(site.supportEmail ? { email: site.supportEmail } : {}),
              ...(site.supportPhone ? { telephone: site.supportPhone } : {}),
              areaServed: 'IR',
              availableLanguage: ['fa'],
            },
          ],
        }
      : {}),
  };
}

export function websiteSchema(site: SiteInfo): Json {
  return {
    '@type': 'WebSite',
    '@id': `${site.siteUrl}/#website`,
    url: site.siteUrl,
    name: site.brandName,
    inLanguage: 'fa-IR',
    publisher: { '@id': `${site.siteUrl}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${site.siteUrl}/blog?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function breadcrumbSchema(site: SiteInfo, items: { name: string; path: string }[]): Json {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(site.siteUrl, item.path),
    })),
  };
}

export type ArticleSchemaInput = {
  site: SiteInfo;
  title: string;
  description: string;
  path: string;
  image?: string | null;
  publishedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  authorName: string;
  authorTitle?: string | null;
  section?: string | null;
  tags?: string[];
  wordCount?: number;
  readingMinutes?: number;
};

export function articleSchema(input: ArticleSchemaInput): Json {
  const { site } = input;
  const url = absoluteUrl(site.siteUrl, input.path);
  return {
    '@type': 'BlogPosting',
    '@id': `${url}#article`,
    headline: input.title.slice(0, 110),
    description: clampDescription(input.description),
    inLanguage: 'fa-IR',
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    ...(input.image ? { image: [absoluteUrl(site.siteUrl, input.image)] } : {}),
    datePublished: input.publishedAt ? new Date(input.publishedAt).toISOString() : undefined,
    dateModified: new Date(input.updatedAt ?? input.publishedAt ?? Date.now()).toISOString(),
    author: {
      '@type': 'Person',
      name: input.authorName,
      ...(input.authorTitle ? { jobTitle: input.authorTitle } : {}),
    },
    publisher: { '@id': `${site.siteUrl}/#organization` },
    ...(input.section ? { articleSection: input.section } : {}),
    ...(input.tags?.length ? { keywords: input.tags.join(', ') } : {}),
    ...(input.wordCount ? { wordCount: input.wordCount } : {}),
    ...(input.readingMinutes ? { timeRequired: `PT${input.readingMinutes}M` } : {}),
    isAccessibleForFree: true,
  };
}

export function faqSchema(faqs: { q: string; a: string }[]): Json | null {
  const clean = faqs.filter((f) => f.q?.trim() && f.a?.trim());
  if (!clean.length) return null;
  return {
    '@type': 'FAQPage',
    mainEntity: clean.map((f) => ({
      '@type': 'Question',
      name: f.q.trim(),
      acceptedAnswer: { '@type': 'Answer', text: f.a.trim() },
    })),
  };
}

export function itemListSchema(site: SiteInfo, items: { title: string; path: string }[]): Json {
  return {
    '@type': 'ItemList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: absoluteUrl(site.siteUrl, item.path),
      name: item.title,
    })),
  };
}

/** چند شِما را در یک گراف واحد می‌گذارد؛ گوگل این شکل را ترجیح می‌دهد */
export function jsonLdGraph(nodes: (Json | null | undefined)[]): string {
  const graph = nodes.filter(Boolean);
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
}
