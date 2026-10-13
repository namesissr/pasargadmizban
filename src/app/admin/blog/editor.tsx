'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import {
  Save,
  Send,
  Eye,
  Pencil,
  Plus,
  Trash2,
  Wand2,
  ExternalLink,
  HelpCircle,
  Clock,
  ImagePlus,
  Shuffle,
  X,
  ListOrdered,
  Workflow,
  Columns2,
  ListChecks,
  Cpu,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  Toggle,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiPatch, apiPost, errorFields, errorMessage, fetcher } from '@/lib/client';
import { renderMarkdown } from '@/lib/markdown';
import { seoReport } from '@/lib/seo-score';
import { slugify } from '@/lib/slugify';
import { autoCoverUrl, coverOptions, isAutoCover } from '@/lib/images/urls';
import { SeoPanel } from './seo-panel';
import type { AdminCategory, AdminPost, AdminTag, Faq, PostStatus } from './types';

const STATUS_OPTIONS: { value: PostStatus; label: string; hint: string }[] = [
  { value: 'DRAFT', label: 'پیش‌نویس', hint: 'فقط شما می‌بینید؛ در سایت و نقشه سایت نمی‌آید.' },
  { value: 'SCHEDULED', label: 'زمان‌بندی‌شده', hint: 'در تاریخ انتخابی خودکار منتشر می‌شود.' },
  { value: 'PUBLISHED', label: 'منتشرشده', hint: 'همین حالا در سایت و نقشه سایت دیده می‌شود.' },
];

/** تبدیل تاریخ ISO به مقدار input[type=datetime-local] با وقت محلی */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const SAMPLE = `مقدمه کوتاه بنویسید و همان ابتدا بگویید خواننده با خواندن این مقاله چه چیزی به دست می‌آورد.

## نخستین سرفصل

متن توضیح…

- نکته اول
- نکته دوم

:::tip نکته
یک توصیه کاربردی که ارزش برجسته شدن دارد.
:::

## سرفصل دوم

\`\`\`bash
apt update && apt upgrade -y
\`\`\`

برای ساخت سرور به [صفحه ثبت‌نام](/register) بروید.
`;

/** قالب آماده هر نوع نمودار برای درج در متن */
const FIGURE_TEMPLATES: { kind: string; label: string; icon: React.ReactNode; body: string }[] = [
  {
    kind: 'steps',
    label: 'مراحل',
    icon: <ListOrdered size={13} />,
    body: ':::figure steps مراحل کار\nمرحله اول\nمرحله دوم\nمرحله سوم\n:::',
  },
  {
    kind: 'flow',
    label: 'جریان',
    icon: <Workflow size={13} />,
    body: ':::figure flow مسیر درخواست\nکاربر\nسرور\nدیتابیس\n:::',
  },
  {
    kind: 'compare',
    label: 'مقایسه',
    icon: <Columns2 size={13} />,
    body: ':::figure compare مقایسه دو گزینه\nگزینه الف | گزینه ب\nمعیار اول | مقدار الف | مقدار ب\nمعیار دوم | مقدار الف | مقدار ب\n:::',
  },
  {
    kind: 'checklist',
    label: 'چک‌لیست',
    icon: <ListChecks size={13} />,
    body: ':::figure checklist فهرست بررسی\nمورد اول\nمورد دوم\nمورد سوم\nمورد چهارم\n:::',
  },
  {
    kind: 'specs',
    label: 'مشخصات',
    icon: <Cpu size={13} />,
    body: ':::figure specs مشخصات پلن\n۲ هسته | پردازنده\n۴ گیگ | رم\n۸۰ گیگ | فضای NVMe\n:::',
  },
];

const TOPIC_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'تشخیص خودکار از عنوان' },
  { value: 'server', label: 'سرور' },
  { value: 'cloud', label: 'ابری' },
  { value: 'terminal', label: 'ترمینال و لینوکس' },
  { value: 'security', label: 'امنیت' },
  { value: 'network', label: 'شبکه و آی‌پی' },
  { value: 'speed', label: 'سرعت' },
  { value: 'database', label: 'دیتابیس و بکاپ' },
  { value: 'web', label: 'وب و دامنه' },
  { value: 'email', label: 'ایمیل' },
];

