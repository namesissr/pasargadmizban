'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { RefreshCw, Zap, Save, History, CircleAlert } from 'lucide-react';
import { Alert, Badge, Button, Card, Field, Input, MoneyInput, Select, Toggle } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, apiPost, errorMessage, fetcher } from '@/lib/client';
import { faRelative } from '@/lib/utils';

export type EurAutoConfig = {
  enabled: boolean;
  source: string;
  hasApiKey: boolean;
  url: string;
  jsonPath: string;
  unit: string;
  markupFixed: number;
  markupPercent: number;
  intervalHours: number;
  maxChangePercent: number;
  roundTo: number;
};

type HistoryRow = {
  id: string;
  fetchedRate: number;
  appliedRate: number | null;
  previousRate: number;
  source: string;
  applied: boolean;
  error: string | null;
  createdAt: string;
};

const fa = (n: number) => new Intl.NumberFormat('fa-IR').format(n);

const SOURCES = [
  { value: 'navasan', label: 'نوسان (navasan.tech) — نیازمند کلید رایگان' },
  { value: 'tgju', label: 'شبکه اطلاع‌رسانی طلا و ارز (tgju.org)' },
  { value: 'custom', label: 'آدرس دلخواه (JSON)' },
];

export function EurAutoCard({ config, onSaved }: { config: EurAutoConfig; onSaved: () => void }) {
  const toast = useToast();
  const { data: log, mutate: mutateLog } = useSWR<{ history: HistoryRow[]; current: number }>(
    '/api/admin/eur-rate',
    fetcher,
  );

  const [form, setForm] = useState({
    eurAutoEnabled: config.enabled,
    eurAutoSource: config.source,
    eurAutoApiKey: '',
    eurAutoUrl: config.url,
    eurAutoJsonPath: config.jsonPath,
    eurAutoUnit: config.unit,
    eurAutoMarkupFixed: config.markupFixed,
    eurAutoMarkupPercent: config.markupPercent,
    eurAutoIntervalHours: config.intervalHours,
    eurAutoMaxChangePercent: config.maxChangePercent,
    eurAutoRoundTo: config.roundTo,
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { ...form };
      // کلید خالی یعنی «کلید فعلی را نگه دار»
      if (!form.eurAutoApiKey.trim()) delete body.eurAutoApiKey;
      const res = await api<{ message: string }>('/api/admin/settings', { method: 'PATCH', body });
      toast.success(res.message);
      onSaved();
      mutateLog();
    } catch (err) {
      toast.error('ذخیره انجام نشد', errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    try {
      // ابتدا تنظیمات فعلی فرم ذخیره می‌شود تا آزمایش با همان انجام شود
      const body: Record<string, unknown> = { ...form };
      if (!form.eurAutoApiKey.trim()) delete body.eurAutoApiKey;
      await api('/api/admin/settings', { method: 'PATCH', body });
      const res = await apiPost<{ message: string }>('/api/admin/eur-rate', { action: 'test' });
      setTestResult({ ok: true, message: res.message });
      onSaved();
    } catch (err) {
      setTestResult({ ok: false, message: errorMessage(err) });
    } finally {
      setTesting(false);
    }
  }

  async function applyNow() {
    setApplying(true);
    try {
      const res = await apiPost<{ status: string; message: string }>('/api/admin/eur-rate', { action: 'apply' });
      if (res.status === 'applied' || res.status === 'unchanged') toast.success(res.message);
      else toast.error('اعمال نشد', res.message);
      onSaved();
      mutateLog();
    } catch (err) {
      toast.error('اعمال نشد', errorMessage(err));
    } finally {
      setApplying(false);
    }
  }

  return (
    <Card
      title="نرخ خودکار یورو"
      description="نرخ از منبع انتخابی گرفته می‌شود، حاشیه شما رویش می‌آید و در بازه تنظیم‌شده روی همه قیمت‌ها اعمال می‌شود."
      action={
        form.eurAutoEnabled ? <Badge tone="ok">فعال</Badge> : <Badge tone="muted">خاموش</Badge>
      }
    >
      <div className="space-y-4">
        <Toggle
          checked={form.eurAutoEnabled}
          onChange={(v) => set('eurAutoEnabled', v)}
          label="به‌روزرسانی خودکار فعال باشد"
          description="با خاموش بودن، نرخ فقط دستی از کادر «نرخ هر یورو» عوض می‌شود."
        />

        <Field label="منبع نرخ">
          <Select value={form.eurAutoSource} onChange={(e) => set('eurAutoSource', e.target.value)}>
            {SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>

        {form.eurAutoSource === 'navasan' ? (
          <Field
            label="کلید API نوسان"
            hint={
              config.hasApiKey
                ? 'کلیدی ذخیره شده است؛ برای تغییر، کلید تازه را وارد کنید.'
                : 'از api.navasan.tech رایگان بگیرید.'
            }
          >
            <Input
              value={form.eurAutoApiKey}
              onChange={(e) => set('eurAutoApiKey', e.target.value)}
              placeholder={config.hasApiKey ? '••••••••' : 'freeXXXXXXXX'}
              className="ltr mono"
              dir="ltr"
              autoComplete="off"
            />
          </Field>
        ) : null}

        {form.eurAutoSource === 'custom' ? (
          <div className="space-y-3">
            <Field label="آدرس JSON" hint="پاسخ باید JSON باشد.">
              <Input
                value={form.eurAutoUrl}
                onChange={(e) => set('eurAutoUrl', e.target.value)}
                placeholder="https://example.com/rates.json"
                className="ltr"
                dir="ltr"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="مسیر مقدار" hint="مثل eur.value یا data.eur">
                <Input
                  value={form.eurAutoJsonPath}
                  onChange={(e) => set('eurAutoJsonPath', e.target.value)}
                  placeholder="eur.value"
                  className="ltr mono"
                  dir="ltr"
                />
              </Field>
              <Field label="واحد عدد منبع">
                <Select value={form.eurAutoUnit} onChange={(e) => set('eurAutoUnit', e.target.value)}>
                  <option value="toman">تومان</option>
                  <option value="rial">ریال (÷۱۰ می‌شود)</option>
                </Select>
              </Field>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="حاشیه ثابت (تومان)" hint="روی نرخ خوانده‌شده اضافه می‌شود.">
            <MoneyInput
              value={form.eurAutoMarkupFixed}
              onValueChange={(v) => set('eurAutoMarkupFixed', v)}
            />
          </Field>
          <Field label="حاشیه درصدی" hint="مثلاً ۲ یعنی ۲٪ بالاتر از نرخ بازار.">
            <Input
              type="number"
              value={form.eurAutoMarkupPercent}
              onChange={(e) => set('eurAutoMarkupPercent', Number(e.target.value))}
              className="ltr tabular"
              dir="ltr"
            />
          </Field>
          <Field label="بازه به‌روزرسانی (ساعت)">
            <Input
              type="number"
              min={1}
              value={form.eurAutoIntervalHours}
              onChange={(e) => set('eurAutoIntervalHours', Number(e.target.value))}
              className="ltr tabular"
              dir="ltr"
            />
          </Field>
          <Field label="سقف تغییر در هر بار (٪)" hint="جهش بیشتر از این، بدون تایید شما اعمال نمی‌شود.">
            <Input
              type="number"
              min={1}
              value={form.eurAutoMaxChangePercent}
              onChange={(e) => set('eurAutoMaxChangePercent', Number(e.target.value))}
              className="ltr tabular"
              dir="ltr"
            />
          </Field>
        </div>

        <Field label="گرد کردن نرخ به مضرب (تومان)">
          <MoneyInput
            value={form.eurAutoRoundTo}
            onValueChange={(v) => set('eurAutoRoundTo', v)}
          />
        </Field>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={save} loading={saving} icon={<Save size={15} />} className="flex-1">
            ذخیره تنظیمات
          </Button>
          <Button variant="secondary" onClick={test} loading={testing} icon={<RefreshCw size={15} />} className="flex-1">
            آزمایش دریافت
          </Button>
          <Button variant="secondary" onClick={applyNow} loading={applying} icon={<Zap size={15} />} className="flex-1">
            دریافت و اعمال
          </Button>
        </div>

        {testResult ? (
          <Alert tone={testResult.ok ? 'info' : 'error'}>{testResult.message}</Alert>
        ) : null}

        {/* تاریخچه */}
        {log?.history?.length ? (
          <div className="border-t pt-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold">
              <History size={13} /> دریافت‌های اخیر
            </div>
            <div className="space-y-1.5">
              {log.history.slice(0, 6).map((h) => (
                <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-[11px] surface-2">
                  <span className="tabular">
                    {h.applied && h.appliedRate ? (
                      <>
                        {fa(h.previousRate)} ← <b>{fa(h.appliedRate)}</b> تومان
                      </>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-600">
                        <CircleAlert size={11} />
                        {h.fetchedRate > 0 ? `${fa(h.fetchedRate)} — اعمال نشد` : 'دریافت ناموفق'}
                      </span>
                    )}
                  </span>
                  <span className="muted">
                    {h.source} · {faRelative(h.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
