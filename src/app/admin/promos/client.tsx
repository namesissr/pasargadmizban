'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Plus, Gift, Percent, Trash2, Power, TicketPercent } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmModal,
  CopyButton,
  EmptyState,
  Field,
  Input,
  MoneyInput,
  LoadingBlock,
  Modal,
  Select,
  Toggle,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiDelete, apiPatch, apiPost, errorMessage, errorFields, fetcher } from '@/lib/client';
import { formatToman } from '@/lib/money';
import { faDate, faRelative, cn } from '@/lib/utils';

type Promo = {
  id: string;
  code: string;
  kind: 'GIFT' | 'TOPUP_BONUS';
  amount: number;
  percent: number;
  maxBonus: number;
  minTopup: number;
  maxUses: number;
  usedCount: number;
  perUser: number;
  firstTopupOnly: boolean;
  active: boolean;
  expiresAt: string | null;
  note: string | null;
  createdAt: string;
  totalPaid: number;
};

const fa = (n: number) => new Intl.NumberFormat('fa-IR').format(n);

export function PromosClient() {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<{ codes: Promo[] }>('/api/admin/promos', fetcher);

  const [createOpen, setCreateOpen] = useState(false);
  const [removing, setRemoving] = useState<Promo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (isLoading && !data) return <LoadingBlock />;
  const codes = data?.codes ?? [];

  const totalPaid = codes.reduce((sum, c) => sum + c.totalPaid, 0);
  const totalUses = codes.reduce((sum, c) => sum + c.usedCount, 0);

  async function toggleActive(promo: Promo) {
    setBusy(promo.id);
    try {
      const res = await apiPatch<{ message: string }>(`/api/admin/promos/${promo.id}`, { active: !promo.active });
      toast.success(res.message);
      mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(removing.id);
    try {
      const res = await apiDelete<{ message: string }>(`/api/admin/promos/${removing.id}`);
      toast.success(res.message);
      setRemoving(null);
      mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {codes.length > 0 ? (
        <Alert tone="info">
          تاکنون {fa(totalUses)} بار از کدها استفاده شده و مجموعاً {formatToman(totalPaid)} هدیه داده‌اید.
        </Alert>
      ) : null}

      <Card
        title="کدها"
        action={
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
            کد تازه
          </Button>
        }
        bodyClassName={codes.length ? 'space-y-3' : undefined}
      >
        {codes.length === 0 ? (
          <EmptyState
            icon={<TicketPercent size={28} />}
            title="هنوز کدی نساخته‌اید"
            description="مثلاً یک کد «WELCOME» با ۵۰ هزار تومان هدیه برای شروع، یا «NOWRUZ20» با ۲۰٪ شارژ بیشتر برای کمپین نوروز."
            action={
              <Button icon={<Plus size={15} />} onClick={() => setCreateOpen(true)}>
                ساخت نخستین کد
              </Button>
            }
          />
        ) : (
          codes.map((promo) => (
            <div key={promo.id} className={cn('rounded-xl border p-3.5', !promo.active && 'opacity-60')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mono ltr rounded-lg px-2 py-0.5 text-sm font-bold surface-2">{promo.code}</span>
                    <CopyButton value={promo.code} size={13} />
                    {promo.kind === 'GIFT' ? (
                      <Badge tone="ok">
                        <Gift size={11} /> هدیه {formatToman(promo.amount, { suffix: false })}
                      </Badge>
                    ) : (
                      <Badge tone="warn">
                        <Percent size={11} /> {fa(promo.percent)}٪ شارژ بیشتر
                      </Badge>
                    )}
                    {!promo.active ? <Badge tone="muted">غیرفعال</Badge> : null}
                    {promo.expiresAt && new Date(promo.expiresAt) < new Date() ? (
                      <Badge tone="bad">منقضی</Badge>
                    ) : null}
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] muted">
                    <span className="tabular">
                      استفاده: {fa(promo.usedCount)}
                      {promo.maxUses > 0 ? ` از ${fa(promo.maxUses)}` : ' (نامحدود)'}
                    </span>
                    {promo.totalPaid > 0 ? <span className="tabular">پرداختی: {formatToman(promo.totalPaid)}</span> : null}
                    {promo.kind === 'TOPUP_BONUS' && promo.minTopup > 0 ? (
                      <span className="tabular">حداقل شارژ: {formatToman(promo.minTopup, { suffix: false })}</span>
                    ) : null}
                    {promo.kind === 'TOPUP_BONUS' && promo.maxBonus > 0 ? (
                      <span className="tabular">سقف هدیه: {formatToman(promo.maxBonus, { suffix: false })}</span>
                    ) : null}
                    {promo.firstTopupOnly ? <span>فقط شارژ اول</span> : null}
                    {promo.expiresAt ? <span>تا {faDate(promo.expiresAt)}</span> : null}
                    <span>ساخته‌شده {faRelative(promo.createdAt)}</span>
                  </div>
                  {promo.note ? <p className="mt-1 text-[11px] muted">{promo.note}</p> : null}
                </div>

                <div className="flex shrink-0 gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Power size={14} />}
                    loading={busy === promo.id}
                    onClick={() => toggleActive(promo)}
                  >
                    {promo.active ? 'غیرفعال' : 'فعال'}
                  </Button>
                  {promo.usedCount === 0 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={14} />}
                      className="hover:text-red-500"
                      onClick={() => setRemoving(promo)}
                      aria-label="حذف"
                    />
                  ) : null}
                </div>
              </div>
            </div>
          ))
        )}
      </Card>

      <CreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false);
          mutate();
        }}
      />

      <ConfirmModal
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        loading={busy === removing?.id}
        title="حذف کد"
        message={`کد «${removing?.code ?? ''}» حذف می‌شود. این کد هنوز استفاده نشده است.`}
        confirmLabel="حذف"
      />
    </div>
  );
}

function CreateModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    code: '',
    kind: 'GIFT' as 'GIFT' | 'TOPUP_BONUS',
    amount: 50000,
    percent: '20',
    maxBonus: 0,
    minTopup: 0,
    maxUses: '0',
    perUser: '1',
    firstTopupOnly: false,
    expiresAt: '',
    note: '',
  });
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setFields({});
    try {
      const res = await apiPost<{ message: string }>('/api/admin/promos', {
        code: form.code.trim(),
        kind: form.kind,
        amount: form.amount,
        percent: Number(form.percent) || 0,
        maxBonus: form.maxBonus,
        minTopup: form.minTopup,
        maxUses: Number(form.maxUses) || 0,
        perUser: Number(form.perUser) || 1,
        firstTopupOnly: form.firstTopupOnly,
        expiresAt: form.expiresAt ? new Date(form.expiresAt) : null,
        note: form.note.trim(),
      });
      toast.success(res.message);
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
      setFields(errorFields(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ساخت کد تازه"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            انصراف
          </Button>
          <Button onClick={save} loading={busy} disabled={form.code.trim().length < 3}>
            ساخت کد
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="متن کد" required error={fields.code} hint="حروف انگلیسی و رقم؛ کاربر همین را وارد می‌کند.">
          <Input
            value={form.code}
            onChange={(e) => set('code', e.target.value.toUpperCase())}
            placeholder="NOWRUZ20"
            className="ltr mono text-center font-bold"
            dir="ltr"
            maxLength={32}
          />
        </Field>

        <Field label="نوع کد">
          <Select value={form.kind} onChange={(e) => set('kind', e.target.value as 'GIFT' | 'TOPUP_BONUS')}>
            <option value="GIFT">هدیه مستقیم — اعتبار فوری به کیف پول</option>
            <option value="TOPUP_BONUS">شارژ بیشتر — درصدی اضافه هنگام شارژ</option>
          </Select>
        </Field>

        {form.kind === 'GIFT' ? (
          <Field label="مبلغ هدیه (تومان)" required error={fields.amount}>
            <MoneyInput value={form.amount} onValueChange={(v) => set('amount', v)} />
          </Field>
        ) : (
          <div className="grid gap-3.5 sm:grid-cols-3">
            <Field label="درصد شارژ بیشتر" required error={fields.percent}>
              <Input
                type="number"
                value={form.percent}
                onChange={(e) => set('percent', e.target.value)}
                className="ltr tabular"
                dir="ltr"
              />
            </Field>
            <Field label="سقف هدیه (تومان)" hint="صفر یعنی بدون سقف">
              <MoneyInput value={form.maxBonus} onValueChange={(v) => set('maxBonus', v)} />
            </Field>
            <Field label="حداقل شارژ (تومان)">
              <MoneyInput value={form.minTopup} onValueChange={(v) => set('minTopup', v)} />
            </Field>
          </div>
        )}

        <div className="grid gap-3.5 sm:grid-cols-3">
          <Field label="سقف کل استفاده" hint="صفر یعنی نامحدود">
            <Input
              type="number"
              value={form.maxUses}
              onChange={(e) => set('maxUses', e.target.value)}
              className="ltr tabular"
              dir="ltr"
            />
          </Field>
          <Field label="هر کاربر چند بار">
            <Input
              type="number"
              min={1}
              value={form.perUser}
              onChange={(e) => set('perUser', e.target.value)}
              className="ltr tabular"
              dir="ltr"
            />
          </Field>
          <Field label="انقضا (اختیاری)">
            <Input
              type="date"
              value={form.expiresAt}
              onChange={(e) => set('expiresAt', e.target.value)}
              className="ltr"
              dir="ltr"
            />
          </Field>
        </div>

        {form.kind === 'TOPUP_BONUS' ? (
          <Toggle
            checked={form.firstTopupOnly}
            onChange={(v) => set('firstTopupOnly', v)}
            label="فقط برای نخستین شارژ"
            description="مناسب جذب کاربر تازه؛ کسی که قبلاً شارژ کرده نمی‌تواند استفاده کند."
          />
        ) : null}

        <Field label="یادداشت داخلی (اختیاری)">
          <Input value={form.note} onChange={(e) => set('note', e.target.value)} maxLength={200} />
        </Field>
      </div>
    </Modal>
  );
}
