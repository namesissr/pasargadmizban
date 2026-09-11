'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Save, Plus, Trash2, Calculator } from 'lucide-react';
import { Alert, Badge, Button, Card, Field, Input, LoadingBlock, Modal, Select } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, apiDelete, apiPost, errorMessage, fetcher } from '@/lib/client';
import { formatToman, formatNumber } from '@/lib/money';
import { cn } from '@/lib/utils';
import { EurAutoCard, type EurAutoConfig } from './eur-auto-card';

type PricingData = {
  rules: {
    id: string;
    scope: string;
    targetKey: string | null;
    markupPercent: number;
    markupFixed: number;
    priority: number;
    active: boolean;
    note: string | null;
  }[];
  settings: {
    eurRate: number;
    markupPercent: number;
    markupFixed: number;
    vatPercent: number;
    roundMonthly: number;
    roundHourly: number;
  };
  preview: {
    name: string;
    description: string;
    cores: number;
    memory: number;
    disk: number;
    prices: Record<
      string,
      { eurMonthly: number; hourly: number; monthly: number; markupPercent: number; available: boolean }
    >;
  }[];
  locations: { name: string; title: string }[];
  eurAuto: EurAutoConfig;
};

const SCOPE_FA: Record<string, string> = {
  GLOBAL: 'سراسری',
  SERVER_TYPE: 'پلن مشخص',
  LOCATION: 'لوکیشن مشخص',
  USER: 'کاربر مشخص',
};

