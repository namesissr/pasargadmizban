'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ListPlus, Plus, Trash2, Wand2, X } from 'lucide-react';
import { Alert, Button, Card, Field, Input, NumberInput, Select, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiPatch, apiPost, errorFields, errorMessage } from '@/lib/client';
import { cn, faDateLong } from '@/lib/utils';
import {
  BUG_TEMPLATE,
  TASK_NECESSITY_FA,
  TASK_PRIORITY_FA,
  TASK_TYPE_FA,
  TASK_ROLE_FA,
  type TaskNecessity,
  type TaskPriority,
  type TaskType,
} from '@/lib/dev-tasks-shared';
import { useTaskMeta } from './filters';
import { usePanel } from './panel';
import { checkFiles, FileDrop, filesFromClipboard, PendingFiles, uploadFiles } from './files';
import { personName, type Person, type TaskDetail } from './types';

/** دنبال‌کننده‌های اولیه: معمولاً کارفرمای دیگر که می‌خواهد در جریان این کار باشد */
function OtherEmployers({
  meId,
  people,
  value,
  onChange,
}: {
  meId: string;
  people: Person[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const others = people.filter((p) => p.id !== meId && (p.role === 'ADMIN' || p.role === 'EMPLOYER'));
  if (!others.length) return null;
  return (
    <Field label="در جریان قرار دادن" hint="این افراد دنبال‌کننده تسک می‌شوند و از همه گفتگوها و تغییراتش باخبر می‌شوند.">
      <div className="space-y-1.5">
        {others.map((p) => (
          <label key={p.id} className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={value.includes(p.id)}
              onChange={(e) => onChange(e.target.checked ? [...value, p.id] : value.filter((x) => x !== p.id))}
              className="h-4 w-4 accent-[var(--color-brand-600)]"
            />
            {personName(p)} <span className="muted">({TASK_ROLE_FA[p.role ?? ''] ?? ''})</span>
          </label>
        ))}
      </div>
    </Field>
  );
}

type FormState = {
  type: TaskType;
  title: string;
  description: string;
  priority: TaskPriority;
  necessity: TaskNecessity;
  area: string;
  pageUrl: string;
  assigneeId: string;
  dueAt: string;
  estimateHours: number;
  labels: string[];
};

const DRAFT_KEY = 'pm-task-draft';

const EMPTY: FormState = {
  type: 'BUG',
  title: '',
  description: '',
  priority: 'MEDIUM',
  necessity: 'NEEDED',
  area: '',
  pageUrl: '',
  assigneeId: '',
  dueAt: '',
  estimateHours: 0,
  labels: [],
};

function fromTask(t: TaskDetail): FormState {
  return {
    type: t.type as TaskType,
    title: t.title,
    description: t.description,
    priority: t.priority as TaskPriority,
    necessity: t.necessity as TaskNecessity,
    area: t.area ?? '',
    pageUrl: t.pageUrl ?? '',
    assigneeId: t.assigneeId ?? '',
    dueAt: t.dueAt ?? '',
    estimateHours: t.estimateHours ?? 0,
    labels: t.labels,
  };
}

/** مقدار مناسب input[type=datetime-local] به وقت محلی مرورگر */
function toLocalInput(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** مهلت سریع: پایان روز کاری (ساعت ۱۸) چند روز بعد */
function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(18, 0, 0, 0);
  return d.toISOString();
}

const DUE_PRESETS = [
  { label: 'بدون مهلت', days: null },
  { label: 'امروز', days: 0 },
  { label: 'فردا', days: 1 },
  { label: '۳ روز', days: 3 },
  { label: 'یک هفته', days: 7 },
  { label: 'دو هفته', days: 14 },
  { label: 'یک ماه', days: 30 },
];

export function TaskForm({
  task,
  permissions,
  onSaved,
  onCancel,
}: {
  /** در حالت ویرایش، تسک فعلی */
  task?: TaskDetail;
  permissions?: { manage: boolean; editContent: boolean; estimate: boolean };
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const editing = Boolean(task);
  const router = useRouter();
  const toast = useToast();
  const { data: meta } = useTaskMeta();
  const [form, setForm] = useState<FormState>(() => (task ? fromTask(task) : EMPTY));
  const [checklist, setChecklist] = useState<string[]>([]);
  const [newItem, setNewItem] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [watcherIds, setWatcherIds] = useState<string[]>([]);
  const panel = usePanel();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const assigneeTouched = useRef(editing);

  const role = meta?.me.role;
  const canManage = editing ? Boolean(permissions?.manage) : true;
  const canContent = editing ? Boolean(permissions?.editContent || permissions?.manage) : true;
  const canEstimate = editing ? Boolean(permissions?.estimate) : true;

  // بازیابی پیش‌نویس ذخیره‌شده تا متن بلند گزارش با بستن تصادفی صفحه از دست نرود
  useEffect(() => {
    if (editing) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as { form: FormState; checklist: string[] };
      if (draft.form?.title || draft.form?.description) {
        setForm({ ...EMPTY, ...draft.form });
        setChecklist(draft.checklist ?? []);
        if (draft.form.assigneeId) assigneeTouched.current = true;
        setDraftRestored(true);
      }
    } catch {
      /* حافظه مرورگر در دسترس نیست */
    }
  }, [editing]);

  useEffect(() => {
    if (editing) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, checklist }));
      } catch {
        /* حافظه مرورگر در دسترس نیست */
      }
    }, 500);
    return () => clearTimeout(t);
  }, [form, checklist, editing]);

  // مسئول پیش‌فرض: برنامه‌نویس خودش؛ برای دیگران اگر فقط یک برنامه‌نویس هست، همان
  useEffect(() => {
    if (!meta || assigneeTouched.current) return;
    const devs = meta.members.filter((m) => m.role === 'DEVELOPER');
    const preset = meta.me.role === 'DEVELOPER' ? meta.me.id : devs.length === 1 ? devs[0].id : '';
    if (preset) setForm((f) => ({ ...f, assigneeId: preset }));
  }, [meta]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: '' }));
  };

  function addFiles(list: File[]) {
    const { ok, errors: errs } = checkFiles(list);
    errs.forEach((m) => toast.error(m));
    if (ok.length) setFiles((f) => [...f, ...ok].slice(0, 20));
  }

  function addLabel(raw: string) {
    const parts = raw
      .split(/[,،]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    set('labels', [...new Set([...form.labels, ...parts])].slice(0, 10));
    setLabelInput('');
  }

  function addChecklistItem() {
    const text = newItem.trim();
    if (!text) return;
    setChecklist((c) => [...c, text].slice(0, 50));
    setNewItem('');
  }

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* حافظه مرورگر در دسترس نیست */
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    const pendingLabel = labelInput.trim();
    const labels = pendingLabel ? [...new Set([...form.labels, ...pendingLabel.split(/[,،]/).map((s) => s.trim()).filter(Boolean)])] : form.labels;
    const pendingItem = newItem.trim();

    const payload = {
      ...form,
      labels,
      assigneeId: form.assigneeId || null,
      dueAt: form.dueAt || null,
      estimateHours: form.estimateHours || null,
    };

    try {
      if (editing && task) {
        // فقط فیلدهای تغییرکرده ارسال می‌شود
        const original = fromTask(task);
        const originalPayload: Record<string, unknown> = {
          ...original,
          assigneeId: original.assigneeId || null,
          dueAt: original.dueAt || null,
          estimateHours: original.estimateHours || null,
        };
        const diff: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(payload)) {
          if (JSON.stringify(v) !== JSON.stringify(originalPayload[k])) diff[k] = v;
        }
        if (Object.keys(diff).length) await apiPatch(`/api/tasks/${task.id}`, diff);
        toast.success('تغییرات ذخیره شد.');
        onSaved?.();
        return;
      }

      const created = await apiPost<{ id: string; number: number }>('/api/tasks', {
        ...payload,
        checklist: pendingItem ? [...checklist, pendingItem] : checklist,
        watcherIds,
      });
      clearDraft();
      if (files.length) {
        try {
          await uploadFiles(created.id, files);
        } catch (err) {
          toast.error(`تسک ثبت شد ولی ارسال پیوست‌ها ناموفق بود: ${errorMessage(err)}`);
        }
      }
      toast.success('تسک ثبت شد و به مسئول اطلاع داده شد.');
      router.push(panel.detail(created.number));
    } catch (err) {
      setErrors(errorFields(err));
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const dueLocal = toLocalInput(form.dueAt);

  return (
    <form onSubmit={submit} className="space-y-5">
      {draftRestored ? (
        <Alert
          tone="info"
          title="پیش‌نویس قبلی بازیابی شد"
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                clearDraft();
                setForm({ ...EMPTY, assigneeId: form.assigneeId });
                setChecklist([]);
                setDraftRestored(false);
              }}
            >
              شروع از نو
            </Button>
          }
        >
          متنی که دفعه قبل نوشته بودید و ثبت نشده بود، دوباره در فرم قرار گرفت.
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
        <div className="space-y-5 lg:col-span-2">
          <Card title="شرح کار">
            <div className="space-y-4">
              <Field label="نوع">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(Object.keys(TASK_TYPE_FA) as TaskType[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      disabled={!canContent}
                      onClick={() => set('type', k)}
                      className={cn(
                        'rounded-xl border px-3 py-2.5 text-xs font-semibold transition disabled:opacity-60',
                        form.type === k
                          ? 'border-[var(--color-brand-500)] bg-[color-mix(in_srgb,var(--color-brand-500)_10%,transparent)]'
                          : 'hover:bg-[var(--surface-2)]',
                      )}
                    >
                      <span className="ml-1">{TASK_TYPE_FA[k].emoji}</span>
                      {TASK_TYPE_FA[k].label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="عنوان کوتاه و روشن" required error={errors.title} hint="مثال: «پرداخت با زیبال پس از بازگشت از درگاه موجودی را شارژ نمی‌کند»">
                <Input
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  maxLength={200}
                  disabled={!canContent}
                  invalid={Boolean(errors.title)}
                  autoFocus={!editing}
                />
              </Field>

              <Field
                label="جزئیات کامل"
                required
                error={errors.description}
                hint="هرچه دقیق‌تر بنویسید، برنامه‌نویس سریع‌تر و درست‌تر انجام می‌دهد. اسکرین‌شات را می‌توانید همین‌جا با Ctrl+V بچسبانید."
              >
                <Textarea
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  onPaste={(e) => {
                    if (editing) return;
                    const pasted = filesFromClipboard(e);
                    if (pasted.length) {
                      e.preventDefault();
                      addFiles(pasted);
                      toast.success('اسکرین‌شات به پیوست‌ها اضافه شد.');
                    }
                  }}
                  rows={12}
                  disabled={!canContent}
                  invalid={Boolean(errors.description)}
                  placeholder="چه چیزی باید انجام شود؟ کجا؟ چرا؟"
                />
                {form.type === 'BUG' && canContent && !form.description.includes('مراحل ایجاد مشکل') ? (
                  <button
                    type="button"
                    onClick={() => set('description', form.description ? `${form.description}\n\n${BUG_TEMPLATE}` : BUG_TEMPLATE)}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand-600)] hover:underline"
                  >
                    <Wand2 size={13} /> درج قالب گزارش باگ (مراحل، نتیجه مورد انتظار، نتیجه فعلی)
                  </button>
                ) : null}
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="بخش سایت" error={errors.area}>
                  <Input
                    value={form.area}
                    onChange={(e) => set('area', e.target.value)}
                    list="task-areas"
                    maxLength={60}
                    disabled={!canContent}
                    placeholder="مثلاً کیف پول و پرداخت"
                  />
                  <datalist id="task-areas">
                    {meta?.areas.map((a) => <option key={a} value={a} />)}
                  </datalist>
                </Field>
                <Field label="آدرس صفحه مربوط" error={errors.pageUrl}>
                  <Input
                    value={form.pageUrl}
                    onChange={(e) => set('pageUrl', e.target.value)}
                    className="ltr text-left"
                    maxLength={500}
                    disabled={!canContent}
                    placeholder="https://cloud.pasargadmizban.com/dashboard/wallet"
                  />
                </Field>
              </div>
            </div>
          </Card>

          {!editing ? (
            <Card title="چک‌لیست مراحل (اختیاری)" description="کار بزرگ را به چند مرحله کوچک تقسیم کنید؛ برنامه‌نویس هر مرحله را جداگانه تیک می‌زند.">
              <div className="space-y-2">
                {checklist.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                    <span className="h-4 w-4 shrink-0 rounded border" />
                    <span className="flex-1">{item}</span>
                    <button type="button" onClick={() => setChecklist((c) => c.filter((_, j) => j !== i))} className="muted hover:text-red-500">
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addChecklistItem();
                      }
                    }}
                    placeholder="مرحله جدید و Enter"
                    maxLength={300}
                  />
                  <Button type="button" variant="secondary" onClick={addChecklistItem} icon={<ListPlus size={15} />}>
                    افزودن
                  </Button>
                </div>
              </div>
            </Card>
          ) : null}

          {!editing ? (
            <Card title="پیوست‌ها و اسکرین‌شات">
              <div className="space-y-3">
                <FileDrop onFiles={addFiles} />
                <PendingFiles files={files} onRemove={(i) => setFiles((f) => f.filter((_, j) => j !== i))} />
              </div>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card title="اولویت و ضرورت" description={!canManage ? 'فقط کارفرما می‌تواند این بخش را تغییر دهد.' : undefined}>
            <div className="space-y-4">
              <Field label="اولویت — چقدر زود باید انجام شود؟">
                <div className="grid grid-cols-4 gap-1.5">
                  {(Object.keys(TASK_PRIORITY_FA) as TaskPriority[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      disabled={!canManage}
                      onClick={() => set('priority', k)}
                      className={cn(
                        'rounded-lg border px-1 py-2 text-xs font-bold transition disabled:opacity-60',
                        form.priority === k ? 'text-white' : 'hover:bg-[var(--surface-2)]',
                      )}
                      style={form.priority === k ? { background: TASK_PRIORITY_FA[k].color, borderColor: TASK_PRIORITY_FA[k].color } : undefined}
                    >
                      {TASK_PRIORITY_FA[k].label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="ضرورت — چقدر لازم است؟" hint={TASK_NECESSITY_FA[form.necessity].hint}>
                <Select value={form.necessity} onChange={(e) => set('necessity', e.target.value as TaskNecessity)} disabled={!canManage}>
                  {(Object.keys(TASK_NECESSITY_FA) as TaskNecessity[]).map((k) => (
                    <option key={k} value={k}>
                      {TASK_NECESSITY_FA[k].label} — {TASK_NECESSITY_FA[k].hint}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="مهلت انجام" error={errors.dueAt}>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {DUE_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      disabled={!canManage}
                      onClick={() => set('dueAt', p.days === null ? '' : daysFromNow(p.days))}
                      className="rounded-lg border px-2 py-1 text-[11px] transition hover:bg-[var(--surface-2)] disabled:opacity-60"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <Input
                  type="datetime-local"
                  value={dueLocal}
                  disabled={!canManage}
                  onChange={(e) => set('dueAt', e.target.value ? new Date(e.target.value).toISOString() : '')}
                  className="ltr text-left"
                />
                {form.dueAt ? <p className="mt-1.5 text-[11px] font-semibold text-[var(--color-brand-600)]">{faDateLong(form.dueAt)}</p> : null}
              </Field>
            </div>
          </Card>

          <Card title="مسئول و جزئیات">
            <div className="space-y-4">
              <Field
                label="مسئول انجام"
                error={errors.assigneeId}
                hint={!form.assigneeId ? 'بدون مسئول: همه برنامه‌نویس‌ها باخبر می‌شوند و هرکدام می‌تواند آن را بردارد.' : undefined}
              >
                <Select
                  value={form.assigneeId}
                  disabled={editing && !canManage}
                  onChange={(e) => {
                    assigneeTouched.current = true;
                    set('assigneeId', e.target.value);
                  }}
                >
                  <option value="">بدون مسئول</option>
                  {meta?.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {personName(m)} ({TASK_ROLE_FA[m.role ?? ''] ?? ''}
                      {m.role === 'DEVELOPER' ? ` — ${new Intl.NumberFormat('fa-IR').format(m.openCount ?? 0)} کار باز` : ''})
                      {m.id === meta.me.id ? ' — خودم' : ''}
                    </option>
                  ))}
                </Select>
                {meta && !meta.members.some((m) => m.role === 'DEVELOPER') && (role === 'ADMIN' || role === 'EMPLOYER') ? (
                  <p className="mt-1.5 text-[11px] leading-5 text-amber-600">
                    هنوز هیچ کاربری نقش «برنامه‌نویس» ندارد. از پنل مدیریت ← کاربران، نقش حساب برنامه‌نویس را «برنامه‌نویس» کنید.
                  </p>
                ) : null}
              </Field>

              {!editing && meta ? (
                <OtherEmployers meId={meta.me.id} people={meta.people} value={watcherIds} onChange={setWatcherIds} />
              ) : null}

              <Field label="زمان تخمینی (ساعت)" hint="اختیاری — برنامه‌نویس هم می‌تواند تعیین کند.">
                <NumberInput
                  value={form.estimateHours}
                  onValueChange={(v) => set('estimateHours', v)}
                  min={0}
                  max={1000}
                  disabled={!canEstimate}
                  placeholder="مثلاً ۴"
                />
              </Field>

              <Field label="برچسب‌ها" hint="با Enter یا ویرگول جدا کنید؛ مثلاً «امنیت»، «موبایل»">
                {form.labels.length ? (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {form.labels.map((l) => (
                      <span key={l} className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px]">
                        {l}
                        <button type="button" onClick={() => set('labels', form.labels.filter((x) => x !== l))} className="muted hover:text-red-500">
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
                <Input
                  value={labelInput}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/[,،]$/.test(v)) addLabel(v);
                    else setLabelInput(v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addLabel(labelInput);
                    }
                  }}
                  onBlur={() => addLabel(labelInput)}
                  list="task-labels"
                  maxLength={30}
                />
                <datalist id="task-labels">
                  {meta?.labels.map((l) => <option key={l} value={l} />)}
                </datalist>
              </Field>
            </div>
          </Card>

          <div className="flex flex-col gap-2">
            <Button type="submit" loading={saving} icon={editing ? undefined : <Plus size={16} />} className="w-full">
              {editing ? 'ذخیره تغییرات' : 'ثبت تسک و اطلاع به برنامه‌نویس'}
            </Button>
            {onCancel ? (
              <Button type="button" variant="secondary" onClick={onCancel} className="w-full">
                انصراف
              </Button>
            ) : null}
            {!editing && (form.title || form.description) ? (
              <button
                type="button"
                onClick={() => {
                  clearDraft();
                  setForm({ ...EMPTY, assigneeId: form.assigneeId });
                  setChecklist([]);
                  setFiles([]);
                }}
                className="inline-flex items-center justify-center gap-1 py-1 text-xs muted hover:text-red-500"
              >
                <Trash2 size={12} /> پاک کردن فرم
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </form>
  );
}
