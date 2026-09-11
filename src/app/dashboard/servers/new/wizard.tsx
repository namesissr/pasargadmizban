'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import {
  Cpu,
  MemoryStick,
  HardDrive,
  Globe,
  Check,
  Wallet,
  Server as ServerIcon,
  ShieldCheck,
  Info,
  KeyRound,
  ArrowLeft,
  Network,
  Signal,
  Sparkles,
  PiggyBank,
  Gem,
  Zap,
} from 'lucide-react';
import { Alert, Button, Card, Field, Input, LoadingBlock, Select, Toggle, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiPost, errorFields, errorMessage, fetcher } from '@/lib/client';
import { formatToman, formatNumber, formatTraffic } from '@/lib/money';
import { cn, osFa, suggestServerName } from '@/lib/utils';

type Catalog = {
  locations: {
    name: string;
    description: string;
    city: string;
    country: string;
    flag: string | null;
    title: string;
    iranReachPercent: number | null;
  }[];
  categories: Record<string, string>;
  plans: {
    name: string;
    description: string;
    cores: number;
    cpuType: string;
    architecture: string;
    memory: number;
    disk: number;
    storageType: string;
    category: string;
    includedTraffic: number;
    prices: Record<string, { hourly: number; monthly: number; available: boolean }>;
  }[];
  images: {
    id: number;
    name: string | null;
    description: string;
    osFlavor: string;
    osVersion: string | null;
    architecture: string;
  }[];
  settings: { hourlyPrepayHours: number; backupPercent: number };
};

type Template = {
  slug: string;
  name: string;
  description: string;
  category: string;
  categoryLabel: string;
  icon: string;
  minMemory: number;
  architectures: string[];
  osFlavors: string[];
  ports: number[];
  notes: string[];
};

type Quote = {
  hourly: number;
  monthly: number;
  dueNow: number;
  minBalance: number;
  months: number;
  prepayHours: number;
  balance: number;
  enough: boolean;
  shortfall: number;
  backup: { hourly: number; monthly: number };
  basePrice: { hourly: number; monthly: number };
  includedTraffic: number;
  discountPct: number;
};

