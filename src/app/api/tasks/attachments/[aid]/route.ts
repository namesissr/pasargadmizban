import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ok, route, ApiError } from '@/lib/api';
import { requireTaskMember, assertSameOrigin } from '@/lib/auth';
import { logActivity } from '@/lib/dev-tasks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ aid: string }> };

// PDF دانلود می‌شود چون نمایشگر PDF مرورگر با سیاست sandbox پایین باز نمی‌شود
const INLINE = /^(image\/(png|jpeg|gif|webp)|video\/(mp4|webm))$/;

/** دریافت فایل پیوست — فقط برای اعضای میز کار */
export const GET = route(async (req: Request, ctx: Ctx) => {
  await requireTaskMember();
  const { aid } = await ctx.params;
  const file = await prisma.devTaskAttachment.findUnique({ where: { id: aid } });
  if (!file) throw new ApiError('فایل پیدا نشد.', 404);

  const download = new URL(req.url).searchParams.get('download') === '1';
  const disposition = !download && INLINE.test(file.mime) ? 'inline' : 'attachment';

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      'Content-Type': file.mime,
      'Content-Length': String(file.size),
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      // فایل آپلودی هرگز نباید بتواند اسکریپتی در دامنه پنل اجرا کند
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
});

/** حذف پیوست — آپلودکننده یا مدیر */
export const DELETE = route(async (_req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireTaskMember();
  const { aid } = await ctx.params;
  const file = await prisma.devTaskAttachment.findUnique({
    where: { id: aid },
    select: { id: true, taskId: true, userId: true, name: true },
  });
  if (!file) throw new ApiError('فایل پیدا نشد.', 404);
  if (file.userId !== user.id && user.role !== 'ADMIN') {
    throw new ApiError('فقط آپلودکننده یا مدیر می‌تواند فایل را حذف کند.', 403);
  }

  await prisma.devTaskAttachment.delete({ where: { id: file.id } });
  await logActivity(file.taskId, user.id, 'ATTACHMENT_REMOVED', { name: file.name });
  return ok({ deleted: true });
});
