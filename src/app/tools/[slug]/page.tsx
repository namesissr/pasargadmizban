import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MapPin, MonitorSmartphone } from 'lucide-react';
import prisma from '@/lib/prisma';
import { publishedWhere } from '@/lib/blog';
import {
  siteInfo,
  buildMetadata,
  breadcrumbSchema,
  faqSchema,
  webPageSchema,
  jsonLdGraph,
  absoluteUrl,
  cloudLinks,
  type SiteInfo,
} from '@/lib/seo';
import { toolBySlug, type ToolDef } from '@/lib/tools/registry';
import { visitorIp } from '@/lib/tools/visitor';
import { JsonLd } from '@/components/blog/json-ld';
import { ToolGrid, ToolIcon } from '@/components/tools/catalog';
import { TcpTool, DnsTool, SslTool, HttpTool } from '@/components/tools/network-tools';
import { MyIpTool, SubnetTool, PasswordTool } from '@/components/tools/browser-tools';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const tool = toolBySlug(slug);
  if (!tool) return {};
  const site = await siteInfo();
  return buildMetadata({ site, title: tool.metaTitle, description: tool.description, path: `/tools/${tool.slug}` });
}

/** مقاله‌های وبلاگ هم‌موضوع با ابزار؛ کاربری که ابزار را زده، معمولاً راهنمای قدم بعد را هم می‌خواهد */
async function relatedPosts(tool: ToolDef) {
  return prisma.blogPost
    .findMany({
      where: {
        ...publishedWhere(),
        noindex: false,
        OR: tool.related.map((word) => ({ title: { contains: word, mode: 'insensitive' as const } })),
      },
      select: { slug: true, title: true, excerpt: true },
      orderBy: [{ views: 'desc' }, { publishedAt: 'desc' }],
      take: 4,
    })
    .catch(() => []);
}

function webAppSchema(site: SiteInfo, tool: ToolDef) {
  return {
    '@type': 'WebApplication',
    '@id': `${absoluteUrl(site.siteUrl, `/tools/${tool.slug}`)}#app`,
    name: tool.h1,
    url: absoluteUrl(site.siteUrl, `/tools/${tool.slug}`),
    description: tool.description,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'All',
    browserRequirements: 'Requires JavaScript',
    inLanguage: 'fa-IR',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'IRR' },
    publisher: { '@id': `${site.siteUrl}/#organization` },
  };
}

export default async function ToolPage({ params }: { params: Params }) {
  const { slug } = await params;
  const tool = toolBySlug(slug);
  if (!tool) notFound();

  const site = await siteInfo();
  const cloud = cloudLinks(site);
  const [posts, ip] = await Promise.all([relatedPosts(tool), tool.kind === 'my-ip' ? visitorIp() : Promise.resolve(null)]);
  const faqs = tool.faqs.map((f) => ({ q: f.q, a: f.a.replaceAll('{brand}', site.brandName) }));

  const jsonLd = jsonLdGraph([
    webPageSchema(site, { path: `/tools/${tool.slug}`, name: tool.metaTitle, description: tool.description }),
    webAppSchema(site, tool),
    breadcrumbSchema(site, [
      { name: 'خانه', path: '/' },
      { name: 'ابزارها', path: '/tools' },
      { name: tool.name, path: `/tools/${tool.slug}` },
    ]),
    faqSchema(faqs),
  ]);

  const widget =
    tool.kind === 'tcp' ? (
      <TcpTool ctaHref={cloud.register} />
    ) : tool.kind === 'dns' ? (
      <DnsTool />
    ) : tool.kind === 'ssl' ? (
      <SslTool />
    ) : tool.kind === 'http' ? (
      <HttpTool />
    ) : tool.kind === 'subnet' ? (
      <SubnetTool />
    ) : tool.kind === 'password' ? (
      <PasswordTool />
    ) : (
      <MyIpTool ip={ip} />
    );

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <JsonLd json={jsonLd} />

      <nav aria-label="مسیر" className="mb-4 text-[11px] muted">
        <Link href="/" className="hover:underline">
          خانه
        </Link>{' '}
        /{' '}
        <Link href="/tools" className="hover:underline">
          ابزارها
        </Link>{' '}
        / {tool.name}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <div className="min-w-0">
          <header className="mb-5">
            <h1 className="flex items-center gap-2 text-xl font-extrabold sm:text-2xl">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--color-brand-50)] text-[var(--color-brand-600)]">
                <ToolIcon icon={tool.icon} size={20} />
              </span>
              {tool.h1}
            </h1>
            <p className="mt-3 text-xs leading-7 muted">{tool.intro}</p>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] muted">
              {tool.runsOn === 'server' ? (
                <>
                  <MapPin size={12} /> از روی سروری داخل ایران اجرا می‌شود
                </>
              ) : (
                <>
                  <MonitorSmartphone size={12} /> فقط در مرورگر شما اجرا می‌شود؛ چیزی به سرور فرستاده نمی‌شود
                </>
              )}
            </p>
          </header>

          <section aria-label={tool.name}>{widget}</section>

          <section className="mt-10">
            <h2 className="text-base font-extrabold">این ابزار چطور کار می‌کند؟</h2>
            <ul className="mt-3 list-disc space-y-2 pr-5 text-xs leading-7">
              {tool.how.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </section>

          <section className="mt-8">
            <h2 className="text-base font-extrabold">پرسش‌های پرتکرار</h2>
            <div className="mt-3 space-y-2">
              {faqs.map((f, i) => (
                <details key={i} className="card p-4" open={i === 0}>
                  <summary className="cursor-pointer text-xs font-bold">{f.q}</summary>
                  <p className="mt-2 text-xs leading-7 muted">{f.a}</p>
                </details>
              ))}
            </div>
          </section>

          {posts.length ? (
            <section className="mt-8">
              <h2 className="text-base font-extrabold">مقاله‌های مرتبط</h2>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {posts.map((p) => (
                  <li key={p.slug}>
                    <Link href={`/blog/${p.slug}`} className="card block h-full p-4 transition hover:border-[var(--color-brand-500)]">
                      <span className="block text-xs font-bold leading-6">{p.title}</span>
                      <span className="mt-1 line-clamp-2 block text-[11px] leading-6 muted">{p.excerpt}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="card p-4" style={{ background: 'color-mix(in srgb, var(--color-brand-500) 7%, var(--surface))' }}>
            <p className="text-sm font-extrabold">سرور ساعتی ایران و خارج</p>
            <p className="mt-2 text-[11px] leading-6 muted">
              آی‌پی تست‌شده از داخل ایران، تعویض آی‌پی با یک کلیک، پرداخت ساعتی به تومان و تحویل خودکار زیر یک دقیقه.
            </p>
            <a href={cloud.register} rel="noopener" className="btn btn-primary btn-sm mt-3 w-full">
              {site.cloudCtaLabel} <ArrowLeft size={14} />
            </a>
            <a href={cloud.pricing} rel="noopener" className="btn btn-ghost btn-sm mt-1.5 w-full">
              دیدن قیمت‌ها
            </a>
          </div>
        </aside>
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-base font-extrabold">ابزارهای دیگر</h2>
        <ToolGrid exclude={tool.slug} />
      </section>
    </main>
  );
}
