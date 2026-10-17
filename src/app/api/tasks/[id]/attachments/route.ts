import prisma from '@/lib/prisma';
import { ok, route, ApiError } from '@/lib/api';
import { requireTaskMember, assertSameOrigin } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { findTask, logActivity, markSeen, notifyTaskChange } from '@/lib/dev-tasks';
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_PER_TASK, ATTACHMENT_MIME } from '@/lib/dev-tasks-shared';
import { formatNumber } from '@/lib/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

function cleanName(name: string, mime: string): string {
  const base = name.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f<>:"|?*]/g, '').trim() || 'file';
  const trimmed = base.slice(-120);
  // فایلی که از کلیپ‌بورد چسبانده شده معمولاً نامی مثل image.png دارد؛ پسوند درست تضمین می‌شود
  return /\.[a-z0-9]{2,5}$/i.test(trimmed) ? trimmed : `${trimmed}.${ATTACHMENT_MIME[mime]}`;
}

/**
 * آپلود یک یا چند فایل (فیلد files). اگر forComment=1 باشد فایل‌ها برای پیوست به
 * نظری که بلافاصله ارسال می‌شود آماده می‌شوند و جداگانه در تاریخچه ثبت نمی‌شوند.
 */
export const POST = route(async (req: Request, ctx: Ctx) => {
  await assertSameOrigin();
  const user = await requireTaskMember();
  await enforceRateLimit(`task-upload:${user.id}`, 120, 3600);
  const { id } = await ctx.params;
  const task = await findTask(id);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError('فایل ارسالی خوانده نشد.', 400);
  }
  const files = form.getAll('files').filter((f): f is File => typeof f === 'object' && 'arrayBuffer' in f);
  if (!files.length) throw new ApiError('فایلی انتخاب نشده است.', 422);

  const existing = await prisma.devTaskAttachment.count({ where: { taskId: task.id } });
  if (existing + files.length > ATTACHMENT_MAX_PER_TASK) {
    throw new ApiError(`هر تسک حداکثر ${formatNumber(ATTACHMENT_MAX_PER_TASK)} پیوست می‌تواند داشته باشد.`, 400);
  }

  for (const f of files) {
    if (!ATTACHMENT_MIME[f.type]) {
      throw new ApiError(`قالب فایل «${f.name}» پشتیبانی نمی‌شود. تصویر، PDF، ویدیو، متن یا ZIP بفرستید.`, 415);
    }
    if (f.size > ATTACHMENT_MAX_BYTES) {
      throw new ApiError(`حجم «${f.name}» بیش از ${formatNumber(ATTACHMENT_MAX_BYTES / 1024 / 1024)} مگابایت است.`, 413);
    }
    if (f.size === 0) throw new ApiError(`فایل «${f.name}» خالی است.`, 422);
  }

  const created = [];
  for (const f of files) {
    const row = await prisma.devTaskAttachment.create({
      data: {
        taskId: task.id,
        userId: user.id,
        name: cleanName(f.name, f.type),
        mime: f.type,
        size: f.size,
        data: Buffer.from(await f.arrayBuffer()),
      },
      select: { id: true, name: true, mime: true, size: true, createdAt: true, activityId: true, userId: true },
    });
    created.push(row);
  }

  if (form.get('forComment') !== '1') {
    await logActivity(task.id, user.id, 'ATTACHMENT', { names: created.map((c) => c.name) });
    await markSeen(task.id, user.id);
    await notifyTaskChange(
      task,
      user,
      created.length === 1 ? `فایل «${created[0].name}» را پیوست کرد` : `${formatNumber(created.length)} فایل پیوست کرد`,
    );
  }

  return ok({ items: created });
});
