'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Shield, Plus, Trash2, Save } from 'lucide-react';
import { Alert, Button, Field, Input, LoadingBlock, Select } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiDelete, apiPost, errorMessage, fetcher } from '@/lib/client';
import type { ServerData } from '../detail';

type Rule = {
  direction: 'in' | 'out';
  protocol: 'tcp' | 'udp' | 'icmp' | 'esp' | 'gre';
  port?: string;
  ips: string[];
  description?: string;
};

type Preset = { id: string; title: string; description: string; rules: Rule[] };

type FirewallResponse = {
  firewalls: { id: string; hetznerId: number; name: string; rules: Rule[]; appliedTo: string[] }[];
  applied: { id: number; name: string; status: string }[];
  presets: Preset[];
};

const PROTOCOLS = [
  { value: 'tcp', label: 'TCP' },
  { value: 'udp', label: 'UDP' },
  { value: 'icmp', label: 'ICMP (پینگ)' },
  { value: 'esp', label: 'ESP' },
  { value: 'gre', label: 'GRE' },
];

export function FirewallTab({ server }: { server: ServerData }) {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<FirewallResponse>(`/api/servers/${server.id}/firewall`, fetcher);

  const [name, setName] = useState('firewall-1');
  const [rules, setRules] = useState<Rule[]>([]);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  function loadPreset(preset: Preset) {
    setRules(preset.rules.map((r) => ({ ...r, ips: [...r.ips] })));
    setEditing(true);
  }

  function loadExisting(fw: FirewallResponse['firewalls'][number]) {
    setName(fw.name);
    setRules(
      (fw.rules ?? []).map((r) => ({
        direction: r.direction,
        protocol: r.protocol,
        port: r.port ?? '',
        ips: (r as unknown as { source_ips?: string[]; destination_ips?: string[] }).source_ips ??
          (r as unknown as { destination_ips?: string[] }).destination_ips ??
          r.ips ??
          [],
        description: r.description ?? '',
      })),
    );
    setEditing(true);
  }

  function addRule() {
    setRules((prev) => [
      ...prev,
      { direction: 'in', protocol: 'tcp', port: '', ips: ['0.0.0.0/0', '::/0'], description: '' },
    ]);
  }

  function updateRule(index: number, patch: Partial<Rule>) {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRule(index: number) {
    setRules((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await apiPost<{ message: string }>(`/api/servers/${server.id}/firewall`, {
        name,
        rules: rules.map((r) => ({
          direction: r.direction,
          protocol: r.protocol,
          port: r.protocol === 'tcp' || r.protocol === 'udp' ? r.port || '' : '',
          ips: r.ips,
          description: r.description || '',
        })),
        serverIds: [server.id],
      });
      toast.success(res.message);
      setEditing(false);
      mutate();
    } catch (err) {
      toast.error('ذخیره فایروال انجام نشد', errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function removeFirewall(id: string) {
    if (!window.confirm('این فایروال حذف شود؟ تمام محدودیت‌های آن برداشته می‌شود.')) return;
    try {
      const res = await apiDelete<{ message: string }>(`/api/servers/${server.id}/firewall?firewallId=${id}`);
      toast.success(res.message);
      mutate();
    } catch (err) {
      toast.error('حذف انجام نشد', errorMessage(err));
    }
  }

  if (isLoading && !data) return <LoadingBlock />;

  return (
    <div className="space-y-6">
      <Alert tone="info" title="فایروال ابری">
        این فایروال قبل از رسیدن ترافیک به سرور اعمال می‌شود و مستقل از فایروال داخلی سیستم‌عامل است. هر چیزی که در
        قوانین ورودی مجاز نشده باشد، مسدود می‌شود.
      </Alert>

      {/* فایروال‌های موجود */}
      {data?.firewalls.length ? (
        <section>
          <h3 className="mb-3 text-xs font-bold">فایروال‌های شما</h3>
          <div className="space-y-2">
            {data.firewalls.map((fw) => {
              const isApplied = data.applied.some((a) => a.id === fw.hetznerId);
              return (
                <div key={fw.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <Shield size={14} className="muted" />
                      {fw.name}
                      {isApplied ? (
                        <span className="badge badge-ok">اعمال‌شده روی این سرور</span>
                      ) : (
                        <span className="badge badge-muted">اعمال‌نشده</span>
                      )}
                    </div>
                    <div className="mt-1 text-[11px] muted">
                      {(fw.rules ?? []).length} قانون تعریف شده
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="secondary" size="sm" onClick={() => loadExisting(fw)}>
                      ویرایش
                    </Button>
                    <button
                      onClick={() => removeFirewall(fw.id)}
                      className="rounded-lg p-1.5 muted transition hover:text-red-500"
                      aria-label="حذف فایروال"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* قالب‌های آماده */}
      {!editing ? (
        <section className={data?.firewalls.length ? 'border-t pt-5' : ''}>
          <h3 className="mb-3 text-xs font-bold">شروع سریع با قالب آماده</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {(data?.presets ?? []).map((preset) => (
              <button
                key={preset.id}
                onClick={() => loadPreset(preset)}
                className="rounded-xl border p-4 text-right transition hover:bg-[var(--surface-2)]"
              >
                <div className="text-xs font-bold">{preset.title}</div>
                <p className="mt-1.5 text-[11px] leading-6 muted">{preset.description}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {preset.rules.slice(0, 5).map((r, i) => (
                    <span key={i} className="badge badge-muted">
                      {r.protocol.toUpperCase()} {r.port ?? ''}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
          <div className="mt-4">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)} icon={<Plus size={14} />}>
              ساخت فایروال سفارشی
            </Button>
          </div>
        </section>
      ) : null}

      {/* ویرایشگر قوانین */}
      {editing ? (
        <section className="border-t pt-5">
          <div className="mb-4 max-w-xs">
            <Field label="نام فایروال" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="ltr" dir="ltr" />
            </Field>
          </div>

          <div className="space-y-3">
            {rules.map((rule, i) => (
              <div key={i} className="rounded-xl border p-3">
                <div className="grid gap-3 sm:grid-cols-[7rem_8rem_1fr_auto]">
                  <Field label="جهت">
                    <Select
                      value={rule.direction}
                      onChange={(e) => updateRule(i, { direction: e.target.value as 'in' | 'out' })}
                      className="text-xs"
                    >
                      <option value="in">ورودی</option>
                      <option value="out">خروجی</option>
                    </Select>
                  </Field>
                  <Field label="پروتکل">
                    <Select
                      value={rule.protocol}
                      onChange={(e) => updateRule(i, { protocol: e.target.value as Rule['protocol'] })}
                      className="text-xs"
                    >
                      {PROTOCOLS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="پورت" hint="مثال: 80 یا 8000-9000">
                      <Input
                        value={rule.port ?? ''}
                        onChange={(e) => updateRule(i, { port: e.target.value })}
                        disabled={rule.protocol !== 'tcp' && rule.protocol !== 'udp'}
                        placeholder="any"
                        className="ltr mono text-xs"
                        dir="ltr"
                      />
                    </Field>
                    <Field label="آدرس‌های مجاز" hint="با کاما جدا کنید">
                      <Input
                        value={rule.ips.join(', ')}
                        onChange={(e) =>
                          updateRule(i, {
                            ips: e.target.value
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder="0.0.0.0/0, ::/0"
                        className="ltr mono text-xs"
                        dir="ltr"
                      />
                    </Field>
                  </div>
                  <div className="flex items-end pb-1">
                    <button
                      onClick={() => removeRule(i)}
                      className="rounded-lg p-2 muted transition hover:text-red-500"
                      aria-label="حذف قانون"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <div className="mt-2">
                  <Input
                    value={rule.description ?? ''}
                    onChange={(e) => updateRule(i, { description: e.target.value })}
                    placeholder="توضیح این قانون (اختیاری)"
                    className="text-xs"
                  />
                </div>
              </div>
            ))}
          </div>

          {rules.length === 0 ? (
            <p className="rounded-xl border border-dashed py-8 text-center text-xs muted">
              هنوز قانونی اضافه نکرده‌اید. با قوانین ورودی خالی، تمام ترافیک ورودی مسدود می‌شود.
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
            <Button variant="secondary" size="sm" onClick={addRule} icon={<Plus size={14} />}>
              افزودن قانون
            </Button>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
              انصراف
            </Button>
            <Button size="sm" onClick={save} loading={saving} icon={<Save size={14} />} disabled={!name.trim()}>
              ذخیره و اعمال
            </Button>
          </div>

          <Alert tone="warning" title="مراقب باشید خودتان را بیرون نگذارید">
            اگر پورت ۲۲ (SSH) را باز نگذارید، دسترسی از راه دور به سرور قطع می‌شود. در آن صورت باید از کنسول تحت وب
            استفاده کنید.
          </Alert>
        </section>
      ) : null}
    </div>
  );
}
