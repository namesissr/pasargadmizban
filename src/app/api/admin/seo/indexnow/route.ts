import { z } from 'zod';
import prisma from '@/lib/prisma';
import { ok, parseBody, route } from '@/lib/api';
import { requireAdmin, clientIp, assertSameOrigin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { publishedWhere } from '@/lib/blog';
import { submitToIndexNow } from '@/lib/indexnow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  /** all: همه مقاله‌های منتشرشده | یک آدرس مشخص */
  target: z.enum(['all', 'path']).default('all'),
  path: z.string().trim().max(300).optional(),
});

/** اعلام دستی آدرس‌ها به IndexNow (بینگ، یاندکس و…) */
export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const input = await parseBody(req, schema);

  let paths: string[] = [];
  if (input.target === 'path' && input.path) {
    paths = [input.path];
  } else {
    const posts = await prisma.blogPost.findMany({
      where: { ...publishedWhere(), noindex: false },
      select: { slug: true },
      orderBy: { publishedAt: 'desc' },
      take: 500,
    });
    paths = ['/', '/blog', ...posts.map((p) => `/blog/${p.slug}`)];
  }

  const result = await submitToIndexNow(paths);

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.indexnow_submit',
    ip: await clientIp(),
    meta: { count: paths.length, sent: result.sent, reason: result.reason },
  });

  return ok({
    result,
    count: paths.length,
    message: result.sent
      ? `${new Intl.NumberFormat('fa-IR').format(paths.length)} آدرس به موتورهای جستجو اعلام شد.`
      : `اعلام انجام نشد: ${result.reason ?? 'دلیل نامشخص'}`,
  });
});
