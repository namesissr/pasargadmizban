'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'warning' | 'info';

type ToastItem = {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
};

type ToastApi = {
  toast: (kind: ToastKind, title: string, body?: string) => void;
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
  warning: (title: string, body?: string) => void;
  info: (title: string, body?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast باید داخل ToastProvider استفاده شود.');
  return ctx;
}

const ICONS: Record<ToastKind, React.ComponentType<{ size?: number; className?: string }>> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const TONE: Record<ToastKind, string> = {
  success: 'border-emerald-500/40 text-emerald-600',
  error: 'border-red-500/40 text-red-600',
  warning: 'border-amber-500/40 text-amber-600',
  info: 'border-sky-500/40 text-sky-600',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((kind: ToastKind, title: string, body?: string) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev.slice(-4), { id, kind, title, body }]);
    setTimeout(() => remove(id), kind === 'error' ? 8000 : 5000);
  }, [remove]);

  const api = useMemo<ToastApi>(
    () => ({
      toast: push,
      success: (t, b) => push('success', t, b),
      error: (t, b) => push('error', t, b),
      warning: (t, b) => push('warning', t, b),
      info: (t, b) => push('info', t, b),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-4 left-4 z-[100] flex w-[min(92vw,22rem)] flex-col gap-2">
        {items.map((item) => {
          const Icon = ICONS[item.kind];
          return (
            <div
              key={item.id}
              role="status"
              className={`card fade-up flex items-start gap-3 border p-3 shadow-lg ${TONE[item.kind]}`}
              style={{ background: 'var(--surface)' }}
            >
              <Icon size={19} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  {item.title}
                </div>
                {item.body ? (
                  <div className="mt-1 text-xs leading-6 muted break-words">{item.body}</div>
                ) : null}
              </div>
              <button
                onClick={() => remove(item.id)}
                aria-label="بستن"
                className="shrink-0 rounded p-0.5 muted hover:opacity-70"
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/** نمایش خودکار پیام‌های موفق/خطا از query string (مثلاً بعد از بازگشت از درگاه) */
export function useFlashFromQuery() {
  const t = useToast();
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const error = params.get('error');
    if (success) t.success(decodeURIComponent(success));
    if (error) t.error(decodeURIComponent(error));
    if (success || error) {
      params.delete('success');
      params.delete('error');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
