'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Upload, Trash2, Sparkles, Pencil, ExternalLink, Target, MousePointerClick, FileSpreadsheet } from 'lucide-react';
import { Alert, Badge, Button, Card, EmptyState } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, apiDelete, errorMessage, fetcher } from '@/lib/client';
import { faDate } from '@/lib/utils';
import { ImproveModal } from './improve-modal';
import { rangeText, rangeLabelFa } from './dashboard';
import type { ImportInfo, SeoResponse } from './types';

const fa = (n: number) => new Intl.NumberFormat('fa-IR').format(n);
const faDec = (n: number, d = 1) =>
  new Intl.NumberFormat('fa-IR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const pct = (n: number) => `${faDec(n * 100, 1)}٪`;

/**
 * فرصت‌های صفحه اول: مقاله‌هایی که با کمی بهتر شدن به صفحه اول گوگل
 * می‌رسند، و بارگذاری خروجی سرچ کنسول که این فهرست از آن ساخته می‌شود.
 */
export function SeoOpportunities({ data, onRefresh }: { data: SeoResponse; onRefresh: () => void }) {
  const [improveId, setImproveId] = useState<string | null>(null);
  const near = data.opportunities.filter((o) => o.kind === 'near');
  const ctr = data.opportunities.filter((o) => o.kind === 'ctr');

  return (
    <div className="space-y-4">
      {data.source !== 'api' ? <ImportCard onUploaded={onRefresh} /> : null}

      {!data.search ? null : data.opportunities.length === 0 ? (
        <Card title="مقاله‌های نزدیک صفحه اول">
          <EmptyState
            icon={<Target size={28} />}
            title="فعلاً مقاله‌ای در جایگاه ۸ تا ۲۰ نیست"
            description="یا هنوز گوگل مقاله‌ها را کم نشان داده، یا همه در صفحه اول‌اند. هر ماه با خروجی تازه دوباره نگاه کنید."
          />
        </Card>
      ) : (
        <>
          {near.length ? (
            <Card
              title="مقاله‌های نزدیک صفحه اول"
              description={`جایگاه ۸ تا ۲۰ (${rangeText(data)}). بیشترین فرصت بالاست: با کامل‌تر کردن همین مقاله‌ها، بی‌آنکه مقاله تازه بنویسید، به صفحه اول می‌رسید.`}
            >
              <OpportunityList rows={near} onImprove={setImproveId} />
            </Card>
          ) : null}

          {ctr.length ? (
            <Card
              title="در صفحه اول، ولی کم‌کلیک"
              description="گوگل نشانشان می‌دهد ولی کمتر از معمولِ جایگاهشان کلیک می‌خورند. معمولاً عنوان سئو و توضیح متا باید مشخص‌تر و جذاب‌تر شود."
            >
              <OpportunityList rows={ctr} onImprove={setImproveId} />
            </Card>
          ) : null}
        </>
      )}

      {data.nearQueries.length ? (
        <Card
          title="عبارت‌های نزدیک صفحه اول"
          description="جستجوهایی که سایت با آن‌ها در جایگاه ۸ تا ۲۰ دیده می‌شود. اگر مقاله‌ای این عبارت را کامل پوشش نمی‌دهد، همان را بهتر کنید؛ برای عبارتی که هیچ مقاله‌ای درباره‌اش نیست، از «تولید خودکار» موضوع تازه بسازید."
        >
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>عبارت</th>
                  <th>جایگاه</th>
                  <th>نمایش</th>
                  <th>کلیک</th>
                </tr>
              </thead>
              <tbody>
                {data.nearQueries.map((row) => (
                  <tr key={row.keys[0]}>
                    <td className="max-w-[280px] truncate text-xs">{row.keys[0]}</td>
                    <td className="tabular text-xs">{faDec(row.position)}</td>
                    <td className="tabular text-xs">{fa(row.impressions)}</td>
                    <td className="tabular text-xs">{fa(row.clicks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <ImproveModal postId={improveId} onClose={() => setImproveId(null)} onChanged={onRefresh} />
    </div>
  );
}

function OpportunityList({ rows, onImprove }: { rows: SeoResponse['opportunities']; onImprove: (id: string) => void }) {
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.postId} className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 sm:flex-1">
            <p className="text-xs leading-6 font-bold sm:truncate">{row.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] muted">
              <span>
                جایگاه <b className="tabular">{faDec(row.position)}</b>
              </span>
              <span>{fa(row.impressions)} نمایش</span>
              <span>{fa(row.clicks)} کلیک</span>
              <span>نرخ کلیک {pct(row.ctr)}</span>
              {row.potential > 0 ? (
                <Badge tone="ok">
                  <MousePointerClick size={10} /> حدود {fa(row.potential)} کلیک بیشتر
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button size="sm" icon={<Sparkles size={13} />} onClick={() => onImprove(row.postId)}>
              بهبود با هوش مصنوعی
            </Button>
            <Link href={`/admin/blog/${row.postId}`} className="btn btn-ghost btn-sm" aria-label="ویرایش دستی">
              <Pencil size={13} />
            </Link>
            <Link href={`/blog/${row.slug}`} target="_blank" className="btn btn-ghost btn-sm" aria-label="دیدن در سایت">
              <ExternalLink size={13} />
            </Link>
          </div>
        </div>
      ))}
      <p className="text-[10px] muted">
        «کلیک بیشتر» تخمینی است: اگر مقاله به جایگاه ۳ برسد (یا در جایگاه فعلی، نرخ کلیک معمول را بگیرد)، با همین تعداد نمایش.
      </p>
    </div>
  );
}

type ImportRow = ImportInfo & { postTitle: string | null };

/** بارگذاری خروجی بخش Performance سرچ کنسول */
function ImportCard({ onUploaded }: { onUploaded: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { data, mutate } = useSWR<{ imports: ImportRow[] }>('/api/admin/seo/import', fetcher, { revalidateOnFocus: false });

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const form = new FormData();
    for (const f of Array.from(files)) form.append('file', f);
    setUploading(true);
    try {
      const res = await api<{ message: string; recognized: string[]; notes: string[] }>('/api/admin/seo/import', {
        method: 'POST',
        body: form,
      });
      toast.success(`${res.message} (${res.recognized.join('، ')})`);
      for (const note of res.notes) toast.error(note);
      await mutate();
      onUploaded();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove(row: ImportRow) {
    if (!window.confirm('این خروجی حذف شود؟')) return;
    setDeleting(row.id);
    try {
      await apiDelete(`/api/admin/seo/import/${row.id}`);
      await mutate();
      onUploaded();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleting(null);
    }
  }

  const imports = data?.imports ?? [];

  return (
    <Card
      title="بارگذاری آمار سرچ کنسول"
      description="API سرچ کنسول از این سرور در دسترس نیست؛ آمار را ماهی یک بار از خود سرچ کنسول دانلود و اینجا بارگذاری کنید."
      action={
        <>
          <input
            ref={input}
            type="file"
            accept=".zip,.csv,.xlsx"
            multiple
            className="hidden"
            onChange={(e) => upload(e.target.files)}
          />
          <Button size="sm" icon={<Upload size={14} />} loading={uploading} onClick={() => input.current?.click()}>
            انتخاب فایل
          </Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-xs font-bold">آمار کل سایت (ماهی یک بار)</p>
          <ol className="mt-2 list-decimal space-y-1 pr-5 text-[11px] leading-6 muted">
            <li>
              در{' '}
              <a href="https://search.google.com/search-console" target="_blank" rel="noopener" className="text-[var(--color-brand-600)] hover:underline">
                سرچ کنسول
              </a>{' '}
              به بخش <b>Performance</b> (عملکرد) بروید.
            </li>
            <li>
              بازه را روی <b>Last 3 months</b> بگذارید.
            </li>
            <li>
              بالای صفحه دکمه <b>Export</b> و بعد <b>Download CSV</b> (یا Download Excel) را بزنید.
            </li>
            <li>همان فایل ZIP را بدون باز کردن، با «انتخاب فایل» اینجا بارگذاری کنید.</li>
          </ol>
        </div>
        <div>
          <p className="text-xs font-bold">عبارت‌های یک مقاله (اختیاری، دقیق‌تر)</p>
          <ol className="mt-2 list-decimal space-y-1 pr-5 text-[11px] leading-6 muted">
            <li>
              در همان Performance روی <b>+ New</b> و بعد <b>Page</b> بزنید و نشانی کامل مقاله را بدهید.
            </li>
            <li>
              Export و Download CSV را بزنید و فایل را اینجا بارگذاری کنید.
            </li>
            <li>به همان مقاله وصل می‌شود و «بهبود با هوش مصنوعی» از عبارت‌های واقعی همان صفحه استفاده می‌کند.</li>
          </ol>
        </div>
      </div>

      {imports.length ? (
        <div className="mt-4 space-y-1.5 border-t pt-3">
          {imports.slice(0, 8).map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[11px]">
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <FileSpreadsheet size={13} className="shrink-0 muted" />
                <span className="min-w-0 leading-6 break-words">
                  {row.scope === 'page' ? (
                    <>
                      <Badge tone="muted">یک مقاله</Badge> {row.postTitle ?? row.pageUrl ?? '—'}
                    </>
                  ) : (
                    <Badge tone="ok">کل سایت</Badge>
                  )}{' '}
                  <span className="muted">
                    {row.rangeLabel ? `${rangeLabelFa(row.rangeLabel)} · ` : ''}
                    {fa(row.clicks)} کلیک · {fa(row.impressions)} نمایش · بارگذاری {faDate(row.createdAt)}
                  </span>
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 size={12} />}
                loading={deleting === row.id}
                onClick={() => remove(row)}
                aria-label="حذف"
              />
            </div>
          ))}
        </div>
      ) : (
        <Alert tone="info" title="هنوز فایلی بارگذاری نشده">
          بعد از بارگذاری، جایگاه و کلیک هر مقاله در داشبورد و جدول «سئوی مقاله‌ها» دیده می‌شود و فهرست مقاله‌های نزدیک صفحه
          اول همین‌جا ساخته می‌شود.
        </Alert>
      )}
    </Card>
  );
}
