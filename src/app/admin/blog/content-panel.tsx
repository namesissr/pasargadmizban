'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  Bot,
  Play,
  Check,
  X,
  Trash2,
  ExternalLink,
  AlertTriangle,
  Gauge,
  Coins,
  Plus,
  Lightbulb,
  RotateCcw,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  NumberInput,
  Select,
  Stat,
  Toggle,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiDelete, apiPatch, apiPost, errorMessage, fetcher } from '@/lib/client';
import { faDateTime, faRelative } from '@/lib/utils';
import { scoreTone, type AdminCategory } from './types';

type JobStatus = 'PENDING' | 'RESEARCHING' | 'DRAFTED' | 'PUBLISHED' | 'REJECTED' | 'FAILED';

type ContentJob = {
  id: string;
  keyword: string;
  source: string;
  score: number;
  status: JobStatus;
  seoScore: number | null;
  wordCount: number | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  post: { id: string; slug: string; title: string; status: string } | null;
};

type ContentResponse = {
  items: ContentJob[];
  meta: { total: number; page: number; perPage: number; totalPages: number };
  stats: {
    total: number;
    published: number;
    drafted: number;
    rejected: number;
    failed: number;
    today: number;
    tokens30d: { input: number; output: number };
  };
  config: { apiKeyReady: boolean; model: string; serpProvider: string; serpKeyReady: boolean };
};

type SettingsResponse = {
  settings: {
    contentAutoEnabled: boolean;
    contentPerDay: number;
    contentAutoPublish: boolean;
    contentMinSeoScore: number;
    contentMinWords: number;
    contentFallbackCategory: string;
    contentRunHour: number;
  };
};

const STATUS_FA: Record<JobStatus, { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }> = {
  PENDING: { label: 'در صف', tone: 'muted' },
  RESEARCHING: { label: 'در حال تحقیق', tone: 'warn' },
  DRAFTED: { label: 'پیش‌نویس، منتظر تأیید', tone: 'warn' },
  PUBLISHED: { label: 'منتشرشده', tone: 'ok' },
  REJECTED: { label: 'ردشده', tone: 'bad' },
  FAILED: { label: 'ناموفق', tone: 'bad' },
};

const fa = (n: number) => new Intl.NumberFormat('fa-IR').format(n);

/**
 * خط تولید محتوا.
 *
 * یادآوری مهمی که در این صفحه هم نوشته شده: این سیستم مقاله سایت‌های دیگر
 * را برنمی‌دارد. موضوع‌های پرجستجوی گوگل را پیدا می‌کند و برای همان‌ها
 * مقاله تازه می‌نویسد.
 */