export function CreateServerWizard({
  sshKeys,
  existingNames,
  balance,
  prepayHours,
}: {
  sshKeys: { id: string; name: string; fingerprint: string }[];
  existingNames: string[];
  balance: number;
  prepayHours: number;
}) {
  const router = useRouter();
  const toast = useToast();

  const { data: catalog, isLoading } = useSWR<Catalog>('/api/catalog', fetcher, {
    revalidateOnFocus: false,
  });

  const [location, setLocation] = useState('');
  const [plan, setPlan] = useState('');
  const [image, setImage] = useState('');
  const [cycle, setCycle] = useState<'HOURLY' | 'MONTHLY'>('HOURLY');
  const [months, setMonths] = useState(1);
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [backups, setBackups] = useState(false);
  const [userData, setUserData] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [category, setCategory] = useState('all');
  const [sortBy, setSortBy] = useState<'price' | 'priceDesc' | 'memory' | 'cores' | 'disk' | 'traffic'>('price');
  const [minMemory, setMinMemory] = useState(0);
  const [minCores, setMinCores] = useState(0);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [appTemplate, setAppTemplate] = useState('none');
  const [monitoring, setMonitoring] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});

  // مقداردهی اولیه
  useEffect(() => {
    if (!catalog) return;
    if (!location && catalog.locations.length) setLocation(catalog.locations[0].name);
    if (!name) setName(suggestServerName(existingNames));
    if (!image && catalog.images.length) {
      const ubuntu = catalog.images.find((i) => i.osFlavor === 'ubuntu');
      setImage(String(ubuntu?.id ?? catalog.images[0].id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  const selectedPlan = useMemo(
    () => catalog?.plans.find((p) => p.name === plan) ?? null,
    [catalog, plan],
  );

  const selectedImage = useMemo(
    () => catalog?.images.find((i) => String(i.id) === image) ?? null,
    [catalog, image],
  );

  // پلن‌های قابل نمایش برای لوکیشن انتخابی، با فیلتر و مرتب‌سازی کاربر
  const visiblePlans = useMemo(() => {
    if (!catalog || !location) return [];
    const priceOf = (p: Catalog['plans'][number]) => p.prices[location]?.monthly ?? 0;
    return catalog.plans
      .filter((p) => p.prices[location])
      .filter((p) => category === 'all' || p.category === category)
      .filter((p) => p.memory >= minMemory && p.cores >= minCores)
      .filter((p) => !onlyAvailable || p.prices[location]?.available)
      .sort((a, b) => {
        switch (sortBy) {
          case 'priceDesc':
            return priceOf(b) - priceOf(a);
          case 'memory':
            return b.memory - a.memory || priceOf(a) - priceOf(b);
          case 'cores':
            return b.cores - a.cores || priceOf(a) - priceOf(b);
          case 'disk':
            return b.disk - a.disk || priceOf(a) - priceOf(b);
          case 'traffic':
            return b.includedTraffic - a.includedTraffic || priceOf(a) - priceOf(b);
          default:
            return priceOf(a) - priceOf(b);
        }
      });
  }, [catalog, location, category, sortBy, minMemory, minCores, onlyAvailable]);

  // اگر پلن انتخابی در لوکیشن جدید نبود، پاکش کن
  useEffect(() => {
    if (plan && !visiblePlans.some((p) => p.name === plan)) setPlan('');
  }, [visiblePlans, plan]);

  // پیشنهادهای سریع از میان پلن‌های موجودِ همین فیلترها
  const quickPicks = useMemo(() => {
    const avail = visiblePlans.filter((p) => p.prices[location]?.available);
    const priceOf = (p: Catalog['plans'][number]) => p.prices[location]?.monthly ?? Infinity;
    const cheapest = avail.length ? avail.reduce((m, p) => (priceOf(p) < priceOf(m) ? p : m)) : null;
    const bestValue = avail.length
      ? avail.reduce((m, p) =>
          priceOf(p) / Math.max(1, p.memory) < priceOf(m) / Math.max(1, m.memory) ? p : m,
        )
      : null;
    const strongest = avail.length
      ? avail.reduce((m, p) => (p.cores !== m.cores ? (p.cores > m.cores ? p : m) : p.memory > m.memory ? p : m))
      : null;
    return [
      { key: 'cheapest', label: 'ارزان‌ترین', hint: 'کم‌هزینه‌ترین پلن موجود', icon: <PiggyBank size={12} />, plan: cheapest },
      { key: 'value', label: 'بهترین ارزش', hint: 'کمترین هزینه به ازای هر گیگ رم', icon: <Gem size={12} />, plan: bestValue },
      { key: 'strongest', label: 'قوی‌ترین', hint: 'بیشترین هسته و رم', icon: <Zap size={12} />, plan: strongest },
    ];
  }, [visiblePlans, location]);

  function choosePlan(name: string) {
    setPlan(name);
    requestAnimationFrame(() => {
      document.querySelectorAll(`[data-plan-row="${name}"]`).forEach((el) => {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    });
  }

  function resetPlanFilters() {
    setCategory('all');
    setSortBy('price');
    setMinMemory(0);
    setMinCores(0);
    setOnlyAvailable(false);
  }

  // سیستم‌عامل سازگار با معماری پلن
  const compatibleImages = useMemo(() => {
    if (!catalog) return [];
    if (!selectedPlan) return catalog.images;
    return catalog.images.filter((i) => i.architecture === selectedPlan.architecture);
  }, [catalog, selectedPlan]);

  useEffect(() => {
    if (!selectedPlan || !image) return;
    if (!compatibleImages.some((i) => String(i.id) === image)) {
      const fallback = compatibleImages.find((i) => i.osFlavor === 'ubuntu') ?? compatibleImages[0];
      setImage(fallback ? String(fallback.id) : '');
    }
  }, [compatibleImages, selectedPlan, image]);

  // پیش‌فاکتور
  const quoteKey =
    plan && location
      ? `/api/quote?serverType=${encodeURIComponent(plan)}&location=${encodeURIComponent(location)}&billingCycle=${cycle}&months=${months}&backups=${backups}`
      : null;
  const { data: quote } = useSWR<Quote>(quoteKey, fetcher, { revalidateOnFocus: false });
  const { data: templateData } = useSWR<{ templates: Template[] }>('/api/templates', fetcher, {
    revalidateOnFocus: false,
  });

  // قالب‌هایی که با پلن و سیستم‌عامل انتخابی سازگارند
  const templates = useMemo(() => {
    const all = templateData?.templates ?? [];
    if (!selectedPlan || !selectedImage) return all;
    return all.filter((t) => {
      if (t.slug === 'none') return true;
      if (t.minMemory > selectedPlan.memory) return false;
      if (t.architectures.length && !t.architectures.includes(selectedPlan.architecture)) return false;
      if (t.osFlavors.length && !t.osFlavors.includes(selectedImage.osFlavor)) return false;
      return true;
    });
  }, [templateData, selectedPlan, selectedImage]);

  // اگر قالب انتخابی دیگر سازگار نبود، به حالت پیش‌فرض برگرد
  useEffect(() => {
    if (appTemplate !== 'none' && !templates.some((t) => t.slug === appTemplate)) {
      setAppTemplate('none');
    }
  }, [templates, appTemplate]);

  const selectedTemplate = templates.find((t) => t.slug === appTemplate) ?? null;

  const canSubmit = Boolean(plan && location && image && name && (quote?.enough ?? false));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setFields({});

    if (!quote?.enough) {
      setError('موجودی کیف پول برای ساخت این سرور کافی نیست.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiPost<{ id: string; name: string }>('/api/servers', {
        name,
        label: label || undefined,
        serverType: plan,
        location,
        image: selectedImage?.name ?? selectedImage?.description ?? image,
        billingCycle: cycle,
        months: cycle === 'MONTHLY' ? months : 1,
        sshKeyIds: selectedKeys,
        enableBackups: backups,
        enableIpv4: true,
        userData: userData || undefined,
        appTemplate: appTemplate !== 'none' ? appTemplate : undefined,
        enableMonitoring: monitoring,
      });
      toast.success('سرور در حال ساخت است', 'تا چند لحظه دیگر اطلاعات ورود نمایش داده می‌شود.');
      router.push(`/dashboard/servers/${res.id}?new=1`);
    } catch (err) {
      setError(errorMessage(err));
      setFields(errorFields(err));
      setSubmitting(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  if (isLoading || !catalog) return <LoadingBlock label="در حال دریافت پلن‌ها و قیمت‌ها…" />;

  const categories = ['all', ...Object.keys(catalog.categories).filter((c) => catalog.plans.some((p) => p.category === c))];

  return (
    <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[1fr_20rem] lg:items-start">
      <div className="space-y-5">
        {error ? <Alert tone="error" title="ساخت سرور انجام نشد">{error}</Alert> : null}

        {/* ۱. لوکیشن */}
        <Card
          title="۱. لوکیشن دیتاسنتر"
          description={
            catalog.locations.some((l) => l.iranReachPercent !== null)
              ? 'کنار هر لوکیشن، درصد آدرس‌هایی را می‌بینید که از داخل ایران باز شده‌اند. این عدد از آزمایش واقعی سرورهای همین پنل می‌آید.'
              : 'لوکیشن نزدیک‌تر به کاربران شما، تأخیر کمتری دارد.'
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {catalog.locations.map((loc) => {
              const active = location === loc.name;
              const count = catalog.plans.filter((p) => p.prices[loc.name]?.available).length;
              return (
                <button
                  key={loc.name}
                  type="button"
                  onClick={() => setLocation(loc.name)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border p-3 text-right transition',
                    active
                      ? 'border-[var(--color-brand-500)] bg-[color-mix(in_srgb,var(--color-brand-500)_8%,transparent)]'
                      : 'hover:bg-[var(--surface-2)]',
                  )}
                >
                  <span className="text-2xl leading-none">{loc.flag ?? '🌐'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{loc.title}</span>
                    <span className="mt-0.5 block text-[11px] muted">
                      {loc.name.toUpperCase()} · {formatNumber(count)} پلن موجود
                    </span>
                    {loc.iranReachPercent !== null ? (
                      <span
                        className={cn(
                          'mt-1 inline-flex items-center gap-1 text-[11px] font-semibold',
                          loc.iranReachPercent >= 80
                            ? 'text-emerald-600'
                            : loc.iranReachPercent >= 50
                              ? 'text-amber-600'
                              : 'text-red-500',
                        )}
                      >
                        <Signal size={11} />
                        دسترسی از ایران {formatNumber(loc.iranReachPercent)}٪
                      </span>
                    ) : null}
                  </span>
                  {active ? <Check size={17} className="shrink-0 text-[var(--color-brand-600)]" /> : null}
                </button>
              );
            })}
          </div>
        </Card>

        {/* ۲. پلن */}
        <Card
          title="۲. انتخاب پلن"
          description="قیمت‌ها به تومان و شامل تمام هزینه‌هاست."
          action={
            <div className="scroll-x max-w-full">
              <div className="flex gap-1">
                {categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={cn(
                      'whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-semibold transition',
                      category === c ? 'bg-[var(--color-brand-600)] text-white' : 'muted hover:bg-[var(--surface-2)]',
                    )}
                  >
                    {c === 'all' ? 'همه' : catalog.categories[c] ?? c}
                  </button>
                ))}
              </div>
            </div>
          }
          bodyClassName="p-0"
        >
          <div className="space-y-2.5 border-b p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold muted">انتخاب سریع:</span>
              {quickPicks.map((q) => (
                <button
                  key={q.key}
                  type="button"
                  disabled={!q.plan}
                  title={q.hint}
                  onClick={() => q.plan && choosePlan(q.plan.name)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition',
                    q.plan && plan === q.plan.name
                      ? 'border-[var(--color-brand-500)] bg-[color-mix(in_srgb,var(--color-brand-500)_10%,transparent)] text-[var(--color-brand-600)]'
                      : 'hover:bg-[var(--surface-2)]',
                    !q.plan && 'cursor-not-allowed opacity-40',
                  )}
                >
                  {q.icon}
                  {q.label}
                  {q.plan ? <span className="mono uppercase opacity-70">· {q.plan.name}</span> : null}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="w-36 max-w-full">
                <Select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="py-1.5 text-xs"
                >
                  <option value="price">ارزان‌ترین اول</option>
                  <option value="priceDesc">گران‌ترین اول</option>
                  <option value="memory">بیشترین رم</option>
                  <option value="cores">بیشترین هسته</option>
                  <option value="disk">بیشترین دیسک</option>
                  <option value="traffic">بیشترین ترافیک</option>
                </Select>
              </div>
              <div className="w-32 max-w-full">
                <Select
                  value={minMemory}
                  onChange={(e) => setMinMemory(Number(e.target.value))}
                  className="py-1.5 text-xs"
                >
                  <option value={0}>هر مقدار رم</option>
                  <option value={4}>رم ۴+ گیگ</option>
                  <option value={8}>رم ۸+ گیگ</option>
                  <option value={16}>رم ۱۶+ گیگ</option>
                  <option value={32}>رم ۳۲+ گیگ</option>
                </Select>
              </div>
              <div className="w-32 max-w-full">
                <Select
                  value={minCores}
                  onChange={(e) => setMinCores(Number(e.target.value))}
                  className="py-1.5 text-xs"
                >
                  <option value={0}>هر تعداد هسته</option>
                  <option value={2}>۲+ هسته</option>
                  <option value={4}>۴+ هسته</option>
                  <option value={8}>۸+ هسته</option>
                  <option value={16}>۱۶+ هسته</option>
                </Select>
              </div>
              <button
                type="button"
                onClick={() => setOnlyAvailable((v) => !v)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition',
                  onlyAvailable
                    ? 'border-[var(--color-brand-500)] bg-[color-mix(in_srgb,var(--color-brand-500)_10%,transparent)] text-[var(--color-brand-600)]'
                    : 'hover:bg-[var(--surface-2)]',
                )}
              >
                {onlyAvailable ? <Check size={12} /> : null}
                فقط موجودها
              </button>
            </div>
          </div>

          {visiblePlans.length === 0 ? (
            <div className="px-5 py-10 text-center text-xs muted">
              پلنی با این فیلترها پیدا نشد.
              <button
                type="button"
                onClick={resetPlanFilters}
                className="mx-auto mt-2 block font-semibold text-[var(--color-brand-600)] hover:underline"
              >
                پاک کردن فیلترها
              </button>
            </div>
          ) : (
            <>
            {/* نسخه گوشی: هر پلن یک کارت قابل لمس */}
            <div className="max-h-[26rem] space-y-2 overflow-y-auto p-3 md:hidden">
              {visiblePlans.map((p) => {
                const price = p.prices[location];
                const active = plan === p.name;
                const disabled = !price?.available;
                return (
                  <button
                    key={p.name}
                    type="button"
                    data-plan-row={p.name}
                    disabled={disabled}
                    onClick={() => setPlan(p.name)}
                    className={cn(
                      'w-full rounded-xl border p-3 text-right transition',
                      active
                        ? 'border-[var(--color-brand-500)] bg-[color-mix(in_srgb,var(--color-brand-500)_10%,transparent)]'
                        : 'hover:bg-[var(--surface-2)]',
                      disabled && 'cursor-not-allowed opacity-45',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-bold uppercase">{p.name}</div>
                        <div className="mt-0.5 text-[10px] muted">
                          {p.architecture === 'arm' ? 'ARM' : p.cpuType === 'dedicated' ? 'اختصاصی' : 'اشتراکی'}
                          {disabled ? ' · ناموجود' : ''}
                        </div>
                      </div>
                      <span
                        className={cn(
                          'grid h-5 w-5 shrink-0 place-items-center rounded-full border',
                          active ? 'border-[var(--color-brand-600)] bg-[var(--color-brand-600)]' : '',
                        )}
                      >
                        {active ? <Check size={13} className="text-white" /> : null}
                      </span>
                    </div>

                    <div className="tabular mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] muted">
                      <span>
                        <Cpu size={11} className="ml-1 inline" />
                        {formatNumber(p.cores)} هسته
                      </span>
                      <span>
                        <MemoryStick size={11} className="ml-1 inline" />
                        {formatNumber(p.memory)} گیگ رم
                      </span>
                      <span>
                        <HardDrive size={11} className="ml-1 inline" />
                        {formatNumber(p.disk)} گیگ دیسک
                      </span>
                      <span>{formatTraffic(p.includedTraffic)} ترافیک</span>
                    </div>

                    <div className="tabular mt-2 flex items-center justify-between border-t pt-2 text-xs">
                      <span className="muted">
                        ساعتی {formatToman(price?.hourly ?? 0, { suffix: false })}
                      </span>
                      <span className="font-bold">
                        ماهانه {formatToman(price?.monthly ?? 0, { suffix: false })}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="hidden max-h-[30rem] overflow-y-auto md:block">
              <table className="table">
                <thead className="sticky top-0 z-10" style={{ background: 'var(--surface)' }}>
                  <tr>
                    <th>پلن</th>
                    <th>پردازنده</th>
                    <th>حافظه</th>
                    <th>دیسک</th>
                    <th>ترافیک</th>
                    <th>ساعتی</th>
                    <th>ماهانه</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePlans.map((p) => {
                    const price = p.prices[location];
                    const active = plan === p.name;
                    const disabled = !price?.available;
                    return (
                      <tr
                        key={p.name}
                        data-plan-row={p.name}
                        onClick={() => !disabled && setPlan(p.name)}
                        className={cn(
                          'cursor-pointer transition',
                          active && 'bg-[color-mix(in_srgb,var(--color-brand-500)_10%,transparent)]',
                          disabled && 'cursor-not-allowed opacity-45',
                        )}
                      >
                        <td>
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'grid h-4 w-4 shrink-0 place-items-center rounded-full border',
                                active ? 'border-[var(--color-brand-600)] bg-[var(--color-brand-600)]' : '',
                              )}
                            >
                              {active ? <Check size={11} className="text-white" /> : null}
                            </span>
                            <span>
                              <span className="block text-xs font-bold uppercase">{p.name}</span>
                              <span className="block text-[10px] muted">
                                {p.architecture === 'arm' ? 'ARM' : p.cpuType === 'dedicated' ? 'اختصاصی' : 'اشتراکی'}
                                {disabled ? ' · ناموجود' : ''}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="tabular whitespace-nowrap text-xs">
                          <Cpu size={12} className="ml-1 inline muted" />
                          {formatNumber(p.cores)} هسته
                        </td>
                        <td className="tabular whitespace-nowrap text-xs">
                          <MemoryStick size={12} className="ml-1 inline muted" />
                          {formatNumber(p.memory)} گیگ
                        </td>
                        <td className="tabular whitespace-nowrap text-xs">
                          <HardDrive size={12} className="ml-1 inline muted" />
                          {formatNumber(p.disk)} گیگ
                        </td>
                        <td className="tabular whitespace-nowrap text-[11px] muted">
                          {formatTraffic(p.includedTraffic)}
                        </td>
                        <td className="tabular whitespace-nowrap text-xs">
                          {formatToman(price?.hourly ?? 0, { suffix: false })}
                        </td>
                        <td className="tabular whitespace-nowrap text-xs font-bold">
                          {formatToman(price?.monthly ?? 0, { suffix: false })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </Card>

        {/* ۳. سیستم‌عامل */}
        <Card title="۳. سیستم‌عامل" description="سیستم‌عامل پایه روی سرور نصب می‌شود.">
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {compatibleImages.map((img) => {
              const os = osFa(img.osFlavor);
              const active = image === String(img.id);
              return (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setImage(String(img.id))}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl border p-3 text-right transition',
                    active
                      ? 'border-[var(--color-brand-500)] bg-[color-mix(in_srgb,var(--color-brand-500)_8%,transparent)]'
                      : 'hover:bg-[var(--surface-2)]',
                  )}
                >
                  <span
                    className="h-8 w-1.5 shrink-0 rounded-full"
                    style={{ background: os.color }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{img.description}</span>
                    <span className="block text-[10px] muted">{os.label}</span>
                  </span>
                  {active ? <Check size={15} className="shrink-0 text-[var(--color-brand-600)]" /> : null}
                </button>
              );
            })}
          </div>
          {selectedPlan?.architecture === 'arm' ? (
            <p className="mt-3 text-[11px] leading-6 muted">
              این پلن پردازنده ARM دارد؛ فقط سیستم‌عامل‌های سازگار با ARM نمایش داده می‌شوند.
            </p>
          ) : null}
        </Card>

        {/* ۴. نصب یک‌کلیکه */}
        <Card
          title="۴. نصب خودکار (اختیاری)"
          description="به جای نصب دستی، سرور را با نرم‌افزار آماده تحویل بگیرید."
        >
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((t) => {
              const active = appTemplate === t.slug;
              return (
                <button
                  key={t.slug}
                  type="button"
                  onClick={() => setAppTemplate(t.slug)}
                  className={cn(
                    'flex items-start gap-2.5 rounded-xl border p-3 text-right transition',
                    active
                      ? 'border-[var(--color-brand-500)] bg-[color-mix(in_srgb,var(--color-brand-500)_8%,transparent)]'
                      : 'hover:bg-[var(--surface-2)]',
                  )}
                >
                  <span className="text-xl leading-none">{t.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-semibold">{t.name}</span>
                      {active ? <Check size={13} className="shrink-0 text-[var(--color-brand-600)]" /> : null}
                    </span>
                    <span className="mt-1 block text-[10px] leading-5 muted">{t.description}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {selectedTemplate && selectedTemplate.slug !== 'none' ? (
            <div className="mt-4 rounded-xl p-3 text-[11px] leading-7 surface-2">
              <div className="font-semibold">نکات {selectedTemplate.name}</div>
              <ul className="mt-1 list-inside list-disc muted">
                {selectedTemplate.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
                <li>
                  پورت‌هایی که باز می‌شوند: <span className="ltr">{selectedTemplate.ports.join('، ')}</span>
                </li>
                <li>نصب پس از تحویل سرور چند دقیقه طول می‌کشد.</li>
              </ul>
            </div>
          ) : null}
        </Card>

        {/* ۵. نحوه پرداخت */}
        <Card title="۵. دوره صورتحساب">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setCycle('HOURLY')}
              className={cn(
                'rounded-xl border p-4 text-right transition',
                cycle === 'HOURLY'
                  ? 'border-[var(--color-brand-500)] bg-[color-mix(in_srgb,var(--color-brand-500)_8%,transparent)]'
                  : 'hover:bg-[var(--surface-2)]',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">پرداخت ساعتی</span>
                {cycle === 'HOURLY' ? <Check size={16} className="text-[var(--color-brand-600)]" /> : null}
              </div>
              <p className="mt-2 text-[11px] leading-6 muted">
                هر ساعت از کیف پول کسر می‌شود. هر زمان خواستید سرور را حذف کنید و پرداخت متوقف شود. سقف پرداخت ماهانه
                از قیمت ماهانه بیشتر نمی‌شود.
              </p>
              {quote ? (
                <p className="tabular mt-2 text-xs font-bold">
                  {formatToman(quote.hourly, { suffix: false })} تومان / ساعت
                </p>
              ) : null}
            </button>

            <button
              type="button"
              onClick={() => setCycle('MONTHLY')}
              className={cn(
                'rounded-xl border p-4 text-right transition',
                cycle === 'MONTHLY'
                  ? 'border-[var(--color-brand-500)] bg-[color-mix(in_srgb,var(--color-brand-500)_8%,transparent)]'
                  : 'hover:bg-[var(--surface-2)]',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">پرداخت ماهانه</span>
                {cycle === 'MONTHLY' ? <Check size={16} className="text-[var(--color-brand-600)]" /> : null}
              </div>
              <p className="mt-2 text-[11px] leading-6 muted">
                هزینه کل دوره در ابتدا پرداخت می‌شود و در سررسید به صورت خودکار تمدید می‌گردد.
              </p>
              {quote ? (
                <p className="tabular mt-2 text-xs font-bold">
                  {formatToman(quote.monthly, { suffix: false })} تومان / ماه
                </p>
              ) : null}
            </button>
          </div>

          {cycle === 'MONTHLY' ? (
            <div className="mt-4 max-w-xs">
              <Field label="مدت پیش‌پرداخت">
                <Select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                  {[1, 2, 3, 6, 12].map((m) => (
                    <option key={m} value={m}>
                      {formatNumber(m)} ماه
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}
        </Card>

        {/* ۵. تنظیمات */}
        <Card title="۶. مشخصات و دسترسی">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="نام سرور"
              required
              error={fields.name}
              hint="فقط حروف انگلیسی، عدد، نقطه و خط تیره."
            >
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="ltr mono"
                dir="ltr"
                placeholder="my-server"
                required
              />
            </Field>
            <Field label="برچسب (اختیاری)" hint="برای شناسایی راحت‌تر در لیست سرورها.">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="سرور فروشگاه" />
            </Field>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="label mb-0">کلیدهای SSH</span>
              <Link href="/dashboard/ssh-keys" className="text-[11px] text-[var(--color-brand-600)] hover:underline">
                مدیریت کلیدها
              </Link>
            </div>
            {sshKeys.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-xs leading-6 muted">
                <KeyRound size={15} className="ml-1 inline" />
                کلید SSH ندارید. در این صورت رمز روت ساخته و به شما نمایش داده می‌شود. برای امنیت بیشتر توصیه می‌شود
                کلید SSH اضافه کنید.
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {sshKeys.map((k) => {
                  const active = selectedKeys.includes(k.id);
                  return (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() =>
                        setSelectedKeys((prev) => (active ? prev.filter((x) => x !== k.id) : [...prev, k.id]))
                      }
                      className={cn(
                        'flex items-center gap-2 rounded-xl border p-3 text-right transition',
                        active
                          ? 'border-[var(--color-brand-500)] bg-[color-mix(in_srgb,var(--color-brand-500)_8%,transparent)]'
                          : 'hover:bg-[var(--surface-2)]',
                      )}
                    >
                      <span
                        className={cn(
                          'grid h-4 w-4 shrink-0 place-items-center rounded border',
                          active ? 'border-[var(--color-brand-600)] bg-[var(--color-brand-600)]' : '',
                        )}
                      >
                        {active ? <Check size={11} className="text-white" /> : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold">{k.name}</span>
                        <span className="mono ltr block truncate text-[10px] muted">{k.fingerprint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-5 space-y-4 border-t pt-4">
            <Toggle
              checked={backups}
              onChange={setBackups}
              label="پشتیبان‌گیری خودکار"
              description={
                quote
                  ? `نگهداری ۷ نسخه پشتیبان روزانه — ${formatToman(quote.backup.monthly)} در ماه (۲۰٪ قیمت سرور)`
                  : 'نگهداری ۷ نسخه پشتیبان روزانه — ۲۰٪ قیمت سرور'
              }
            />

            <Toggle
              checked={monitoring}
              onChange={setMonitoring}
              label="پایش خودکار در دسترس بودن"
              description="هر چند دقیقه از بیرون به سرور وصل می‌شویم؛ اگر قطع شد فوراً خبرتان می‌کنیم. رایگان است."
            />

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs font-semibold text-[var(--color-brand-600)] hover:underline"
            >
              {showAdvanced ? 'بستن تنظیمات پیشرفته' : 'تنظیمات پیشرفته (cloud-init)'}
            </button>

            {showAdvanced ? (
              <Field
                label="اسکریپت راه‌اندازی اولیه (cloud-init)"
                hint="این اسکریپت هنگام اولین بوت سرور اجرا می‌شود. اگر مطمئن نیستید، خالی بگذارید."
              >
                <Textarea
                  value={userData}
                  onChange={(e) => setUserData(e.target.value)}
                  className="mono ltr min-h-40 text-xs"
                  dir="ltr"
                  placeholder={'#cloud-config\npackages:\n  - nginx'}
                />
              </Field>
            ) : null}
          </div>
        </Card>
      </div>

      {/* خلاصه سفارش */}
      <aside className="lg:sticky lg:top-20">
        <Card title="خلاصه سفارش">
          {!plan ? (
            <p className="py-6 text-center text-xs leading-6 muted">
              <ServerIcon size={30} className="mx-auto mb-3 opacity-40" />
              برای دیدن قیمت، یک پلن انتخاب کنید.
            </p>
          ) : (
            <div className="space-y-3 text-xs">
              <Row icon={<Globe size={13} />} label="لوکیشن" value={catalog.locations.find((l) => l.name === location)?.title ?? location} />
              <Row icon={<ServerIcon size={13} />} label="پلن" value={selectedPlan?.name.toUpperCase() ?? '—'} />
              <Row
                icon={<Cpu size={13} />}
                label="مشخصات"
                value={`${formatNumber(selectedPlan?.cores ?? 0)} هسته · ${formatNumber(selectedPlan?.memory ?? 0)} گیگ رم · ${formatNumber(selectedPlan?.disk ?? 0)} گیگ`}
              />
              <Row icon={<HardDrive size={13} />} label="سیستم‌عامل" value={selectedImage?.description ?? '—'} />
              {selectedTemplate && selectedTemplate.slug !== 'none' ? (
                <Row icon={<Sparkles size={13} />} label="نصب خودکار" value={selectedTemplate.name} tone="ok" />
              ) : null}
              <Row
                icon={<Network size={13} />}
                label="ترافیک ماهانه"
                value={formatTraffic(selectedPlan?.includedTraffic ?? 0)}
              />

              <div className="border-t pt-3" />

              {quote ? (
                <>
                  <Row label="هزینه پایه" value={formatToman(cycle === 'HOURLY' ? quote.basePrice.hourly : quote.basePrice.monthly)} />
                  {backups ? (
                    <Row
                      label="پشتیبان‌گیری"
                      value={`+ ${formatToman(cycle === 'HOURLY' ? quote.backup.hourly : quote.backup.monthly, { suffix: false })}`}
                    />
                  ) : null}
                  {quote.discountPct > 0 ? (
                    <Row label="تخفیف شما" value={`${formatNumber(quote.discountPct)}٪`} tone="ok" />
                  ) : null}

                  <div className="rounded-xl p-3 surface-2">
                    <div className="flex items-center justify-between">
                      <span className="muted">
                        {cycle === 'HOURLY' ? 'هزینه هر ساعت' : `هزینه ${formatNumber(months)} ماه`}
                      </span>
                      <span className="tabular text-sm font-extrabold">
                        {formatToman(cycle === 'HOURLY' ? quote.hourly : quote.monthly * months)}
                      </span>
                    </div>
                    {cycle === 'HOURLY' ? (
                      <div className="mt-1.5 flex items-center justify-between text-[11px] muted">
                        <span>سقف ماهانه</span>
                        <span className="tabular">{formatToman(quote.monthly)}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="muted">پرداخت هنگام ساخت</span>
                    <span className="tabular font-bold">{formatToman(quote.dueNow)}</span>
                  </div>

                  {cycle === 'HOURLY' ? (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="muted">حداقل اعتبار لازم</span>
                      <span className="tabular muted">
                        {formatToman(quote.minBalance)} ({formatNumber(prepayHours)} ساعت)
                      </span>
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between border-t pt-3">
                    <span className="flex items-center gap-1 muted">
                      <Wallet size={13} /> موجودی شما
                    </span>
                    <span className={cn('tabular font-bold', quote.enough ? 'text-emerald-600' : 'text-red-500')}>
                      {formatToman(quote.balance)}
                    </span>
                  </div>

                  {!quote.enough ? (
                    <Alert tone="error" title="موجودی کافی نیست">
                      برای ساخت این سرور {formatToman(quote.shortfall)} کم دارید.
                      <Link href="/dashboard/wallet" className="mt-2 block font-semibold underline">
                        شارژ کیف پول
                      </Link>
                    </Alert>
                  ) : null}
                </>
              ) : (
                <div className="py-4 text-center text-[11px] muted">در حال محاسبه قیمت…</div>
              )}
            </div>
          )}

          <Button type="submit" className="mt-5 w-full" loading={submitting} disabled={!canSubmit}>
            <ShieldCheck size={16} />
            ساخت و تحویل سرور
          </Button>

          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-6 muted">
            <Info size={13} className="mt-1 shrink-0" />
            با زدن این دکمه، مبلغ از کیف پول کسر و سرور بلافاصله ساخته می‌شود. در صورت بروز خطا مبلغ به طور کامل
            بازگردانده می‌شود.
          </p>

          {balance > 0 ? (
            <Link
              href="/dashboard/wallet"
              className="mt-3 flex items-center justify-center gap-1 text-[11px] text-[var(--color-brand-600)] hover:underline"
            >
              افزایش موجودی <ArrowLeft size={12} />
            </Link>
          ) : null}
        </Card>
      </aside>
    </form>
  );
}

function Row({
  icon,
  label,
  value,
  tone,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  tone?: 'ok';
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="flex shrink-0 items-center gap-1 muted">
        {icon}
        {label}
      </span>
      <span className={cn('text-left font-medium', tone === 'ok' && 'text-emerald-600')}>{value}</span>
    </div>
  );
}
