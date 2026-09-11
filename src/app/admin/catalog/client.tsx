'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { RefreshCw, Boxes, Globe, HardDrive } from 'lucide-react';
import { Alert, Badge, Button, Card, LoadingBlock, Stat, Tabs, Toggle } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, apiPost, errorMessage, fetcher } from '@/lib/client';
import { formatNumber, formatTraffic } from '@/lib/money';
import { faRelative, locationFa, osFa } from '@/lib/utils';

type Catalog = {
  syncedAt: string | null;
  categories: Record<string, string>;
  counts: { serverTypes: number; locations: number; images: number; datacenters: number };
  serverTypes: {
    id: number;
    name: string;
    description: string;
    cores: number;
    cpuType: string;
    architecture: string;
    memory: number;
    disk: number;
    category: string;
    deprecated: boolean;
    enabled: boolean;
    includedTraffic: number;
    inUse: number;
    priceLocations: string[];
  }[];
  locations: {
    id: number;
    name: string;
    description: string;
    city: string;
    country: string;
    networkZone: string;
    enabled: boolean;
    flag: string | null;
    title: string | null;
    datacenters: number;
    availableTypes: number;
  }[];
  images: {
    id: number;
    name: string | null;
    description: string;
    osFlavor: string;
    osVersion: string | null;
    architecture: string;
    enabled: boolean;
  }[];
};

