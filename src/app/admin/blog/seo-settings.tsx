'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Save, ExternalLink, Globe, ShieldCheck } from 'lucide-react';
import { Alert, Button, Card, Field, Input, LoadingBlock, NumberInput, Textarea, Toggle } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiPatch, errorMessage, fetcher } from '@/lib/client';

type SettingsResponse = {
  settings: {
    siteUrl: string;
    brandName: string;
    blogEnabled: boolean;
    blogTitle: string;
    blogDescription: string;
    blogPerPage: number;
    blogOgImage: string;
    blogTwitter: string;
    googleSiteVerification: string;
    bingSiteVerification: string;
  };
};

/**
 * تنظیمات سئوی سایت و وبلاگ.
 *
 * مهم‌ترین فیلد همین «آدرس سایت» است: canonical، نقشه سایت، RSS و داده
 * ساخت‌یافته همه از آن ساخته می‌شوند. اگر غلط باشد، گوگل آدرس‌های اشتباه
 * می‌بیند و هیچ‌کدام از بقیه کارها اثر نمی‌کند.
 */
export function SeoSettings() {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<SettingsResponse>('/api/admin/settings', fetcher);

  const [form, setForm] = useState<SettingsResponse['settings'] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.settings && !form) setForm(data.settings);
  }, [data, form]);

  if (isLoading || !form) return <LoadingBlock />;

  const set = <K extends keyof SettingsResponse['settings']>(key: K, value: SettingsResponse['settings'][K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  async function save() {
    if (!form) return;
    setBusy(true);
    try {
      await apiPatch('/api/admin/settings', {
        siteUrl: form.siteUrl.trim().replace(/\/+$/, ''),
        blogEnabled: form.blogEnabled,
        blogTitle: form.blogTitle.trim(),
        blogDescription: form.blogDescription.trim(),
        blogPerPage: form.blogPerPage,
        blogOgImage: form.blogOgImage.trim(),
        blogTwitter: form.blogTwitter.trim(),
        googleSiteVerification: form.googleSiteVerification.trim(),
        bingSiteVerification: form.bingSiteVerification.trim(),
      });
      toast.success('تنظیمات ذخیره شد.');
      mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const site = form.siteUrl.replace(/\/+$/, '');

  return (
    <div className="space-y-4">
      <Alert tone="info" title="سه کار که باید یک بار انجام دهید">
        ۱) آدرس سایت را درست وارد کنید. ۲) سایت را در{' '}
        <a href="https://search.google.com/search-console" target="_blank" rel="noopener" className="underline">
          گوگل سرچ کنسول
        </a>{' '}
        ثبت و کد تأییدش را اینجا بگذارید. ۳) نشانی نقشه سایت را در سرچ کنسول ثبت کنید:{' '}
        <span className="ltr inline-block">{site}/sitemap.xml</span>
      </Alert>

      <Card title="آدرس سایت و وبلاگ">
        <div className="space-y-3.5">
          <Field
            label="آدرس کامل سایت"
            required
            hint="با https و بدون اسلش آخر. مبنای canonical، نقشه سایت و داده ساخت‌یافته است."
          >
            <Input value={form.siteUrl} onChange={(e) => set('siteUrl', e.target.value)} className="ltr" placeholder="https://pasargadmizban.ir" />
          </Field>

          <Toggle
            checked={form.blogEnabled}
            onChange={(v) => set('blogEnabled', v)}
            label="وبلاگ روی سایت فعال باشد"
            description="با خاموش کردن، صفحه‌های وبلاگ و لینک‌هایش از سایت برداشته می‌شوند."
          />

          <Field label="عنوان صفحه وبلاگ" hint="خالی بگذارید تا «وبلاگ + نام برند» شود.">
            <Input value={form.blogTitle} onChange={(e) => set('blogTitle', e.target.value)} maxLength={120} />
          </Field>

          <Field label="توضیح متای صفحه وبلاگ" hint="۱۲۰ تا ۱۶۰ نویسه.">
            <Textarea value={form.blogDescription} onChange={(e) => set('blogDescription', e.target.value)} rows={3} maxLength={300} />
          </Field>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="تعداد مقاله در هر صفحه">
              <NumberInput value={form.blogPerPage} onValueChange={(v) => set('blogPerPage', v)} min={4} max={24} />
            </Field>
            <Field label="شناسه شبکه اجتماعی" hint="برای کارت اشتراک‌گذاری، مثل @pasargadmizban">
              <Input value={form.blogTwitter} onChange={(e) => set('blogTwitter', e.target.value)} className="ltr" maxLength={40} />
            </Field>
          </div>

          <Field
            label="تصویر پیش‌فرض اشتراک‌گذاری"
            hint="مقاله‌هایی که تصویر شاخص ندارند از این تصویر استفاده می‌کنند. اندازه پیشنهادی ۱۲۰۰×۶۳۰."
          >
            <Input value={form.blogOgImage} onChange={(e) => set('blogOgImage', e.target.value)} className="ltr" placeholder="/og-default.png" />
          </Field>
        </div>
      </Card>

      <Card title="تأیید مالکیت در موتورهای جستجو" description="کد تأیید را از پنل هر سرویس بگیرید و اینجا بگذارید.">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="گوگل سرچ کنسول" hint="فقط مقدار content متاتگ را وارد کنید.">
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

      <Card title="نشانی‌های فنی سئو" description="این آدرس‌ها خودکار ساخته می‌شوند؛ کافی است در سرچ کنسول ثبتشان کنید.">
        <ul className="space-y-2 text-xs">
          {[
            { label: 'نقشه سایت', path: '/sitemap.xml', icon: <Globe size={13} /> },
            { label: 'robots.txt', path: '/robots.txt', icon: <ShieldCheck size={13} /> },
            { label: 'خوراک RSS وبلاگ', path: '/blog/rss.xml', icon: <ExternalLink size={13} /> },
          ].map((row) => (
            <li key={row.path} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
              <span className="flex items-center gap-2 font-semibold">
                {row.icon} {row.label}
              </span>
              <a href={row.path} target="_blank" rel="noopener" className="ltr text-[11px] text-[var(--color-brand-600)] hover:underline">
                {site}
                {row.path}
              </a>
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex justify-end">
        <Button icon={<Save size={15} />} loading={busy} onClick={save}>
          ذخیره تنظیمات
        </Button>
      </div>
    </div>
  );
}
