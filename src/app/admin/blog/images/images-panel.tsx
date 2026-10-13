'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ImageIcon, AlertTriangle, Globe, FileWarning, Search } from 'lucide-react';
import { Alert, Badge, Card, EmptyState, Input, LoadingBlock, Select, Stat, Tabs } from '@/components/ui';
import { fetcher } from '@/lib/client';
import { formatNumber } from '@/lib/money';
import { STATUS_FA, type PostStatus } from '../types';

type ImageRow = {
  src: string;
  alt: string;
  kind: 'cover' | 'inline';
  postId: string;
  postTitle: string;
  postSlug: string;
  status: PostStatus;
  host: string;
};

type Data = {
  images: ImageRow[];
  missingCover: { id: string; title: string; slug: string; status: PostStatus }[];
  stats: {
    total: number;
    covers: number;
    inline: number;
    noAlt: number;
    external: number;
    missingCover: number;
    posts: number;
  };
  hosts: { host: string; count: number; own: boolean }[];
};

/**
 * تصاویر وبلاگ.
 *
 * تصویر بی‌alt نه برای کاربر نابینا معنی دارد و نه گوگل می‌فهمد موضوعش چیست؛
 * مقاله بی‌تصویر شاخص هم در نتایج و شبکه‌های اجتماعی بی‌عکس دیده می‌شود و
 * کلیک کمتری می‌گیرد. اینجا هر دو را یک‌جا می‌بینید.
 */
