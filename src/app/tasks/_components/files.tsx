'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Paperclip, Trash2, Download, Film, UploadCloud, X } from 'lucide-react';
import { Modal } from '@/components/ui';
import { ApiClientError } from '@/lib/client';
import { formatBytes } from '@/lib/money';
import { cn } from '@/lib/utils';
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MIME, isImageMime } from '@/lib/dev-tasks-shared';
import type { Attachment } from './types';

export const fileUrl = (id: string, download = false) => `/api/tasks/attachments/${id}${download ? '?download=1' : ''}`;

/** فایل‌های نامعتبر را جدا می‌کند تا کاربر پیش از ارسال بداند کدام فایل پذیرفته نمی‌شود */
export function checkFiles(files: File[]): { ok: File[]; errors: string[] } {
  const ok: File[] = [];
  const errors: string[] = [];
  for (const f of files) {
    if (!ATTACHMENT_MIME[f.type]) errors.push(`قالب «${f.name}» پشتیبانی نمی‌شود.`);
    else if (f.size > ATTACHMENT_MAX_BYTES) errors.push(`«${f.name}» بیش از ${formatBytes(ATTACHMENT_MAX_BYTES, 0)} است.`);
    else ok.push(f);
  }
  return { ok, errors };
}

/** فایل‌های چسبانده‌شده از کلیپ‌بورد (مثلاً اسکرین‌شات با Ctrl+V) */
export function filesFromClipboard(e: React.ClipboardEvent): File[] {
  const out: File[] = [];
  for (const item of Array.from(e.clipboardData?.items ?? [])) {
    if (item.kind === 'file') {
      const f = item.getAsFile();
      if (f) {
        // نام پیش‌فرض کلیپ‌بورد «image.png» است؛ نام گویاتر با زمان
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        out.push(new File([f], f.name && f.name !== 'image.png' ? f.name : `screenshot-${stamp}.png`, { type: f.type }));
      }
    }
  }
  return out;
}

export async function uploadFiles(taskId: string, files: File[], forComment = false): Promise<Attachment[]> {
  if (!files.length) return [];
  const form = new FormData();
  for (const f of files) form.append('files', f);
  if (forComment) form.append('forComment', '1');

  let res: Response;
  try {
    res = await fetch(`/api/tasks/${taskId}/attachments`, { method: 'POST', body: form, credentials: 'same-origin' });
  } catch {
    throw new ApiClientError('ارسال فایل انجام نشد. اتصال اینترنت را بررسی کنید.', 0, 'network');
  }
  const json = (await res.json().catch(() => null)) as
    | { ok: boolean; data?: { items: Attachment[] }; error?: { message: string } }
    | null;
  if (!res.ok || !json?.ok) {
    throw new ApiClientError(json?.error?.message ?? `خطای ${res.status} در ارسال فایل.`, res.status);
  }
  return json.data?.items ?? [];
}

/** ناحیه انتخاب فایل با کلیک یا کشیدن و رها کردن */
export function FileDrop({
  onFiles,
  compact,
  label = 'فایل یا اسکرین‌شات را اینجا رها کنید، یا کلیک کنید',
}: {
  onFiles: (files: File[]) => void;
  compact?: boolean;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const accept = Object.keys(ATTACHMENT_MIME).join(',');

  const picker = (
    <input
      ref={input}
      type="file"
      multiple
      accept={accept}
      className="hidden"
      onChange={(e) => {
        onFiles(Array.from(e.target.files ?? []));
        e.target.value = '';
      }}
    />
  );

  if (compact) {
    return (
      <>
        {picker}
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="tap-target inline-flex items-center gap-1 rounded-lg px-2 text-xs muted transition hover:bg-[var(--surface-2)]"
          title="پیوست فایل"
        >
          <Paperclip size={15} /> پیوست
        </button>
      </>
    );
  }

  return (
    <div
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles(Array.from(e.dataTransfer.files ?? []));
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') input.current?.click();
      }}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-5 text-center transition',
        over ? 'border-[var(--color-brand-500)] bg-[var(--surface-2)]' : 'hover:bg-[var(--surface-2)]',
      )}
    >
      {picker}
      <UploadCloud size={22} className="muted" />
      <span className="text-xs font-semibold">{label}</span>
      <span className="text-[11px] muted">
        تصویر، ویدیو، PDF، متن یا ZIP — هر فایل تا {formatBytes(ATTACHMENT_MAX_BYTES, 0)}. اسکرین‌شات را با Ctrl+V هم می‌توانید بچسبانید.
      </span>
    </div>
  );
}

