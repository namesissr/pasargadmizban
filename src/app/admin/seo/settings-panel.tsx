'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Save, Send, ShieldCheck, Globe, Sparkles, UserRound, Share2 } from 'lucide-react';
import { Alert, Button, Card, Field, Input, LoadingBlock, NumberInput, Textarea, Toggle } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiPatch, apiPost, errorMessage, fetcher } from '@/lib/client';

type Form = {
  siteUrl: string;
  blogEnabled: boolean;
  blogTitle: string;
  blogDescription: string;
  blogPerPage: number;
  blogOgImage: string;
  blogTwitter: string;
  googleSiteVerification: string;
  bingSiteVerification: string;
  orgLogoUrl: string;
  orgSameAs: string;
  defaultAuthorName: string;
  defaultAuthorTitle: string;
  defaultAuthorBio: string;
  homeSchemaEnabled: boolean;
  indexNowEnabled: boolean;
  indexNowKey: string;
};

const KEYS: (keyof Form)[] = [
  'siteUrl',
  'blogEnabled',
  'blogTitle',
  'blogDescription',
  'blogPerPage',
  'blogOgImage',
  'blogTwitter',
  'googleSiteVerification',
  'bingSiteVerification',
  'orgLogoUrl',
  'orgSameAs',
  'defaultAuthorName',
  'defaultAuthorTitle',
  'defaultAuthorBio',
  'homeSchemaEnabled',
  'indexNowEnabled',
  'indexNowKey',
];

/**
 * تنظیمات سئو.
 *
 * هر چیزی که در این صفحه پر می‌شود، جایی در خروجی سایت اثر دارد: canonical،
 * داده ساخت‌یافته، کارت اشتراک‌گذاری یا اعلام به موتورهای جستجو. آنچه خودکار
 * اعمال شده و نیازی به تنظیم ندارد، پایین صفحه فهرست شده است.
 */
