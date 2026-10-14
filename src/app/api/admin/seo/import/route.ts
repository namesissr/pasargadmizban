import prisma from '@/lib/prisma';
import { ok, route, ApiError } from '@/lib/api';
import { requireAdmin, requireStaff, clientIp, assertSameOrigin } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { listImports, saveImport } from '@/lib/gsc-import/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE = 15 * 1024 * 1024;
const MAX_FILES = 10;

/** خروجی‌های بارگذاری‌شده، تازه‌ترین اول */
export const GET = route(async () => {
  await requireStaff();
  const imports = await listImports();
  const postIds = [...new Set(imports.map((i) => i.postId).filter(Boolean))] as string[];
  const posts = postIds.length
    ? await prisma.blogPost.findMany({ where: { id: { in: postIds } }, select: { id: true, title: true } })
    : [];
  const titles = new Map(posts.map((p) => [p.id, p.title]));
  return ok({ imports: imports.map((i) => ({ ...i, postTitle: i.postId ? (titles.get(i.postId) ?? null) : null })) });
});

/**
 * بارگذاری خروجی بخش Performance سرچ کنسول (ZIP، CSV یا Excel).
 * چند CSV جدا هم با هم پذیرفته می‌شوند و یک خروجی حساب می‌شوند.
 */
export const POST = route(async (req: Request) => {
  await assertSameOrigin();
  const admin = await requireAdmin();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError('فایلی دریافت نشد.', 400);
  }

  const files = form.getAll('file').filter((f): f is File => typeof f === 'object' && 'arrayBuffer' in f);
  if (!files.length) throw new ApiError('فایلی انتخاب نشده است.', 422);
  if (files.length > MAX_FILES) throw new ApiError(`حداکثر ${MAX_FILES} فایل با هم.`, 422);
  for (const f of files) {
    if (f.size > MAX_FILE) throw new ApiError(`فایل «${f.name}» بزرگ‌تر از ۱۵ مگابایت است.`, 413);
  }

  const buffers = await Promise.all(files.map(async (f) => ({ name: f.name || 'file', buf: Buffer.from(await f.arrayBuffer()) })));
  const result = await saveImport(buffers, admin.id);

  await audit({
    userId: admin.id,
    actorType: 'admin',
    action: 'admin.gsc_import',
    entity: 'gsc_import',
    entityId: result.import.id,
    ip: await clientIp(),
    meta: {
      files: buffers.map((b) => b.name),
      scope: result.import.scope,
      clicks: result.import.clicks,
      impressions: result.import.impressions,
    },
  });

  return ok(
    {
      ...result,
      message:
        result.import.scope === 'page'
          ? 'خروجی صفحه بارگذاری شد؛ عبارت‌های جستجوی این مقاله در «بهبود با هوش مصنوعی» به کار می‌روند.'
          : 'آمار گوگل بارگذاری شد.',
    },
    { status: 201 },
  );
});