export function ContentPanel() {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<ContentResponse>('/api/admin/blog/content?perPage=20', fetcher);
  const { data: settingsData, mutate: mutateSettings } = useSWR<SettingsResponse>('/api/admin/settings', fetcher);
  const { data: catData } = useSWR<{ items: AdminCategory[] }>('/api/admin/blog/categories', fetcher);

  const [form, setForm] = useState<SettingsResponse['settings'] | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [running, setRunning] = useState(false);
  const [runCount, setRunCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<ContentJob | null>(null);
  const [rejecting, setRejecting] = useState<ContentJob | null>(null);
  const [keyword, setKeyword] = useState('');
  const [keywordCategory, setKeywordCategory] = useState('');
  const [queueing, setQueueing] = useState<'queue' | 'now' | null>(null);

  useEffect(() => {
    if (settingsData?.settings && !form) {
      const s = settingsData.settings;
      setForm({
        contentAutoEnabled: s.contentAutoEnabled,
        contentPerDay: s.contentPerDay,
        contentAutoPublish: s.contentAutoPublish,
        contentMinSeoScore: s.contentMinSeoScore,
        contentMinWords: s.contentMinWords,
        contentFallbackCategory: s.contentFallbackCategory,
        contentRunHour: s.contentRunHour,
      });
    }
  }, [settingsData, form]);

  const set = <K extends keyof SettingsResponse['settings']>(key: K, value: SettingsResponse['settings'][K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  async function saveSettings() {
    if (!form) return;
    setSavingSettings(true);
    try {
      await apiPatch('/api/admin/settings', form);
      toast.success('تنظیمات خط تولید ذخیره شد.');
      mutateSettings();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSavingSettings(false);
    }
  }

  async function runNow() {
    setRunning(true);
    try {
      const res = await apiPost<{ message: string }>('/api/admin/blog/content', { count: runCount });
      toast.success(res.message);
      mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRunning(false);
    }
  }

  /**
   * افزودن موضوع دستی.
   *
   * کشف خودکار کارش را می‌کند، ولی عبارت‌هایی که مشتری‌ها در تیکت می‌پرسند
   * ارزش بیشتری دارند؛ موضوع دستی اول نوبت نوشته می‌شود.
   */
  async function enqueue(runNowToo: boolean) {
    const clean = keyword.trim();
    if (clean.length < 3) return;
    setQueueing(runNowToo ? 'now' : 'queue');
    try {
      const res = await apiPost<{ message: string }>('/api/admin/blog/content/keyword', {
        keyword: clean,
        categorySlug: keywordCategory || undefined,
        runNow: runNowToo,
      });
      toast.success(res.message);
      setKeyword('');
      mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setQueueing(null);
    }
  }

  /** موضوع ردشده یا ناموفق را دوباره به صف می‌فرستد */
  async function retry(job: ContentJob) {
    setBusy(true);
    try {
      const res = await apiPatch<{ message: string }>(`/api/admin/blog/content/${job.id}`, { action: 'retry' });
      toast.success(res.message);
      mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function retryAll() {
    setBusy(true);
    try {
      const res = await apiPost<{ message: string }>('/api/admin/blog/content/retry');
      toast.success(res.message);
      mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function approve(job: ContentJob) {
    setBusy(true);
    try {
      const res = await apiPatch<{ message: string }>(`/api/admin/blog/content/${job.id}`, { action: 'publish' });
      toast.success(res.message);
      mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!rejecting) return;
    setBusy(true);
    try {
      const res = await apiPatch<{ message: string }>(`/api/admin/blog/content/${rejecting.id}`, { action: 'reject' });
      toast.success(res.message);
      setRejecting(null);
      mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeJob() {
    if (!removing) return;
    setBusy(true);
    try {
      const res = await apiDelete<{ message: string }>(`/api/admin/blog/content/${removing.id}`);
      toast.success(res.message);
      setRemoving(null);
      mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (isLoading && !data) return <LoadingBlock />;

  const stats = data?.stats;
  const config = data?.config;
  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      {!config?.apiKeyReady ? (
        <Alert tone="warning" title="کلید هوش مصنوعی تنظیم نشده است">
          برای تولید مقاله، متغیر <span className="ltr mono">ANTHROPIC_API_KEY</span> را در فایل{' '}
          <span className="ltr mono">.env</span> سرور بگذارید و اپلیکیشن و ورکر را دوباره راه‌اندازی کنید. بدون آن،
          خط تولید اجرا نمی‌شود.
        </Alert>
      ) : null}

      <Alert tone="info" title="این سیستم مقاله کسی را کپی نمی‌کند">
        موضوع‌هایی که مردم در گوگل زیاد جستجو می‌کنند پیدا می‌شود، پرسش‌های واقعی کاربران استخراج می‌شود و بعد
        مقاله‌ای <b>تازه و با زبان خودمان</b> برای همان موضوع نوشته می‌شود. بازنشر یا بازنویسی مقاله سایت‌های دیگر،
        هم نقض حق نشر است و هم گوگل آن را محتوای کپی می‌شناسد و جریمه می‌کند.
      </Alert>

      {stats ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="منتشرشده" value={fa(stats.published)} tone="ok" icon={<Bot size={15} />} />
          <Stat label="منتظر تأیید" value={fa(stats.drafted)} tone="warn" />
          <Stat label="ردشده یا ناموفق" value={fa(stats.rejected + stats.failed)} hint="از دروازه کیفیت نگذشتند" />
          <Stat
            label="مصرف توکن ۳۰ روز"
            value={fa(stats.tokens30d.input + stats.tokens30d.output)}
            hint={`ورودی ${fa(stats.tokens30d.input)} • خروجی ${fa(stats.tokens30d.output)}`}
            icon={<Coins size={15} />}
          />
        </div>
      ) : null}

      {/* تنظیمات */}
      {form ? (
        <Card
          title="تنظیمات خط تولید"
          description="روزی چند مقاله، در چه ساعتی و با چه حد کیفیتی ساخته شود."
          action={
            <Button size="sm" loading={savingSettings} onClick={saveSettings}>
              ذخیره تنظیمات
            </Button>
          }
        >
          <div className="space-y-3.5">
            <Toggle
              checked={form.contentAutoEnabled}
              onChange={(v) => set('contentAutoEnabled', v)}
              label="تولید روزانه مقاله فعال باشد"
              description="ورکر هر روز در ساعت تعیین‌شده، موضوع‌های تازه پیدا می‌کند و مقاله می‌سازد."
            />

            <Toggle
              checked={form.contentAutoPublish}
              onChange={(v) => set('contentAutoPublish', v)}
              label="مقاله‌ها خودکار منتشر شوند"
              description="خاموش (پیشنهاد ما): مقاله پیش‌نویس می‌ماند و شما تأییدش می‌کنید. روشن: بدون بازبینی روی سایت می‌رود."
            />

            {form.contentAutoPublish ? (
              <Alert tone="warning" title="انتشار بدون بازبینی">
                روزی سه مقاله بی‌بازبینی، اگر یکی‌شان خطای فنی یا حرف نادرست داشته باشد، به اعتبار سایت لطمه می‌زند.
                دست‌کم دو هفته اول را با حالت پیش‌نویس کار کنید.
              </Alert>
            ) : null}

            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="تعداد در روز" hint="۱ تا ۱۰">
                <NumberInput value={form.contentPerDay} onValueChange={(v) => set('contentPerDay', v)} min={1} max={10} />
              </Field>
              <Field label="ساعت اجرا (تهران)" hint="۰ تا ۲۳">
                <NumberInput value={form.contentRunHour} onValueChange={(v) => set('contentRunHour', v)} min={0} max={23} />
              </Field>
              <Field label="حداقل امتیاز سئو" hint="زیر این عدد منتشر نمی‌شود">
                <NumberInput
                  value={form.contentMinSeoScore}
                  onValueChange={(v) => set('contentMinSeoScore', v)}
                  min={0}
                  max={100}
                />
              </Field>
              <Field label="حداقل شمار کلمه">
                <NumberInput value={form.contentMinWords} onValueChange={(v) => set('contentMinWords', v)} min={300} max={5000} />
              </Field>
            </div>

            <Field label="دسته پیش‌فرض" hint="اگر موضوع به هیچ دسته‌ای نخورد، مقاله اینجا می‌رود.">
              <Select
                value={form.contentFallbackCategory}
                onChange={(e) => set('contentFallbackCategory', e.target.value)}
              >
                <option value="">— انتخاب خودکار —</option>
                {(catData?.items ?? []).map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="rounded-xl border p-3 text-[11px] leading-6 muted">
              مدل نویسنده: <span className="ltr mono">{config?.model ?? '—'}</span> • سرویس نتایج گوگل:{' '}
              {config?.serpProvider === 'none' || !config?.serpKeyReady ? (
                <>
                  تنظیم نشده (تحقیق با پیشنهادهای جستجوی گوگل انجام می‌شود). برای تحقیق دقیق‌تر، متغیرهای{' '}
                  <span className="ltr mono">CONTENT_SERP_PROVIDER</span> و{' '}
                  <span className="ltr mono">CONTENT_SERP_KEY</span> را تنظیم کنید.
                </>
              ) : (
                <span className="ltr mono">{config.serpProvider}</span>
              )}
            </div>
          </div>
        </Card>
      ) : null}

      {/* افزودن موضوع دستی */}
      <Card
        title="افزودن موضوع به صف"
        description="عبارتی که می‌دانید مشتری‌هایتان جستجو می‌کنند را اینجا بنویسید؛ پیش از موضوع‌های کشف‌شده نوشته می‌شود."
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field label="کلیدواژه هدف" className="min-w-56 flex-1" hint="همان‌طور که کاربر در گوگل می‌نویسد.">
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              maxLength={120}
              placeholder="خرید سرور مجازی ایران"
              onKeyDown={(e) => {
                if (e.key === 'Enter') enqueue(false);
              }}
            />
          </Field>
          <Field label="دسته پیشنهادی" className="w-48">
            <Select value={keywordCategory} onChange={(e) => setKeywordCategory(e.target.value)}>
              <option value="">— انتخاب خودکار —</option>
              {(catData?.items ?? []).map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            variant="secondary"
            icon={<Plus size={15} />}
            loading={queueing === 'queue'}
            disabled={keyword.trim().length < 3 || queueing !== null}
            onClick={() => enqueue(false)}
          >
            افزودن به صف
          </Button>
          <Button
            icon={<Play size={15} />}
            loading={queueing === 'now'}
            disabled={keyword.trim().length < 3 || queueing !== null || !config?.apiKeyReady}
            onClick={() => enqueue(true)}
          >
            همین حالا بنویس
          </Button>
        </div>
        <p className="mt-3 flex items-start gap-1.5 rounded-xl p-3 text-[11px] leading-6 surface-2">
          <Lightbulb size={13} className="mt-1 shrink-0 text-amber-500" />
          <span>
            «همین حالا بنویس» چند دقیقه طول می‌کشد و صفحه باید باز بماند. «افزودن به صف» سبک‌تر است: موضوع در
            اجرای روزانه بعدی نوشته می‌شود.
          </span>
        </p>
      </Card>

      {/* اجرای دستی */}
      <Card title="تولید همین حالا" description="برای آزمایش یا پر کردن فوری وبلاگ، بدون انتظار برای اجرای روزانه.">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="تعداد مقاله" className="w-32" hint="هر مقاله حدود یک دقیقه">
            <NumberInput value={runCount} onValueChange={setRunCount} min={1} max={5} />
          </Field>
          <Button icon={<Play size={15} />} loading={running} disabled={!config?.apiKeyReady} onClick={runNow}>
            شروع تولید
          </Button>
          {running ? <span className="text-[11px] muted">در حال تحقیق و نوشتن… این چند دقیقه طول می‌کشد.</span> : null}
        </div>
      </Card>

      {/* صف و تاریخچه */}
      <Card
        title="صف تولید"
        description="هر ردیف، یک موضوع از کشف تا انتشار."
        action={
          stats && stats.rejected + stats.failed > 0 ? (
            <Button size="sm" variant="secondary" icon={<RotateCcw size={14} />} loading={busy} onClick={retryAll}>
              تلاش دوباره برای ردشده‌ها ({fa(stats.rejected + stats.failed)})
            </Button>
          ) : null
        }
        bodyClassName={items.length ? 'space-y-2.5' : undefined}
      >
        {items.length === 0 ? (
          <EmptyState
            icon={<Bot size={28} />}
            title="هنوز چیزی تولید نشده"
            description="تنظیمات را ذخیره کنید و یک بار «تولید همین حالا» را بزنید تا نتیجه را ببینید."
          />
        ) : (
          items.map((job) => {
            const st = STATUS_FA[job.status];
            return (
              <div key={job.id} className="rounded-xl border p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold">{job.keyword}</span>
                      <Badge tone={st.tone}>{st.label}</Badge>
                      {job.seoScore !== null ? (
                        <Badge tone={scoreTone(job.seoScore)}>
                          <Gauge size={10} /> {fa(job.seoScore)}
                        </Badge>
                      ) : null}
                      {job.wordCount ? <Badge tone="muted">{fa(job.wordCount)} کلمه</Badge> : null}
                    </div>

                    {job.post ? (
                      <p className="mt-1.5 text-xs">
                        <Link href={`/admin/blog/${job.post.id}`} className="font-semibold hover:underline">
                          {job.post.title}
                        </Link>
                      </p>
                    ) : null}

                    {job.error ? (
                      <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-6 text-amber-600">
                        <AlertTriangle size={12} className="mt-1 shrink-0" /> {job.error}
                      </p>
                    ) : null}

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] muted">
                      <span>{faDateTime(job.createdAt)}</span>
                      <span>{faRelative(job.finishedAt ?? job.createdAt)}</span>
                      <span>منبع: {job.source}</span>
                      {job.outputTokens ? <span className="tabular">توکن خروجی: {fa(job.outputTokens)}</span> : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {job.post ? (
                      <Link href={`/blog/${job.post.slug}`} target="_blank" className="btn btn-ghost btn-sm" aria-label="دیدن مقاله">
                        <ExternalLink size={14} />
                      </Link>
                    ) : null}
                    {job.status === 'REJECTED' || job.status === 'FAILED' ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<RotateCcw size={14} />}
                        loading={busy}
                        onClick={() => retry(job)}
                      >
                        تلاش دوباره
                      </Button>
                    ) : null}
                    {job.status === 'DRAFTED' ? (
                      <>
                        <Button size="sm" icon={<Check size={14} />} loading={busy} onClick={() => approve(job)}>
                          تأیید و انتشار
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<X size={14} />}
                          className="hover:text-red-500"
                          onClick={() => setRejecting(job)}
                        >
                          رد
                        </Button>
                      </>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={14} />}
                      className="hover:text-red-500"
                      onClick={() => setRemoving(job)}
                      aria-label="حذف از صف"
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </Card>

      <ConfirmModal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        onConfirm={reject}
        loading={busy}
        title="رد مقاله"
        message={`مقاله ساخته‌شده برای «${rejecting?.keyword ?? ''}» حذف می‌شود و این موضوع دوباره انتخاب نمی‌شود.`}
        confirmLabel="رد و حذف"
      />

      <ConfirmModal
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={removeJob}
        loading={busy}
        title="حذف از صف"
        message={`ردیف «${removing?.keyword ?? ''}» از صف حذف می‌شود. مقاله ساخته‌شده (اگر هست) دست‌نخورده می‌ماند و این موضوع می‌تواند دوباره انتخاب شود.`}
        confirmLabel="حذف از صف"
      />
    </div>
  );
}