export function CatalogClient() {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<Catalog>('/api/admin/catalog', fetcher);
  const [tab, setTab] = useState('plans');
  const [syncing, setSyncing] = useState(false);

  async function sync() {
    setSyncing(true);
    try {
      const res = await apiPost<{ message: string }>('/api/admin/catalog/sync');
      toast.success('همگام‌سازی انجام شد', res.message);
      mutate();
    } catch (err) {
      toast.error('همگام‌سازی ناموفق بود', errorMessage(err));
    } finally {
      setSyncing(false);
    }
  }

  async function toggle(kind: 'serverType' | 'location' | 'image', id: number, enabled: boolean) {
    try {
      await api('/api/admin/catalog', { method: 'PATCH', body: { kind, id, enabled } });
      mutate();
    } catch (err) {
      toast.error('تغییر وضعیت انجام نشد', errorMessage(err));
    }
  }

  if (isLoading && !data) return <LoadingBlock />;
  if (!data) return <Alert tone="error">دریافت کاتالوگ ممکن نشد.</Alert>;

  const empty = data.counts.serverTypes === 0;

  return (
    <div className="space-y-5">
      {empty ? (
        <Alert
          tone="warning"
          title="کاتالوگ خالی است"
          action={
            <Button size="sm" onClick={sync} loading={syncing} icon={<RefreshCw size={14} />}>
              همگام‌سازی با هتزنر
            </Button>
          }
        >
          برای شروع فروش، ابتدا اطلاعات پلن‌ها و قیمت‌ها را از هتزنر دریافت کنید. اگر هنوز حسابی اضافه
          نکرده‌اید، از بخش «حساب‌های هتزنر» توکن API خود را ثبت کنید.
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="پلن‌ها" value={formatNumber(data.counts.serverTypes)} icon={<Boxes size={16} />} />
        <Stat label="لوکیشن‌ها" value={formatNumber(data.counts.locations)} icon={<Globe size={16} />} />
        <Stat label="دیتاسنترها" value={formatNumber(data.counts.datacenters)} />
        <Stat label="سیستم‌عامل‌ها" value={formatNumber(data.counts.images)} icon={<HardDrive size={16} />} />
      </div>

      <Card
        title="مدیریت کاتالوگ"
        description={
          data.syncedAt ? `آخرین همگام‌سازی: ${faRelative(data.syncedAt)}` : 'هنوز همگام‌سازی انجام نشده است.'
        }
        action={
          <Button variant="secondary" size="sm" onClick={sync} loading={syncing} icon={<RefreshCw size={13} />}>
            همگام‌سازی
          </Button>
        }
        bodyClassName="p-0"
      >
        <Tabs
          tabs={[
            { id: 'plans', label: `پلن‌ها (${formatNumber(data.counts.serverTypes)})` },
            { id: 'locations', label: `لوکیشن‌ها (${formatNumber(data.counts.locations)})` },
            { id: 'images', label: `سیستم‌عامل‌ها (${formatNumber(data.counts.images)})` },
          ]}
          active={tab}
          onChange={setTab}
          className="px-2"
        />

        {tab === 'plans' ? (
          <div className="scroll-x">
            <table className="table table-cards">
              <thead>
                <tr>
                  <th>پلن</th>
                  <th>دسته</th>
                  <th>مشخصات</th>
                  <th>ترافیک</th>
                  <th>لوکیشن‌ها</th>
                  <th>در حال استفاده</th>
                  <th className="text-left">فروش</th>
                </tr>
              </thead>
              <tbody>
                {data.serverTypes.map((st) => (
                  <tr key={st.id} className={st.deprecated ? 'opacity-60' : ''}>
                    <td data-label="پلن">
                      <div className="text-xs font-bold uppercase">{st.name}</div>
                      <div className="mt-0.5 text-[10px] muted">{st.description}</div>
                    </td>
                    <td data-label="دسته" className="whitespace-nowrap text-xs muted">
                      {data.categories[st.category] ?? st.category}
                      {st.deprecated ? (
                        <div className="mt-1">
                          <Badge tone="bad">منسوخ</Badge>
                        </div>
                      ) : null}
                    </td>
                    <td data-label="مشخصات" className="tabular whitespace-nowrap text-xs">
                      {formatNumber(st.cores)} هسته · {formatNumber(st.memory)} گیگ · {formatNumber(st.disk)} گیگ
                      <div className="mt-0.5 text-[10px] uppercase muted">
                        {st.architecture} / {st.cpuType}
                      </div>
                    </td>
                    <td data-label="ترافیک" className="tabular whitespace-nowrap text-[11px] muted">
                      {formatTraffic(st.includedTraffic)}
                    </td>
                    <td data-label="لوکیشن‌ها" className="text-[11px] uppercase muted">{st.priceLocations.join('، ') || '—'}</td>
                    <td data-label="در حال استفاده" className="tabular text-xs">{formatNumber(st.inUse)}</td>
                    <td data-label="فروش" className="text-left">
                      <Toggle checked={st.enabled} onChange={(v) => toggle('serverType', st.id, v)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === 'locations' ? (
          <div className="scroll-x">
            <table className="table table-cards">
              <thead>
                <tr>
                  <th>لوکیشن</th>
                  <th>کشور</th>
                  <th>ناحیه شبکه</th>
                  <th>دیتاسنترها</th>
                  <th>پلن‌های موجود</th>
                  <th className="text-left">فروش</th>
                </tr>
              </thead>
              <tbody>
                {data.locations.map((loc) => {
                  const fa = locationFa(loc.name, loc.city, loc.country);
                  return (
                    <tr key={loc.id}>
                      <td data-label="لوکیشن">
                        <div className="text-xs font-semibold">
                          {loc.flag ?? fa.flag} {loc.title ?? fa.title}
                        </div>
                        <div className="mt-0.5 text-[10px] uppercase muted">{loc.name}</div>
                      </td>
                      <td data-label="کشور" className="whitespace-nowrap text-xs muted">{loc.country}</td>
                      <td data-label="ناحیه شبکه" className="text-[11px] uppercase muted">{loc.networkZone}</td>
                      <td data-label="دیتاسنترها" className="tabular text-xs">{formatNumber(loc.datacenters)}</td>
                      <td data-label="پلن‌های موجود" className="tabular text-xs">{formatNumber(loc.availableTypes)}</td>
                      <td data-label="فروش" className="text-left">
                        <Toggle checked={loc.enabled} onChange={(v) => toggle('location', loc.id, v)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === 'images' ? (
          <div className="scroll-x">
            <table className="table table-cards">
              <thead>
                <tr>
                  <th>سیستم‌عامل</th>
                  <th>خانواده</th>
                  <th>نسخه</th>
                  <th>معماری</th>
                  <th className="text-left">فروش</th>
                </tr>
              </thead>
              <tbody>
                {data.images.map((img) => {
                  const os = osFa(img.osFlavor);
                  return (
                    <tr key={img.id}>
                      <td data-label="سیستم‌عامل">
                        <div className="flex items-center gap-2">
                          <span className="h-6 w-1 rounded-full" style={{ background: os.color }} />
                          <span className="text-xs font-semibold">{img.description}</span>
                        </div>
                      </td>
                      <td data-label="خانواده" className="whitespace-nowrap text-xs muted">{os.label}</td>
                      <td data-label="نسخه" className="ltr text-xs muted">{img.osVersion ?? '—'}</td>
                      <td data-label="معماری" className="text-[11px] uppercase muted">{img.architecture}</td>
                      <td data-label="فروش" className="text-left">
                        <Toggle checked={img.enabled} onChange={(v) => toggle('image', img.id, v)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      <Alert tone="info" title="نکته">
        غیرفعال کردن یک پلن یا لوکیشن فقط جلوی فروش جدید را می‌گیرد و روی سرورهای فعال مشتریان تأثیری ندارد.
      </Alert>
    </div>
  );
}