export function SeoSettingsPanel() {
  const toast = useToast();
  const { data, mutate } = useSWR<{ settings: Record<string, unknown> }>('/api/admin/settings', fetcher);

  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [pinging, setPinging] = useState(false);

  useEffect(() => {
    if (data?.settings && !form) {
      const s = data.settings as unknown as Form;
      const next = {} as Form;
      for (const key of KEYS) (next as Record<string, unknown>)[key] = s[key];
      setForm(next);
    }
  }, [data, form]);

  if (!form) return <LoadingBlock />;

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  async function save() {
    if (!form) return;
    setBusy(true);
    try {
      await apiPatch('/api/admin/settings', { ...form, siteUrl: form.siteUrl.trim().replace(/\/+$/, '') });
      toast.success('تنظیمات سئو ذخیره شد.');
      mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function pingAll() {
    setPinging(true);
    try {
      const res = await apiPost<{ message: string }>('/api/admin/seo/indexnow', { target: 'all' });
      toast.success(res.message);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPinging(false);
    }
  }

  const site = form.siteUrl.replace(/\/+$/, '');

  return (
    <div className="space-y-4">
      <Alert tone="info" title="سه کاری که فقط یک بار لازم است">
        ۱) آدرس سایت را درست وارد کنید. ۲) در{' '}
        <a href="https://search.google.com/search-console" target="_blank" rel="noopener" className="underline">
          گوگل سرچ کنسول
        </a>{' '}
        سایت را تأیید کنید و کدش را اینجا بگذارید. ۳) نشانی{' '}
        <span className="ltr mono">{site}/sitemap.xml</span> را در سرچ کنسول ثبت کنید.
      </Alert>

      <Card title="هویت سایت" description="مبنای همه آدرس‌های canonical و داده ساخت‌یافته.">
        <div className="space-y-3.5">
          <Field label="آدرس کامل سایت" required hint="با https و بدون اسلش آخر.">
            <Input value={form.siteUrl} onChange={(e) => set('siteUrl', e.target.value)} className="ltr" placeholder="https://pasargadmizban.ir" />
          </Field>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="لوگوی سازمان" hint="مربعی، دست‌کم ۱۱۲×۱۱۲ — در داده ساخت‌یافته سازمان می‌آید.">
              <Input value={form.orgLogoUrl} onChange={(e) => set('orgLogoUrl', e.target.value)} className="ltr" placeholder="/logo.png" />
            </Field>
            <Field label="تصویر پیش‌فرض اشتراک‌گذاری" hint="۱۲۰۰×۶۳۰ — برای صفحه‌هایی که تصویر شاخص ندارند.">
              <Input value={form.blogOgImage} onChange={(e) => set('blogOgImage', e.target.value)} className="ltr" placeholder="/og-default.png" />
            </Field>
          </div>

          <Field
            label="نشانی شبکه‌های اجتماعی"
            hint="هر خط یک نشانی. در داده ساخت‌یافته به عنوان sameAs می‌آید و به گوگل کمک می‌کند برند را یک موجودیت مستقل بشناسد."
          >
            <Textarea
              value={form.orgSameAs}
              onChange={(e) => set('orgSameAs', e.target.value)}
              rows={3}
              className="ltr"
              placeholder={'https://t.me/pasargadmizban\nhttps://instagram.com/...'}
            />
          </Field>

          <Field label="شناسه شبکه اجتماعی برای کارت اشتراک‌گذاری" hint="مثل @pasargadmizban">
            <Input value={form.blogTwitter} onChange={(e) => set('blogTwitter', e.target.value)} className="ltr" maxLength={40} />
          </Field>
        </div>
      </Card>

      <Card title="تأیید مالکیت در موتورهای جستجو" description="کد را از پنل هر سرویس بگیرید؛ فقط مقدار content متاتگ.">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="گوگل سرچ کنسول">
            <Input
              value={form.googleSiteVerification}
              onChange={(e) => set('googleSiteVerification', e.target.value)}
              className="ltr"
              maxLength={200}
            />
          </Field>
          <Field label="بینگ وبمستر">
            <Input
              value={form.bingSiteVerification}
              onChange={(e) => set('bingSiteVerification', e.target.value)}
              className="ltr"
              maxLength={200}
            />
          </Field>
        </div>
      </Card>

      <Card
        title="اعلام فوری آدرس تازه (IndexNow)"
        description="بینگ، یاندکس و چند موتور دیگر این پروتکل را پشتیبانی می‌کنند و معمولاً چند دقیقه بعد سراغ آدرس می‌آیند."
        action={
          <Button size="sm" variant="secondary" icon={<Send size={14} />} loading={pinging} onClick={pingAll}>
            اعلام همه مقاله‌ها
          </Button>
        }
      >
        <div className="space-y-3.5">
          <Toggle
            checked={form.indexNowEnabled}
            onChange={(v) => set('indexNowEnabled', v)}
            label="هر مقاله تازه خودکار اعلام شود"
            description="هنگام انتشار یا به‌روزرسانی مقاله، آدرسش برای موتورهای جستجو فرستاده می‌شود."
          />
          <Field label="کلید IndexNow" hint="خالی بگذارید تا خودکار ساخته شود. فایل تأییدش در /indexnow.txt سرو می‌شود.">
            <Input value={form.indexNowKey} onChange={(e) => set('indexNowKey', e.target.value)} className="ltr" maxLength={64} />
          </Field>
          <Alert tone="info" title="درباره گوگل">
            گوگل عضو IndexNow نیست و هیچ API عمومی برای «همین حالا ایندکس کن» ندارد (Indexing API فقط برای آگهی شغلی و
            رویداد زنده مجاز است). سریع‌ترین راه برای گوگل همین سه چیز است: نقشه سایت ثبت‌شده، لینک داخلی به مقاله تازه،
            و درخواست دستی ایندکس در سرچ کنسول برای مقاله‌های مهم.
          </Alert>
        </div>
      </Card>

      <Card title="نویسنده پیش‌فرض" description="گوگل در ارزیابی کیفیت، به نویسنده و تخصصش اهمیت می‌دهد.">
        <div className="space-y-3.5">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="نام نویسنده" hint="خالی بگذارید تا نام برند استفاده شود.">
              <Input value={form.defaultAuthorName} onChange={(e) => set('defaultAuthorName', e.target.value)} maxLength={120} />
            </Field>
            <Field label="عنوان شغلی">
              <Input value={form.defaultAuthorTitle} onChange={(e) => set('defaultAuthorTitle', e.target.value)} maxLength={120} />
            </Field>
          </div>
          <Field label="معرفی کوتاه">
            <Textarea value={form.defaultAuthorBio} onChange={(e) => set('defaultAuthorBio', e.target.value)} rows={3} maxLength={600} />
          </Field>
        </div>
      </Card>

      <Card title="وبلاگ" description="عنوان و توضیح صفحه فهرست و تعداد مقاله در هر صفحه.">
        <div className="space-y-3.5">
          <Toggle checked={form.blogEnabled} onChange={(v) => set('blogEnabled', v)} label="وبلاگ روی سایت فعال باشد" />
          <Field label="عنوان صفحه وبلاگ" hint="خالی بگذارید تا «وبلاگ + نام برند» شود.">
            <Input value={form.blogTitle} onChange={(e) => set('blogTitle', e.target.value)} maxLength={120} />
          </Field>
          <Field label="توضیح متای صفحه وبلاگ" hint="۱۲۰ تا ۱۶۰ نویسه.">
            <Textarea value={form.blogDescription} onChange={(e) => set('blogDescription', e.target.value)} rows={3} maxLength={300} />
          </Field>
          <Field label="تعداد مقاله در هر صفحه" className="w-40">
            <NumberInput value={form.blogPerPage} onValueChange={(v) => set('blogPerPage', v)} min={4} max={24} />
          </Field>
          <Toggle
            checked={form.homeSchemaEnabled}
            onChange={(v) => set('homeSchemaEnabled', v)}
            label="داده ساخت‌یافته صفحه اصلی"
            description="پرسش‌های پرتکرار و پلن‌های سرور به شکل ساخت‌یافته در صفحه اصلی می‌آید؛ شانس کارت غنی و نمایش قیمت در نتایج."
          />
        </div>
      </Card>

      <Card title="آنچه خودکار اعمال شده" description="این‌ها بدون تنظیم، روی همه صفحه‌های عمومی فعال است.">
        <ul className="grid gap-2 text-[11px] leading-6 sm:grid-cols-2">
          {[
            { icon: <Globe size={12} />, text: 'canonical یکتا روی هر صفحه و لینک صفحه قبل/بعد در فهرست‌ها' },
            { icon: <Sparkles size={12} />, text: 'داده ساخت‌یافته: سازمان، سایت، مسیر صفحه، مقاله و پرسش‌های پرتکرار' },
            { icon: <Share2 size={12} />, text: 'کارت اشتراک‌گذاری Open Graph و توییتر با تصویر مقاله' },
            { icon: <ShieldCheck size={12} />, text: 'robots.txt: پنل و API بسته، وبلاگ و صفحه اصلی باز' },
            { icon: <Globe size={12} />, text: 'نقشه سایت خودکار با تاریخ به‌روزرسانی و تصویر شاخص مقاله‌ها' },
            { icon: <Sparkles size={12} />, text: 'ریدایرکت ۳۰۸ از نشانی قدیمی مقاله به نشانی تازه' },
            { icon: <ShieldCheck size={12} />, text: 'noindex خودکار برای صفحه جستجو و برچسب‌های کم‌مقاله' },
            { icon: <UserRound size={12} />, text: 'نویسنده و تاریخ به‌روزرسانی در صفحه و در داده ساخت‌یافته' },
            { icon: <Globe size={12} />, text: 'پیش‌بارگذاری فونت و تصویر شاخص برای سرعت بیشتر' },
            { icon: <Sparkles size={12} />, text: 'فهرست مطالب با شناسه روی تیترها برای لینک پرش در نتایج' },
          ].map((row) => (
            <li key={row.text} className="flex items-start gap-2">
              <span className="mt-1 shrink-0 text-[var(--color-brand-600)]">{row.icon}</span>
              <span className="muted">{row.text}</span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex justify-end">
        <Button icon={<Save size={15} />} loading={busy} onClick={save}>
          ذخیره تنظیمات سئو
        </Button>
      </div>
    </div>
  );
}
