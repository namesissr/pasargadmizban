'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import { Alert, Button, Card, Field, Input, Select, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiPost, errorFields, errorMessage } from '@/lib/client';

const PRIORITIES = [
  { value: 'LOW', label: 'کم — سوال عمومی' },
  { value: 'MEDIUM', label: 'متوسط — مشکل غیر فوری' },
  { value: 'HIGH', label: 'زیاد — اختلال در سرویس' },
  { value: 'URGENT', label: 'فوری — سرویس کاملاً قطع است' },
];

export function NewTicketForm({
  departments,
  servers,
  defaultServerId,
}: {
  departments: { id: string; name: string }[];
  servers: { id: string; name: string; ipv4: string | null }[];
  defaultServerId: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? '');
  const [priority, setPriority] = useState('MEDIUM');
  const [serverId, setServerId] = useState(defaultServerId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setFields({});
    try {
      const res = await apiPost<{ id: string; number: number }>('/api/tickets', {
        subject,
        body,
        departmentId: departmentId || undefined,
        priority,
        serverId: serverId || undefined,
      });
      toast.success(`تیکت شماره ${res.number} ثبت شد`, 'به‌زودی پاسخ داده می‌شود.');
      router.push(`/dashboard/tickets/${res.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setFields(errorFields(err));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[1fr_18rem] lg:items-start">
      <Card>
        <div className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}

          <Field label="موضوع" required error={fields.subject}>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="خلاصه‌ای کوتاه از مشکل"
              required
              autoFocus
            />
          </Field>

          <Field
            label="شرح کامل"
            required
            error={fields.body}
            hint="هرچه جزئیات بیشتری بنویسید (پیام خطا، زمان بروز، کاری که انجام داده‌اید) سریع‌تر پاسخ می‌گیرید."
          >
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-56"
              placeholder="مشکل را با جزئیات شرح دهید…"
              required
            />
          </Field>
        </div>
      </Card>

      <aside className="space-y-4 lg:sticky lg:top-20">
        <Card title="دسته‌بندی">
          <div className="space-y-4">
            <Field label="بخش مربوطه">
              <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">انتخاب نشده</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="اولویت">
              <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>

            {servers.length > 0 ? (
              <Field label="سرور مرتبط" hint="در صورت مرتبط بودن مشکل با یک سرور خاص.">
                <Select value={serverId} onChange={(e) => setServerId(e.target.value)}>
                  <option value="">مرتبط با سرور خاصی نیست</option>
                  {servers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.ipv4 ? `(${s.ipv4})` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            <Button type="submit" className="w-full" loading={loading} icon={<Send size={15} />}>
              ارسال تیکت
            </Button>
          </div>
        </Card>

        <div className="rounded-xl p-4 text-[11px] leading-7 surface-2">
          <div className="font-semibold">قبل از ارسال تیکت</div>
          <ul className="mt-2 list-inside list-disc muted">
            <li>اگر سرور تعلیق شده، ابتدا کیف پول را شارژ کنید.</li>
            <li>برای مشکلات اتصال، فایروال سرور را بررسی کنید.</li>
            <li>اولویت «فوری» فقط برای قطعی کامل سرویس استفاده شود.</li>
          </ul>
        </div>
      </aside>
    </form>
  );
}