export function PricingClient() {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<PricingData>('/api/admin/pricing', fetcher);

  const [settings, setSettings] = useState<Partial<PricingData['settings']>>({});
  const [saving, setSaving] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [rule, setRule] = useState({
    scope: 'SERVER_TYPE',
    targetKey: '',
    markupPercent: 25,
    markupFixed: 0,
    priority: 10,
    note: '',
  });
  const [ruleBusy, setRuleBusy] = useState(false);
  const [previewLocation, setPreviewLocation] = useState('');

  if (isLoading && !data) return <LoadingBlock />;
  if (!data) return <Alert tone="error">دریافت اطلاعات قیمت‌گذاری ممکن نشد.</Alert>;

  const current = { ...data.settings, ...settings };
  const dirty = Object.keys(settings).length > 0;
  const location = previewLocation || data.locations[0]?.name || '';

  async function saveSettings() {
    setSaving(true);
    try {
      const res = await api<{ message: string }>('/api/admin/settings', { method: 'PATCH', body: current });
      toast.success(res.message);
      setSettings({});
      mutate();
    } catch (err) {
      toast.error('ذخیره تنظیمات انجام نشد', errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveRule() {
    setRuleBusy(true);
    try {
      const res = await apiPost<{ message: string }>('/api/admin/pricing', { ...rule, active: true });
      toast.success(res.message);
      setRuleOpen(false);
      mutate();
    } catch (err) {
      toast.error('ثبت قانون انجام نشد', errorMessage(err));
    } finally {
      setRuleBusy(false);
    }
  }

  async function removeRule(id: string) {
    if (!window.confirm('این قانون حذف شود؟')) return;
    try {
      await apiDelete('/api/admin/pricing', { id });
      toast.success('قانون حذف شد.');
      mutate();
    } catch (err) {
      toast.error('حذف انجام نشد', errorMessage(err));
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
        {/* تنظیمات پایه */}
        <Card title="تنظیمات پایه قیمت" description="این مقادیر پایه محاسبه تمام قیمت‌ها هستند.">
          <div className="space-y-4">
            <Field label="نرخ هر یورو (تومان)" required hint="با نوسان بازار این عدد را به‌روز کنید.">
              <Input
                type="number"
                value={current.eurRate}
                onChange={(e) => setSettings((s) => ({ ...s, eurRate: Number(e.target.value) }))}
                className="ltr tabular text-center font-bold"
                dir="ltr"
              />
            </Field>

            <Field label="درصد سود پیش‌فرض" hint="روی قیمت یورویی هتزنر اعمال می‌شود.">
              <Input
                type="number"
                value={current.markupPercent}
                onChange={(e) => setSettings((s) => ({ ...s, markupPercent: Number(e.target.value) }))}
                className="ltr tabular"
                dir="ltr"
              />
            </Field>

            <Field label="مبلغ ثابت اضافه (تومان در ماه)" hint="برای پوشش هزینه‌های جانبی مثل کارمزد درگاه.">
              <Input
                type="number"
                value={current.markupFixed}
                onChange={(e) => setSettings((s) => ({ ...s, markupFixed: Number(e.target.value) }))}
                className="ltr tabular"
                dir="ltr"
              />
            </Field>

            <Field label="مالیات بر ارزش افزوده (درصد)">
              <Input
                type="number"
                value={current.vatPercent}
                onChange={(e) => setSettings((s) => ({ ...s, vatPercent: Number(e.target.value) }))}
                className="ltr tabular"
                dir="ltr"
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="گرد کردن ماهانه" hint="مضرب تومان">
                <Input
                  type="number"
                  value={current.roundMonthly}
                  onChange={(e) => setSettings((s) => ({ ...s, roundMonthly: Number(e.target.value) }))}
                  className="ltr tabular"
                  dir="ltr"
                />
              </Field>
              <Field label="گرد کردن ساعتی" hint="مضرب تومان">
                <Input
                  type="number"
                  value={current.roundHourly}
                  onChange={(e) => setSettings((s) => ({ ...s, roundHourly: Number(e.target.value) }))}
                  className="ltr tabular"
                  dir="ltr"
                />
              </Field>
            </div>

            <Button onClick={saveSettings} loading={saving} disabled={!dirty} icon={<Save size={15} />} className="w-full">
              ذخیره تنظیمات
            </Button>

            <div className="rounded-xl p-3 text-[11px] leading-6 surface-2">
              <Calculator size={13} className="ml-1 inline" />
              فرمول: قیمت یورویی هتزنر × نرخ یورو × (۱ + درصد سود) + مبلغ ثابت، سپس گرد شدن به بالا.
            </div>
          </div>
        </Card>

        {/* قوانین */}
        <Card
          className="lg:col-span-2"
          title="قوانین اختصاصی"
          description="اولویت اعمال: کاربر ← پلن ← لوکیشن ← سراسری."
          action={
            <Button size="sm" onClick={() => setRuleOpen(true)} icon={<Plus size={14} />}>
              قانون جدید
            </Button>
          }
          bodyClassName={data.rules.length ? 'p-0' : undefined}
        >
          {data.rules.length === 0 ? (
            <p className="py-8 text-center text-xs muted">
              قانون اختصاصی تعریف نشده است؛ درصد سود پیش‌فرض روی همه پلن‌ها اعمال می‌شود.
            </p>
          ) : (
            <div className="scroll-x">
              <table className="table table-cards">
                <thead>
                  <tr>
                    <th>دامنه</th>
                    <th>مقصد</th>
                    <th>درصد سود</th>
                    <th>مبلغ ثابت</th>
                    <th>اولویت</th>
                    <th>وضعیت</th>
                    <th className="text-left">حذف</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rules.map((r) => (
                    <tr key={r.id}>
                      <td data-label="دامنه" className="whitespace-nowrap text-xs font-semibold">{SCOPE_FA[r.scope] ?? r.scope}</td>
                      <td data-label="مقصد" className="ltr text-xs muted">{r.targetKey ?? '—'}</td>
                      <td data-label="درصد سود" className="tabular text-xs">{formatNumber(r.markupPercent)}٪</td>
                      <td data-label="مبلغ ثابت" className="tabular text-xs">{formatToman(r.markupFixed, { suffix: false })}</td>
                      <td data-label="اولویت" className="tabular text-xs muted">{formatNumber(r.priority)}</td>
                      <td data-label="وضعیت">
                        <Badge tone={r.active ? 'ok' : 'muted'}>{r.active ? 'فعال' : 'غیرفعال'}</Badge>
                      </td>
                      <td data-label="حذف" className="text-left">
                        <button
                          onClick={() => removeRule(r.id)}
                          className="rounded-lg p-1.5 muted transition hover:text-red-500"
                          aria-label="حذف قانون"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>


      <EurAutoCard config={data.eurAuto} onSaved={() => mutate()} />

      {/* پیش‌نمایش */}
      <Card
        title="پیش‌نمایش قیمت نهایی"
        description="قیمتی که مشتری می‌بیند، پس از اعمال تمام قوانین."
        action={
          <Select
            value={location}
            onChange={(e) => setPreviewLocation(e.target.value)}
            className="w-44 text-xs"
          >
            {data.locations.map((l) => (
              <option key={l.name} value={l.name}>
                {l.title}
              </option>
            ))}
          </Select>
        }
        bodyClassName="p-0"
      >
        {data.preview.length === 0 ? (
          <p className="py-10 text-center text-xs muted">ابتدا کاتالوگ را همگام‌سازی کنید.</p>
        ) : (
          <div className="scroll-x max-h-[32rem] overflow-y-auto">
            <table className="table table-cards">
              <thead className="sticky top-0 z-10" style={{ background: 'var(--surface)' }}>
                <tr>
                  <th>پلن</th>
                  <th>مشخصات</th>
                  <th>قیمت هتزنر (یورو)</th>
                  <th>سود</th>
                  <th>قیمت ساعتی</th>
                  <th>قیمت ماهانه</th>
                  <th>سود ماهانه شما</th>
                </tr>
              </thead>
              <tbody>
                {data.preview.map((p) => {
                  const price = p.prices[location];
                  if (!price) return null;
                  const cost = price.eurMonthly * current.eurRate;
                  const profit = price.monthly - cost;
                  return (
                    <tr key={p.name} className={price.available ? '' : 'opacity-50'}>
                      <td data-label="پلن" className="text-xs font-bold uppercase">{p.name}</td>
                      <td data-label="مشخصات" className="tabular whitespace-nowrap text-[11px] muted">
                        {formatNumber(p.cores)} هسته · {formatNumber(p.memory)} گیگ · {formatNumber(p.disk)} گیگ
                      </td>
                      <td data-label="قیمت هتزنر (یورو)" className="tabular ltr text-xs muted">€{price.eurMonthly.toFixed(2)}</td>
                      <td data-label="سود" className="tabular text-xs">{formatNumber(price.markupPercent)}٪</td>
                      <td data-label="قیمت ساعتی" className="tabular whitespace-nowrap text-xs">
                        {formatToman(price.hourly, { suffix: false })}
                      </td>
                      <td data-label="قیمت ماهانه" className="tabular whitespace-nowrap text-xs font-bold">
                        {formatToman(price.monthly, { suffix: false })}
                      </td>
                      <td data-label="سود ماهانه شما"
                        className={cn(
                          'tabular whitespace-nowrap text-xs font-semibold',
                          profit > 0 ? 'text-emerald-600' : 'text-red-500',
                        )}
                      >
                        {formatToman(Math.round(profit), { suffix: false })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={ruleOpen}
        onClose={() => setRuleOpen(false)}
        title="قانون قیمت‌گذاری جدید"
        description="اگر قانونی با همین دامنه و مقصد وجود داشته باشد، به‌روزرسانی می‌شود."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRuleOpen(false)} disabled={ruleBusy}>
              انصراف
            </Button>
            <Button onClick={saveRule} loading={ruleBusy}>
              ذخیره قانون
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="دامنه اعمال" required>
            <Select value={rule.scope} onChange={(e) => setRule((r) => ({ ...r, scope: e.target.value }))}>
              {Object.entries(SCOPE_FA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>

          {rule.scope !== 'GLOBAL' ? (
            <Field
              label={
                rule.scope === 'SERVER_TYPE'
                  ? 'نام پلن'
                  : rule.scope === 'LOCATION'
                    ? 'نام لوکیشن'
                    : 'شناسه کاربر'
              }
              required
              hint={
                rule.scope === 'SERVER_TYPE'
                  ? 'مثلاً cx22'
                  : rule.scope === 'LOCATION'
                    ? 'مثلاً fsn1'
                    : 'شناسه کاربر را از صفحه مدیریت کاربر کپی کنید.'
              }
            >
              {rule.scope === 'SERVER_TYPE' ? (
                <Select value={rule.targetKey} onChange={(e) => setRule((r) => ({ ...r, targetKey: e.target.value }))}>
                  <option value="">انتخاب کنید</option>
                  {data.preview.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name.toUpperCase()}
                    </option>
                  ))}
                </Select>
              ) : rule.scope === 'LOCATION' ? (
                <Select value={rule.targetKey} onChange={(e) => setRule((r) => ({ ...r, targetKey: e.target.value }))}>
                  <option value="">انتخاب کنید</option>
                  {data.locations.map((l) => (
                    <option key={l.name} value={l.name}>
                      {l.title}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  value={rule.targetKey}
                  onChange={(e) => setRule((r) => ({ ...r, targetKey: e.target.value }))}
                  className="ltr mono"
                  dir="ltr"
                />
              )}
            </Field>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="درصد سود" required>
              <Input
                type="number"
                value={rule.markupPercent}
                onChange={(e) => setRule((r) => ({ ...r, markupPercent: Number(e.target.value) }))}
                className="ltr tabular"
                dir="ltr"
              />
            </Field>
            <Field label="مبلغ ثابت (تومان)">
              <Input
                type="number"
                value={rule.markupFixed}
                onChange={(e) => setRule((r) => ({ ...r, markupFixed: Number(e.target.value) }))}
                className="ltr tabular"
                dir="ltr"
              />
            </Field>
          </div>

          <Field label="اولویت" hint="عدد بزرگ‌تر یعنی اولویت بالاتر.">
            <Input
              type="number"
              value={rule.priority}
              onChange={(e) => setRule((r) => ({ ...r, priority: Number(e.target.value) }))}
              className="ltr tabular"
              dir="ltr"
            />
          </Field>

          <Field label="یادداشت">
            <Input value={rule.note} onChange={(e) => setRule((r) => ({ ...r, note: e.target.value }))} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