export function ImagesPanel() {
  const { data, isLoading } = useSWR<Data>('/api/admin/blog/images', fetcher);
  const [tab, setTab] = useState<'all' | 'noalt' | 'external' | 'missing'>('all');
  const [query, setQuery] = useState('');
  const [host, setHost] = useState('');

  const rows = useMemo(() => {
    let list = data?.images ?? [];
    if (tab === 'noalt') list = list.filter((i) => !i.alt.trim());
    if (tab === 'external') list = list.filter((i) => i.host && !data?.hosts.find((h) => h.host === i.host)?.own);
    if (host) list = list.filter((i) => (i.host || '(نسبی)') === host);
    const q = query.trim();
    if (q) list = list.filter((i) => i.postTitle.includes(q) || i.src.includes(q) || i.alt.includes(q));
    return list.slice(0, 400);
  }, [data, tab, query, host]);

  const stats = data?.stats;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat
          label="تصاویر وبلاگ"
          value={formatNumber(stats?.total ?? 0)}
          hint={`${formatNumber(stats?.covers ?? 0)} شاخص · ${formatNumber(stats?.inline ?? 0)} داخل متن`}
          icon={<ImageIcon size={16} />}
        />
        <Stat
          label="بدون متن جانشین"
          value={formatNumber(stats?.noAlt ?? 0)}
          hint={stats?.noAlt ? 'برای جست‌وجوی تصویر گوگل نامرئی‌اند' : 'همه تصاویر alt دارند'}
          tone={stats?.noAlt ? 'warn' : 'ok'}
          icon={<AlertTriangle size={16} />}
        />
        <Stat
          label="مقاله بی‌تصویر شاخص"
          value={formatNumber(stats?.missingCover ?? 0)}
          hint={stats?.missingCover ? 'کارت اشتراک‌گذاری‌شان خالی است' : 'همه مقاله‌ها تصویر دارند'}
          tone={stats?.missingCover ? 'warn' : 'ok'}
          icon={<FileWarning size={16} />}
        />
        <Stat
          label="میزبانی بیرون از سایت"
          value={formatNumber(stats?.external ?? 0)}
          hint="اگر آن سرور خاموش شود، تصویر مقاله‌تان از بین می‌رود"
          tone={stats?.external ? 'warn' : 'ok'}
          icon={<Globe size={16} />}
        />
      </div>

      {stats?.external ? (
        <Alert tone="warning" title="بخشی از تصاویر روی سرور دیگری است">
          تصویرهایی که از دامنه‌های بیرونی می‌آیند، با از کار افتادن آن سرور از مقاله حذف می‌شوند و سرعت بارگذاری
          صفحه را هم به آن سرور گره می‌زنند. بهتر است فایل را روی سرور خودتان بگذارید و نشانی را عوض کنید.
        </Alert>
      ) : null}

      <Card
        title="فهرست تصاویر"
        action={
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 muted" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="جستجو در عنوان یا نشانی"
                className="h-9 w-44 pr-8 text-xs"
              />
            </div>
            <Select value={host} onChange={(e) => setHost(e.target.value)} className="h-9 w-40 text-xs">
              <option value="">همه میزبان‌ها</option>
              {data?.hosts.map((h) => (
                <option key={h.host} value={h.host}>
                  {h.host} ({new Intl.NumberFormat('fa-IR').format(h.count)})
                </option>
              ))}
            </Select>
          </div>
        }
        bodyClassName="p-0"
      >
        <Tabs
          tabs={[
            { id: 'all', label: `همه (${formatNumber(stats?.total ?? 0)})` },
            { id: 'noalt', label: `بدون alt (${formatNumber(stats?.noAlt ?? 0)})` },
            { id: 'external', label: `بیرونی (${formatNumber(stats?.external ?? 0)})` },
            { id: 'missing', label: `بی‌تصویر شاخص (${formatNumber(stats?.missingCover ?? 0)})` },
          ]}
          active={tab}
          onChange={(id) => setTab(id as typeof tab)}
        />

        {isLoading && !data ? (
          <LoadingBlock />
        ) : tab === 'missing' ? (
          data?.missingCover.length === 0 ? (
            <EmptyState icon={<ImageIcon size={24} />} title="همه مقاله‌ها تصویر شاخص دارند" />
          ) : (
            <ul className="divide-y">
              {data?.missingCover.map((post) => (
                <li key={post.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
                  <Link href={`/admin/blog/${post.id}`} className="min-w-0 flex-1 truncate text-xs font-semibold hover:underline">
                    {post.title}
                  </Link>
                  <Badge tone={STATUS_FA[post.status].tone}>{STATUS_FA[post.status].label}</Badge>
                </li>
              ))}
            </ul>
          )
        ) : rows.length === 0 ? (
          <EmptyState icon={<ImageIcon size={24} />} title="تصویری با این فیلتر نبود" />
        ) : (
          <ul className="divide-y">
            {rows.map((img, i) => (
              <li key={`${img.postId}-${img.src}-${i}`} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                {/* پیش‌نمایش کوچک؛ تصویر شکسته هم خودش یک ایراد است و دیده می‌شود */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.src}
                  alt=""
                  loading="lazy"
                  className="h-12 w-16 shrink-0 rounded-lg border object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={img.kind === 'cover' ? 'ok' : 'muted'}>
                      {img.kind === 'cover' ? 'تصویر شاخص' : 'داخل متن'}
                    </Badge>
                    {!img.alt.trim() ? <Badge tone="bad">بدون alt</Badge> : null}
                    <Link href={`/admin/blog/${img.postId}`} className="min-w-0 truncate text-xs font-semibold hover:underline">
                      {img.postTitle}
                    </Link>
                  </div>
                  <p className="ltr mt-1 truncate text-[11px] muted" title={img.src}>
                    {img.src}
                  </p>
                  {img.alt.trim() ? <p className="mt-0.5 truncate text-[11px] muted">alt: {img.alt}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="میزبان تصاویر" description="تصاویر از کجا بارگذاری می‌شوند.">
        {!data ? (
          <LoadingBlock />
        ) : (
          <ul className="space-y-2">
            {data.hosts.map((h) => (
              <li key={h.host} className="flex items-center justify-between gap-2 border-b pb-2 text-xs last:border-b-0">
                <span className="ltr min-w-0 truncate">{h.host}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge tone={h.own ? 'ok' : 'warn'}>{h.own ? 'خودی' : 'بیرونی'}</Badge>
                  <span className="tabular muted">{formatNumber(h.count)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