/** پیش‌نمایش فایل‌هایی که هنوز ارسال نشده‌اند */
export function PendingFiles({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) {
  const urls = useMemo(() => files.map((f) => (isImageMime(f.type) ? URL.createObjectURL(f) : null)), [files]);
  useEffect(() => () => urls.forEach((u) => u && URL.revokeObjectURL(u)), [urls]);

  if (!files.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f, i) => (
        <div key={`${f.name}-${i}`} className="relative flex items-center gap-2 rounded-lg border p-1.5 pl-7 text-[11px]">
          {urls[i] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urls[i]!} alt="" className="h-9 w-9 rounded object-cover" />
          ) : (
            <FileText size={18} className="muted" />
          )}
          <span className="max-w-36 truncate">{f.name}</span>
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="absolute left-1 top-1/2 -translate-y-1/2 rounded p-1 muted hover:text-red-500"
            aria-label="حذف"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** گالری پیوست‌های ذخیره‌شده با نمایش بزرگ تصویرها */
export function AttachmentGrid({
  items,
  canDelete,
  onDelete,
  small,
}: {
  items: Attachment[];
  canDelete?: (a: Attachment) => boolean;
  onDelete?: (a: Attachment) => void;
  small?: boolean;
}) {
  const [preview, setPreview] = useState<Attachment | null>(null);
  if (!items.length) return null;

  return (
    <>
      <div className={cn('grid gap-2', small ? 'grid-cols-3 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4')}>
        {items.map((a) => {
          const image = isImageMime(a.mime);
          const video = a.mime.startsWith('video/');
          return (
            <div key={a.id} className="group relative overflow-hidden rounded-xl border">
              {image ? (
                <button type="button" onClick={() => setPreview(a)} className="block w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fileUrl(a.id)}
                    alt={a.name}
                    loading="lazy"
                    className={cn('w-full bg-[var(--surface-2)] object-cover', small ? 'h-20' : 'h-28')}
                  />
                </button>
              ) : (
                <a
                  href={fileUrl(a.id, !video)}
                  target={video ? '_blank' : undefined}
                  rel="noopener noreferrer"
                  className={cn('flex flex-col items-center justify-center gap-1 surface-2', small ? 'h-20' : 'h-28')}
                >
                  {video ? <Film size={22} className="muted" /> : <FileText size={22} className="muted" />}
                  <span className="text-[10px] uppercase muted">{a.name.split('.').pop()}</span>
                </a>
              )}
              <div className="flex items-center gap-1 border-t px-2 py-1">
                <span className="min-w-0 flex-1 truncate text-[10px]" title={a.name}>
                  {a.name}
                </span>
                <a href={fileUrl(a.id, true)} className="rounded p-0.5 muted hover:opacity-70" title="دانلود">
                  <Download size={12} />
                </a>
                {canDelete?.(a) && onDelete ? (
                  <button
                    type="button"
                    onClick={() => onDelete(a)}
                    className="rounded p-0.5 muted hover:text-red-500"
                    title="حذف"
                  >
                    <Trash2 size={12} />
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.name ?? ''} size="lg">
        {preview ? (
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fileUrl(preview.id)} alt={preview.name} className="mx-auto max-h-[70vh] w-auto rounded-lg" />
            <div className="flex justify-between text-xs muted">
              <span>{formatBytes(preview.size, 1)}</span>
              <a href={fileUrl(preview.id)} target="_blank" rel="noopener noreferrer" className="text-[var(--color-brand-600)] hover:underline">
                باز کردن در زبانه جدید
              </a>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