export function PostEditor({
  post,
  siteUrl,
  ownHosts = [],
}: {
  post?: AdminPost;
  siteUrl: string;
  /** دامنه‌های خودمان؛ لینک به پنل ابری هم لینک داخلی حساب می‌شود */
  ownHosts?: string[];
}) {
  const toast = useToast();
  const router = useRouter();
  const editMode = !!post;

  const { data: catData } = useSWR<{ items: AdminCategory[] }>('/api/admin/blog/categories', fetcher);
  const { data: tagData } = useSWR<{ items: AdminTag[] }>('/api/admin/blog/tags', fetcher);

  const [title, setTitle] = useState(post?.title ?? '');
  const [slug, setSlug] = useState(post?.slug ?? '');
  const [focusKeyword, setFocusKeyword] = useState(post?.focusKeyword ?? '');
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? '');
  const [content, setContent] = useState(post?.content ?? '');

  const [coverImage, setCoverImage] = useState(post?.coverImage ?? '');
  const [coverAlt, setCoverAlt] = useState(post?.coverAlt ?? '');

  const [metaTitle, setMetaTitle] = useState(post?.metaTitle ?? '');
  const [metaDescription, setMetaDescription] = useState(post?.metaDescription ?? '');
  const [keywords, setKeywords] = useState(post?.keywords ?? '');
  const [canonicalUrl, setCanonicalUrl] = useState(post?.canonicalUrl ?? '');
  const [ogImage, setOgImage] = useState(post?.ogImage ?? '');
  const [noindex, setNoindex] = useState(post?.noindex ?? false);

  const [status, setStatus] = useState<PostStatus>(post?.status ?? 'DRAFT');
  const [publishedAt, setPublishedAt] = useState(toLocalInput(post?.publishedAt ?? null));
  const [featured, setFeatured] = useState(post?.featured ?? false);

  const [categoryId, setCategoryId] = useState(post?.categoryId ?? '');
  const [tags, setTags] = useState<string[]>(post?.tags ?? []);
  const [tagDraft, setTagDraft] = useState('');

  const [authorName, setAuthorName] = useState(post?.authorName ?? '');
  const [authorTitle, setAuthorTitle] = useState(post?.authorTitle ?? '');
  const [authorBio, setAuthorBio] = useState(post?.authorBio ?? '');

  const [faqs, setFaqs] = useState<Faq[]>(() => {
    const raw = post?.faqs;
    return Array.isArray(raw)
      ? (raw as Faq[]).filter((f) => f && typeof f.q === 'string' && typeof f.a === 'string')
      : [];
  });

  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [helpOpen, setHelpOpen] = useState(false);

  const effectiveSlug = slug.trim() || slugify(focusKeyword || title);

  // امتیاز سئو همان لحظه تایپ، در مرورگر محاسبه می‌شود — همان منطقی که
  // سرور هنگام ذخیره اجرا می‌کند
  const report = useMemo(
    () =>
      seoReport({
        title,
        metaTitle,
        metaDescription,
        slug: effectiveSlug,
        excerpt,
        focusKeyword,
        content,
        coverImage,
        coverAlt,
        faqs,
        categoryId: categoryId || null,
        tags,
        ownHosts,
      }),
    [
      title,
      metaTitle,
      metaDescription,
      effectiveSlug,
      excerpt,
      focusKeyword,
      content,
      coverImage,
      coverAlt,
      faqs,
      categoryId,
      tags,
      ownHosts,
    ],
  );

  const preview = useMemo(() => renderMarkdown(content, { ownHosts }), [content, ownHosts]);

  /** درج قالب نمودار در جای مکان‌نما (یا انتهای متن) */
  function insertFigure(body: string) {
    const el = document.getElementById('post-content') as HTMLTextAreaElement | null;
    const at = el && document.activeElement === el ? el.selectionStart : content.length;
    const before = content.slice(0, at).replace(/\s*$/, '');
    const after = content.slice(at).replace(/^\s*/, '');
    const next = `${before}${before ? '\n\n' : ''}${body}\n\n${after}`;
    setContent(next);
    setTab('write');
    requestAnimationFrame(() => {
      const target = document.getElementById('post-content') as HTMLTextAreaElement | null;
      if (!target) return;
      const pos = (before ? before.length + 2 : 0) + body.length;
      target.focus();
      target.setSelectionRange(pos, pos);
    });
  }

  // ── کاور خودکار ──
  const categoryName = catData?.items.find((c) => c.id === categoryId)?.name ?? '';
  const autoCover = isAutoCover(coverImage);
  const coverOpts = coverOptions(coverImage);

  function makeAutoCover(variant = 0, topic: string | null = null) {
    setCoverImage(autoCoverUrl(effectiveSlug || 'post', { title: title.trim() || 'مقاله', category: categoryName, variant, topic }));
    if (!coverAlt.trim()) setCoverAlt(title.trim());
  }

  /**
   * پیش‌نمایش کاور خودکار از روی همین فرم (عنوان و دسته ذخیره‌نشده).
   * بذر طرح شناسه مقاله است، همان که مسیر عمومی به کار می‌برد؛ پس پیش‌نمایش
   * عیناً همان کاوری است که پس از ذخیره دیده می‌شود.
   */
  const coverPreview = useMemo(() => {
    if (!title.trim()) return '';
    const params = new URLSearchParams({
      title: title.trim(),
      seed: post?.id ?? title.trim(),
      category: categoryName,
      hint: [focusKeyword, ...tags].join(' '),
    });
    if (coverOpts.variant) params.set('n', String(coverOpts.variant));
    if (coverOpts.topic) params.set('t', coverOpts.topic);
    return `/media/blog/cover-preview?${params}`;
  }, [title, post?.id, categoryName, focusKeyword, tags, coverOpts.variant, coverOpts.topic]);

  function addTag(raw?: string) {
    const value = (raw ?? tagDraft).trim();
    if (!value) return;
    const list = value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    setTags((prev) => Array.from(new Set([...prev, ...list])).slice(0, 15));
    setTagDraft('');
  }

  async function save(nextStatus?: PostStatus) {
    const finalStatus = nextStatus ?? status;
    setBusy(true);
    setFields({});
    try {
      const payload = {
        title: title.trim(),
        slug: slug.trim() || undefined,
        excerpt: excerpt.trim() || undefined,
        content,
        coverImage: coverImage.trim() || undefined,
        coverAlt: coverAlt.trim() || undefined,
        metaTitle: metaTitle.trim() || undefined,
        metaDescription: metaDescription.trim() || undefined,
        focusKeyword: focusKeyword.trim() || undefined,
        keywords: keywords.trim() || undefined,
        canonicalUrl: canonicalUrl.trim() || undefined,
        ogImage: ogImage.trim() || undefined,
        noindex,
        faqs: faqs.filter((f) => f.q.trim() && f.a.trim()),
        status: finalStatus,
        publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null,
        featured,
        categoryId: categoryId || null,
        tags,
        authorName: authorName.trim() || undefined,
        authorTitle: authorTitle.trim() || undefined,
        authorBio: authorBio.trim() || undefined,
      };

      if (editMode) {
        const res = await apiPatch<{ message: string }>(`/api/admin/blog/posts/${post.id}`, payload);
        toast.success(res.message);
        setStatus(finalStatus);
        router.refresh();
      } else {
        const res = await apiPost<{ message: string; post: { id: string } }>('/api/admin/blog/posts', payload);
        toast.success(res.message);
        router.push(`/admin/blog/${res.post.id}`);
      }
    } catch (err) {
      setFields(errorFields(err));
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const canSave = title.trim().length >= 5 && content.trim().length >= 20;

  return (
    <div className="space-y-4">
      {/* نوار ابزار بالا */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status === 'PUBLISHED' ? 'ok' : status === 'SCHEDULED' ? 'warn' : 'muted'}>
            {STATUS_OPTIONS.find((s) => s.value === status)?.label}
          </Badge>
          {editMode ? (
            <a href={`/blog/${post.slug}`} target="_blank" rel="noopener" className="btn btn-ghost btn-sm">
              <ExternalLink size={14} /> دیدن در سایت
            </a>
          ) : null}
          <Button variant="ghost" size="sm" icon={<HelpCircle size={14} />} onClick={() => setHelpOpen(true)}>
            راهنمای نوشتن
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon={<Save size={14} />} loading={busy} disabled={!canSave} onClick={() => save()}>
            ذخیره
          </Button>
          {status !== 'PUBLISHED' ? (
            <Button size="sm" icon={<Send size={14} />} loading={busy} disabled={!canSave} onClick={() => save('PUBLISHED')}>
              انتشار
            </Button>
          ) : null}
        </div>
      </div>

      {report.score < 70 && content.length > 100 ? (
        <Alert tone="warning" title="امتیاز سئو پایین است">
          مقاله را منتشر کنید، ولی موارد قرمز چک‌لیست کنار صفحه را هم درست کنید؛ همین چند مورد تفاوت صفحه اول و صفحه
          سوم گوگل است.
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card title="محتوای مقاله">
            <div className="space-y-3.5">
              <Field label="عنوان مقاله" required error={fields.title}>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  placeholder="آموزش نصب داکر روی اوبونتو ۲۴.۰۴"
                />
              </Field>

              <div className="grid gap-3.5 sm:grid-cols-2">
                <Field
                  label="کلیدواژه هدف"
                  hint="عبارتی که می‌خواهید با آن در گوگل پیدا شوید؛ مبنای امتیاز سئو همین است."
                >
                  <Input
                    value={focusKeyword}
                    onChange={(e) => setFocusKeyword(e.target.value)}
                    maxLength={120}
                    placeholder="نصب داکر روی اوبونتو"
                  />
                </Field>

                <Field label="نشانی صفحه" error={fields.slug} hint="کوتاه و شامل کلیدواژه. پس از ایندکس شدن تغییرش ندهید.">
                  <div className="flex gap-2">
                    <Input value={slug} onChange={(e) => setSlug(e.target.value)} className="ltr" placeholder={effectiveSlug} />
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Wand2 size={14} />}
                      onClick={() => setSlug(slugify(focusKeyword || title))}
                      aria-label="ساخت نشانی از کلیدواژه"
                    />
                  </div>
                </Field>
              </div>

              <Field
                label="خلاصه"
                hint="یک یا دو جمله؛ در فهرست وبلاگ و کارت اشتراک‌گذاری دیده می‌شود. خالی بگذارید تا خودکار ساخته شود."
              >
                <Textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} maxLength={400} />
              </Field>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="label mb-0">متن مقاله (مارک‌داون)</span>
                  <div className="flex gap-1">
                    <Button
                      variant={tab === 'write' ? 'secondary' : 'ghost'}
                      size="sm"
                      icon={<Pencil size={13} />}
                      onClick={() => setTab('write')}
                    >
                      نوشتن
                    </Button>
                    <Button
                      variant={tab === 'preview' ? 'secondary' : 'ghost'}
                      size="sm"
                      icon={<Eye size={13} />}
                      onClick={() => setTab('preview')}
                    >
                      پیش‌نمایش
                    </Button>
                  </div>
                </div>

                {tab === 'write' ? (
                  <>
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] muted">درج نمودار:</span>
                      {FIGURE_TEMPLATES.map((t) => (
                        <Button
                          key={t.kind}
                          variant="ghost"
                          size="sm"
                          icon={t.icon}
                          onClick={() => insertFigure(t.body)}
                          title={`درج نمودار ${t.label}`}
                        >
                          {t.label}
                        </Button>
                      ))}
                    </div>
                    <Textarea
                      id="post-content"
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      rows={22}
                      placeholder={SAMPLE}
                      className="leading-8"
                    />
                    <p className="mt-1.5 text-[11px] leading-6 muted">
                      تیتر با <span className="ltr">##</span>، فهرست با <span className="ltr">-</span>، لینک با{' '}
                      <span className="ltr">[متن](/register)</span>، تصویر با{' '}
                      <span className="ltr">![توضیح](آدرس)</span>، جعبه نکته با <span className="ltr">:::tip</span> و نمودار با{' '}
                      <span className="ltr">:::figure</span> — نمودار با رنگ برند به تصویر تبدیل می‌شود.
                    </p>
                  </>
                ) : (
                  <div className="rounded-xl border p-4">
                    {content.trim() ? (
                      <div className="prose" dangerouslySetInnerHTML={{ __html: preview.html }} />
                    ) : (
                      <p className="text-xs muted">چیزی برای پیش‌نمایش نیست.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card
            title="تصویر شاخص"
            description="در فهرست وبلاگ، شبکه‌های اجتماعی و گوگل دیسکاور استفاده می‌شود. اگر خالی بماند، کاور با عنوان و رنگ برند خودکار طراحی می‌شود."
            action={
              <div className="flex flex-wrap gap-1.5">
                {autoCover ? (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Shuffle size={14} />}
                      onClick={() => makeAutoCover(coverOpts.variant + 1, coverOpts.topic)}
                    >
                      طرح دیگر
                    </Button>
                    <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => setCoverImage('')}>
                      برداشتن
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<ImagePlus size={14} />}
                    onClick={() => makeAutoCover()}
                    disabled={!title.trim()}
                  >
                    ساخت کاور خودکار
                  </Button>
                )}
              </div>
            }
          >
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field
                label="آدرس تصویر"
                hint={autoCover ? 'کاور خودکار؛ با تغییر عنوان یا رنگ برند خودش به‌روز می‌شود.' : 'نشانی کامل تصویر یا مسیر داخلی مثل /uploads/docker.jpg'}
              >
                <Input value={coverImage} onChange={(e) => setCoverImage(e.target.value)} className="ltr" />
              </Field>
              <Field label="متن جانشین تصویر (alt)" hint="تصویر را توصیف کنید؛ برای جستجوی تصویر گوگل مهم است.">
                <Input value={coverAlt} onChange={(e) => setCoverAlt(e.target.value)} maxLength={300} />
              </Field>
            </div>

            {autoCover ? (
              <Field label="تصویرسازی کاور" hint="موضوع تصویر از عنوان تشخیص داده می‌شود؛ اگر درست نبود، دستی انتخابش کنید." className="mt-3.5">
                <Select
                  value={coverOpts.topic ?? ''}
                  onChange={(e) => makeAutoCover(coverOpts.variant, e.target.value || null)}
                >
                  {TOPIC_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            {coverImage || coverPreview ? (
              <div className="mt-3 overflow-hidden rounded-xl border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={autoCover || !coverImage ? coverPreview : coverImage}
                  alt={coverAlt || 'پیش‌نمایش تصویر شاخص'}
                  className={`w-full object-cover ${!coverImage ? 'opacity-60' : ''}`}
                />
                {!coverImage ? (
                  <p className="border-t px-3 py-2 text-[11px] muted">
                    پیش‌نمایش کاوری که اگر تصویر نگذارید، هنگام ذخیره خودکار ساخته می‌شود.
                  </p>
                ) : null}
              </div>
            ) : null}
          </Card>

          <Card
            title="پرسش‌های پرتکرار"
            description="هر پرسش و پاسخ، داده ساخت‌یافته FAQ می‌سازد و شانس گرفتن کارت بازشو در نتایج گوگل را بالا می‌برد."
            action={
              <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setFaqs((p) => [...p, { q: '', a: '' }])}>
                پرسش تازه
              </Button>
            }
            bodyClassName="space-y-3"
          >
            {faqs.length === 0 ? (
              <p className="text-xs leading-6 muted">
                دو تا چهار پرسشی که کاربر واقعاً می‌پرسد اضافه کنید؛ پاسخ کوتاه و مستقیم بنویسید.
              </p>
            ) : (
              faqs.map((faq, i) => (
                <div key={i} className="rounded-xl border p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <Input
                        value={faq.q}
                        onChange={(e) =>
                          setFaqs((prev) => prev.map((f, idx) => (idx === i ? { ...f, q: e.target.value } : f)))
                        }
                        placeholder="پرسش"
                        maxLength={300}
                      />
                      <Textarea
                        value={faq.a}
                        onChange={(e) =>
                          setFaqs((prev) => prev.map((f, idx) => (idx === i ? { ...f, a: e.target.value } : f)))
                        }
                        rows={2}
                        placeholder="پاسخ کوتاه و روشن"
                        maxLength={2000}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={14} />}
                      className="hover:text-red-500"
                      onClick={() => setFaqs((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label="حذف پرسش"
                    />
                  </div>
                </div>
              ))
            )}
          </Card>

          <Card title="سئوی صفحه" description="اگر خالی بگذارید، از عنوان و خلاصه مقاله ساخته می‌شود.">
            <div className="space-y-3.5">
              <Field
                label="عنوان سئو"
                hint={`${metaTitle.length || title.length} نویسه — بهترین طول بین ۳۰ تا ۶۰ نویسه است.`}
              >
                <Input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} maxLength={200} placeholder={title} />
              </Field>

              <Field label="توضیحات متا" hint={`${metaDescription.length} نویسه — بین ۱۲۰ تا ۱۶۰ نویسه بنویسید.`}>
                <Textarea value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} rows={3} maxLength={400} />
              </Field>

              <div className="grid gap-3.5 sm:grid-cols-2">
                <Field label="کلیدواژه‌های فرعی" hint="با کاما جدا کنید.">
                  <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} maxLength={400} />
                </Field>
                <Field label="تصویر اشتراک‌گذاری (OG)" hint="خالی بگذارید تا از تصویر شاخص استفاده شود.">
                  <Input value={ogImage} onChange={(e) => setOgImage(e.target.value)} className="ltr" />
                </Field>
              </div>

              <Field
                label="آدرس canonical"
                hint="فقط اگر همین مطلب جای دیگری هم منتشر شده؛ در حالت عادی خالی بماند."
              >
                <Input value={canonicalUrl} onChange={(e) => setCanonicalUrl(e.target.value)} className="ltr" />
              </Field>

              <Toggle
                checked={noindex}
                onChange={setNoindex}
                label="از گوگل پنهان شود (noindex)"
                description="برای صفحه‌های آزمایشی یا محتوای تکراری. مقاله‌های معمولی باید خاموش باشد."
              />
            </div>
          </Card>
        </div>

        {/* ستون کنار: انتشار، دسته، نویسنده و سئو */}
        <div className="space-y-4">
          <Card title="انتشار">
            <div className="space-y-3.5">
              <Field label="وضعیت" hint={STATUS_OPTIONS.find((s) => s.value === status)?.hint}>
                <Select value={status} onChange={(e) => setStatus(e.target.value as PostStatus)}>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="تاریخ انتشار"
                hint="برای زمان‌بندی، تاریخ آینده بگذارید؛ مقاله خودش سر وقت منتشر می‌شود."
              >
                <Input type="datetime-local" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} className="ltr" />
              </Field>

              <Toggle
                checked={featured}
                onChange={setFeatured}
                label="مقاله ویژه"
                description="بالای فهرست وبلاگ، بزرگ نمایش داده می‌شود."
              />
            </div>
          </Card>

          <Card title="دسته و برچسب">
            <div className="space-y-3.5">
              <Field label="دسته" error={fields.categoryId}>
                <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">بی‌دسته</option>
                  {(catData?.items ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="برچسب‌ها" hint="با Enter یا کاما اضافه کنید.">
                <div className="flex gap-2">
                  <Input
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    placeholder="لینوکس"
                  />
                  <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => addTag()} aria-label="افزودن برچسب" />
                </div>
              </Field>

              {tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                      className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] hover:border-red-400 hover:text-red-500"
                    >
                      {tag}
                      <Trash2 size={10} />
                    </button>
                  ))}
                </div>
              ) : null}

              {(tagData?.items ?? []).length > 0 ? (
                <div>
                  <p className="label">برچسب‌های موجود</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(tagData?.items ?? [])
                      .filter((t) => !tags.includes(t.name))
                      .slice(0, 12)
                      .map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => addTag(t.name)}
                          className="rounded-full border px-2.5 py-1 text-[11px] muted hover:border-[var(--color-brand-500)]"
                        >
                          + {t.name}
                        </button>
                      ))}
                  </div>
                </div>
              ) : null}
            </div>
          </Card>

          <Card title="نویسنده" description="نام و تخصص نویسنده، یکی از سیگنال‌های اعتبار محتوا در گوگل است.">
            <div className="space-y-3.5">
              <Field label="نام نویسنده">
                <Input value={authorName} onChange={(e) => setAuthorName(e.target.value)} maxLength={120} placeholder="تیم فنی" />
              </Field>
              <Field label="عنوان شغلی">
                <Input value={authorTitle} onChange={(e) => setAuthorTitle(e.target.value)} maxLength={120} placeholder="مهندس زیرساخت" />
              </Field>
              <Field label="معرفی کوتاه">
                <Textarea value={authorBio} onChange={(e) => setAuthorBio(e.target.value)} rows={3} maxLength={600} />
              </Field>
            </div>
          </Card>

          <SeoPanel
            report={report}
            siteUrl={siteUrl}
            slug={effectiveSlug}
            title={metaTitle || title}
            description={metaDescription || excerpt}
          />
        </div>
      </div>

      <Modal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="چطور مقاله‌ای بنویسیم که رتبه بگیرد"
        size="lg"
      >
        <ol className="space-y-3 text-xs leading-7">
          <li>
            <strong>از جستجوی واقعی شروع کنید.</strong> عبارتی را انتخاب کنید که مشتری شما در گوگل می‌نویسد («خرید سرور
            مجازی آلمان»، «رفع فیلتر آی‌پی سرور»)، نه عبارتی که خوش‌آهنگ است.
          </li>
          <li>
            <strong>همان عبارت را در عنوان، آدرس، پاراگراف اول و یکی از تیترها بیاورید.</strong> بیشتر از این لازم
            نیست و تکرار بی‌رویه زیان‌آور است.
          </li>
          <li>
            <strong>به پرسش کاربر کامل پاسخ دهید.</strong> ۹۰۰ تا ۱۵۰۰ کلمه، با تیتر، فهرست، دستور و اسکرین‌شات.
          </li>
          <li>
            <strong>لینک داخلی بدهید.</strong> به صفحه خرید سرور، قیمت‌ها و دو سه مقاله مرتبط. این کار صفحه‌های تازه را
            سریع‌تر به گوگل می‌شناساند.
          </li>
          <li>
            <strong>پرسش‌های پرتکرار را پر کنید.</strong> کارت بازشو زیر نتیجه، نرخ کلیک را محسوس بالا می‌برد.
          </li>
          <li>
            <strong>پس از انتشار، در سرچ کنسول آدرس را Index Request کنید</strong> و در شبکه‌های اجتماعی‌تان بگذارید؛
            چند بازدید اولیه، سرعت ایندکس را بیشتر می‌کند.
          </li>
          <li>
            <strong>هر چند ماه مقاله را به‌روز کنید.</strong> تاریخ به‌روزرسانی در صفحه و در داده ساخت‌یافته می‌آید و
            گوگل محتوای تازه را ترجیح می‌دهد.
          </li>
        </ol>
        <div className="mt-4 flex items-center gap-2 rounded-xl border p-3 text-[11px] muted">
          <Clock size={14} /> نوشتن یک مقاله خوب معمولاً دو تا چهار ساعت وقت می‌برد؛ هفته‌ای دو مقاله باکیفیت از روزی
          یک مقاله سطحی بهتر جواب می‌دهد.
        </div>
      </Modal>
    </div>
  );
}
