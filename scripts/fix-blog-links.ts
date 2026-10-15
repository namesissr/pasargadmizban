import 'dotenv/config';
import prisma from '../src/lib/prisma';
import { siteInfo, cloudLinks } from '../src/lib/seo';
import { buildPostData } from '../src/lib/blog-admin';
import { parseFaqs } from '../src/lib/blog';

/**
 * تعمیر لینک‌های فروش در مقاله‌های موجود.
 *
 * مقاله‌هایی که پیش از تنظیم «آدرس پنل ابری» ساخته شده‌اند، لینک‌های نسبی
 * مثل /register دارند. آن لینک روی سرور وبلاگ وجود ندارد (و اگر وب‌سرور
 * ریدایرکتی داشته باشد، کاربر به آدرس اشتباه می‌رود). این اسکریپت همه
 * لینک‌های فروش را به آدرس پنل ابری تغییر می‌دهد و HTML و امتیاز سئوی
 * مقاله را دوباره می‌سازد.
 *
 * اجرا:  npm run blog:fix-links
 */

async function main() {
  const site = await siteInfo();
  const cloud = cloudLinks(site);

  if (!cloud.configured) {
    console.error('❌ آدرس پنل ابری تنظیم نشده است.');
    console.error('   اول در پنل: مدیریت ← سئو و آمار ← تنظیمات سئو، فیلد «آدرس پنل ابری» را پر کنید');
    console.error('   (مثل https://cloud.pasargadmizban.com) و بعد این دستور را دوباره اجرا کنید.');
    process.exit(1);
  }

  const base = site.cloudUrl;
  console.log(`🔗 آدرس پنل ابری: ${base}`);

  /** الگوهای لینکی که باید به پنل ابری منتقل شوند */
  const rules: { pattern: RegExp; to: string; label: string }[] = [
    { pattern: /\]\(\/register\)/g, to: `](${base}/register)`, label: '/register' },
    { pattern: /\]\(\/login\)/g, to: `](${base}/login)`, label: '/login' },
    { pattern: /\]\(\/#pricing\)/g, to: `](${base}/#pricing)`, label: '/#pricing' },
    { pattern: /\]\(\/dashboard([^)]*)\)/g, to: `](${base}/dashboard$1)`, label: '/dashboard…' },
    // جای‌گیر قالب‌های آغازین، اگر پر نشده باشد
    { pattern: /\{\{CLOUD\}\}/g, to: base, label: '{{CLOUD}}' },
  ];

  // اگر آدرس سایت اصلی تنظیم است، لینک‌های اشتباه به صفحه‌های پنل روی آن هم اصلاح می‌شود
  if (site.mainSiteUrl) {
    const escaped = site.mainSiteUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    rules.push(
      { pattern: new RegExp(`${escaped}/register`, 'g'), to: `${base}/register`, label: 'سایت اصلی/register' },
      { pattern: new RegExp(`${escaped}/login`, 'g'), to: `${base}/login`, label: 'سایت اصلی/login' },
      { pattern: new RegExp(`${escaped}/dashboard`, 'g'), to: `${base}/dashboard`, label: 'سایت اصلی/dashboard' },
    );
  }

  const posts = await prisma.blogPost.findMany({
    include: { tags: { select: { tag: { select: { name: true } } } } },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`⏳ بررسی ${posts.length} مقاله…`);

  let changed = 0;
  const hits: Record<string, number> = {};

  for (const post of posts) {
    let content = post.content;
    const before = content;

    for (const rule of rules) {
      const matches = content.match(rule.pattern);
      if (matches?.length) {
        hits[rule.label] = (hits[rule.label] ?? 0) + matches.length;
        content = content.replace(rule.pattern, rule.to);
      }
    }

    if (content === before) continue;

    // HTML، شمار کلمه و امتیاز سئو با متن تازه دوباره ساخته می‌شود
    const { data } = await buildPostData(
      {
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        content,
        coverImage: post.coverImage ?? undefined,
        coverAlt: post.coverAlt ?? undefined,
        metaTitle: post.metaTitle ?? undefined,
        metaDescription: post.metaDescription ?? undefined,
        focusKeyword: post.focusKeyword ?? undefined,
        keywords: post.keywords ?? undefined,
        canonicalUrl: post.canonicalUrl ?? undefined,
        ogImage: post.ogImage ?? undefined,
        noindex: post.noindex,
        faqs: parseFaqs(post.faqs),
        status: post.status,
        publishedAt: post.publishedAt?.toISOString() ?? null,
        featured: post.featured,
        categoryId: post.categoryId,
        tags: post.tags.map((t) => t.tag.name),
        authorName: post.authorName ?? undefined,
        authorTitle: post.authorTitle ?? undefined,
        authorBio: post.authorBio ?? undefined,
      },
      post.id,
    );

    await prisma.blogPost.update({
      where: { id: post.id },
      data: {
        content: data.content,
        contentHtml: data.contentHtml,
        wordCount: data.wordCount,
        readingMinutes: data.readingMinutes,
        seoScore: data.seoScore,
      },
    });

    changed++;
    console.log(`   ✓ ${post.title}`);
  }

  console.log('');
  console.log(`✅ ${changed} مقاله اصلاح شد.`);
  for (const [label, count] of Object.entries(hits)) {
    console.log(`   • ${label}: ${count} لینک`);
  }
  if (!changed) console.log('   هیچ لینک نسبی‌ای پیدا نشد؛ همه مقاله‌ها از قبل درست بودند.');
}

main()
  .catch((err) => {
    console.error('❌ خطا در اصلاح لینک‌ها:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
