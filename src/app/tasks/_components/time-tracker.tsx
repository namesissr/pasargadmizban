'use client';

import { useEffect, useState } from 'react';
import { Pause, Play, Plus, Timer, Trash2 } from 'lucide-react';
import { Button, Card, Input, NumberInput } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { apiDelete, apiPost, errorMessage } from '@/lib/client';
import { cn, faDateTime } from '@/lib/utils';
import { formatMinutes, isTaskManager } from '@/lib/dev-tasks-shared';
import { useTaskMeta } from './filters';
import { personName, type TaskDetailResponse } from './types';

/** شمارنده زنده زمان‌سنج روشن به شکل ساعت:دقیقه:ثانیه */
function useElapsed(startedAt: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  if (!startedAt) return null;
  const sec = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const fa = (n: number) => new Intl.NumberFormat('fa-IR', { minimumIntegerDigits: 2, useGrouping: false }).format(n);
  return `${fa(Math.floor(sec / 3600))}:${fa(Math.floor((sec % 3600) / 60))}:${fa(sec % 60)}`;
}

/**
 * کارکرد تسک: زمان‌سنج شروع/توقف برای مسئول، ثبت دستی، و فهرست کارکردها.
 * کارفرما جمع ساعت‌ها و جزئیات را می‌بیند و می‌تواند ردیف نادرست را حذف کند.
 */
export function TimeTracker({ data, meId, onChange }: { data: TaskDetailResponse; meId?: string; onChange: () => void }) {
  const { task, permissions, runningTimer } = data;
  const { data: meta } = useTaskMeta();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [note, setNote] = useState('');
  const elapsed = useElapsed(runningTimer?.startedAt ?? null);
  const manager = isTaskManager(meta?.me.role);
  const othersRunning = task.timeLogs.filter((l) => !l.endedAt && l.userId !== meId);

  if (!permissions.track && !task.spentMinutes && !task.timeLogs.length) return null;

  async function timer(action: 'start' | 'stop') {
    setBusy(action);
    try {
      const res = await apiPost<{ minutes?: number; stoppedTaskId?: string | null; started?: boolean }>(
        `/api/tasks/${task.id}/timer`,
        { action },
      );
      if (action === 'stop') toast.success(`${formatMinutes(res.minutes ?? 0)} کارکرد ثبت شد.`);
      else if (res.stoppedTaskId) toast.info('زمان‌سنج تسک قبلی متوقف و کارکردش ثبت شد.');
      else toast.success(res.started ? 'زمان‌سنج روشن شد و وضعیت به «در حال انجام» رفت.' : 'زمان‌سنج روشن شد.');
      onChange();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function addManual() {
    const total = Math.round(hours * 60 + minutes);
    if (total <= 0) {
      toast.error('مدت کارکرد را وارد کنید.');
      return;
    }
    setBusy('manual');
    try {
      await apiPost(`/api/tasks/${task.id}/time`, { minutes: total, note });
      toast.success(`${formatMinutes(total)} کارکرد ثبت شد.`);
      setHours(0);
      setMinutes(0);
      setNote('');
      setManualOpen(false);
      onChange();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('این ردیف کارکرد حذف شود؟')) return;
    try {
      await apiDelete(`/api/tasks/time/${id}`);
      onChange();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const finished = task.timeLogs.filter((l) => l.endedAt);

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Timer size={15} /> کارکرد
        </span>
      }
      action={<span className="tabular text-xs font-bold">{formatMinutes(task.spentMinutes)}</span>}
    >
      <div className="space-y-3">
        {task.estimateHours ? (
          <div className="text-[11px] muted">
            تخمین: {formatMinutes(task.estimateHours * 60)}
            {task.spentMinutes > task.estimateHours * 60 ? (
              <span className="mr-1 font-semibold text-amber-600">— از تخمین بیشتر شده</span>
            ) : null}
          </div>
        ) : null}

        {othersRunning.map((l) => (
          <div key={l.id} className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            {personName(l.user)} الان روی این تسک کار می‌کند
          </div>
        ))}

        {permissions.track ? (
          runningTimer ? (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/8 p-3 text-center">
              <div className="tabular ltr text-2xl font-extrabold text-emerald-700">{elapsed}</div>
              <div className="mt-0.5 text-[11px] muted">زمان‌سنج روشن است</div>
              <Button
                variant="danger"
                size="sm"
                className="mt-2 w-full"
                loading={busy === 'stop'}
                icon={<Pause size={14} />}
                onClick={() => timer('stop')}
              >
                توقف و ثبت کارکرد
              </Button>
            </div>
          ) : (
            <Button className="w-full" loading={busy === 'start'} icon={<Play size={15} />} onClick={() => timer('start')}>
              شروع زمان‌سنج
            </Button>
          )
        ) : null}

        {permissions.track ? (
          manualOpen ? (
            <div className="space-y-2 rounded-xl border p-3">
              <div className="flex items-center gap-2 text-xs">
                <div className="w-16">
                  <NumberInput value={hours} onValueChange={setHours} min={0} max={16} className="py-1.5 text-xs" />
                </div>
                ساعت
                <div className="w-16">
                  <NumberInput value={minutes} onValueChange={setMinutes} min={0} max={59} className="py-1.5 text-xs" />
                </div>
                دقیقه
              </div>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="چه کاری انجام شد؟ (اختیاری)" maxLength={500} className="text-xs" />
              <div className="flex gap-2">
                <Button size="sm" loading={busy === 'manual'} onClick={addManual}>
                  ثبت
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setManualOpen(false)}>
                  انصراف
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand-600)] hover:underline"
            >
              <Plus size={13} /> ثبت دستی کارکرد
            </button>
          )
        ) : null}

        {finished.length ? (
          <ul className="max-h-60 space-y-1.5 overflow-y-auto border-t pt-2">
            {finished.map((l) => (
              <li key={l.id} className="group flex items-start gap-2 text-[11px]">
                <div className="min-w-0 flex-1">
                  <div>
                    <b>{formatMinutes(l.minutes)}</b> — {personName(l.user)}
                    {l.manual ? <span className="mr-1 muted">(دستی)</span> : null}
                  </div>
                  <div className="muted">{faDateTime(l.endedAt)}</div>
                  {l.note ? <div className="mt-0.5 leading-5">{l.note}</div> : null}
                </div>
                {l.userId === meId || manager ? (
                  <button
                    type="button"
                    onClick={() => remove(l.id)}
                    className={cn('shrink-0 rounded p-1 muted hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100')}
                    aria-label="حذف کارکرد"
                  >
                    <Trash2 size={12} />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}
