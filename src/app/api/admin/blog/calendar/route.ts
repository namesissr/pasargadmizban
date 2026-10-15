import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, parseQuery, route } from '@/lib/api';
import { requireStaff } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  /** ماه میلادی به شکل YYYY-MM؛ خالی یعنی ماه جاری */
  month: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});

/**
 * تقویم انتشار.
 *
 * گوگل به سایتی که منظم می‌نویسد بیشتر سر می‌زند. این نما نشان می‌دهد کدام
 * روزها مقاله رفته، کدام روزها خالی مانده و چه چیزی در نوبت است.
 */
export const GET = route(async (req: Request) => {
  await requireStaff();
  const { month } = parseQuery(req, querySchema);

  const now = new Date();
  const [year, mon] = month
    ? month.split('-').map(Number)
    : [now.getUTCFullYear(), now.getUTCMonth() + 1];

  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 1));

  const [posts, drafts] = await Promise.all([
    prisma.blogPost.findMany({
      where: { publishedAt: { gte: start, lt: end } },
      orderBy: { publishedAt: 'asc' },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        publishedAt: true,
        views: true,
        seoScore: true,
        wordCount: true,
        category: { select: { name: true } },
      },
    }),
    // پیش‌نویس‌های بی‌تاریخ: چیزهایی که می‌توانید روی روزهای خالی بنشانید
    prisma.blogPost.findMany({
      where: { status: 'DRAFT', publishedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      select: { id: true, slug: true, title: true, seoScore: true, wordCount: true, updatedAt: true },
    }),
  ]);

  const days = new Map<string, typeof posts>();
  for (const post of posts) {
    if (!post.publishedAt) continue;
    const key = post.publishedAt.toISOString().slice(0, 10);
    const list = days.get(key) ?? [];
    list.push(post);
    days.set(key, list);
  }

  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();

  return ok({
    month: `${year}-${String(mon).padStart(2, '0')}`,
    /** شماره روز هفته نخستین روز ماه (۰ = یکشنبه)، برای چیدن جدول */
    firstWeekday: start.getUTCDay(),
    daysInMonth,
    days: [...days.entries()].map(([day, items]) => ({ day, items })),
    drafts,
    totals: {
      posts: posts.length,
      published: posts.filter((p) => p.status === 'PUBLISHED').length,
      scheduled: posts.filter((p) => p.status === 'SCHEDULED').length,
      words: posts.reduce((sum, p) => sum + p.wordCount, 0),
      views: posts.reduce((sum, p) => sum + p.views, 0),
      activeDays: days.size,
    },
  });
});
