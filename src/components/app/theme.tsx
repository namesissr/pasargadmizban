'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Sun, Moon, MonitorSmartphone, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * مدیریت تم روشن و تیره.
 *
 * سه حالت دارد:
 *   auto  — پیروی از تنظیمات سیستم‌عامل کاربر (پیش‌فرض)
 *   light — همیشه روشن
 *   dark  — همیشه تیره
 *
 * انتخاب کاربر در localStorage می‌ماند. در حالت auto، تغییر تم سیستم
 * بلافاصله و بدون نیاز به رفرش اعمال می‌شود.
 */

export type ThemeChoice = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'pm-theme';

type ThemeApi = {
  choice: ThemeChoice;
  resolved: ResolvedTheme;
  setChoice: (value: ThemeChoice) => void;
};

const ThemeContext = createContext<ThemeApi | null>(null);

export function useTheme(): ThemeApi {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme باید داخل ThemeProvider استفاده شود.');
  return ctx;
}

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStored(): ThemeChoice {
  if (typeof window === 'undefined') return 'auto';
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'auto') return value;
  } catch {
    // حالت ناشناس مرورگر
  }
  return 'auto';
}

function apply(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.style.colorScheme = resolved;

  // نوار وضعیت مرورگر موبایل هم با تم هماهنگ شود
  const meta = document.querySelector('meta[name="theme-color"]');
  const color = resolved === 'dark' ? '#0b1220' : '#f6f7f9';
  if (meta) meta.setAttribute('content', color);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>('auto');
  const [resolved, setResolved] = useState<ResolvedTheme>('light');

  // خواندن انتخاب ذخیره‌شده هنگام بارگذاری
  useEffect(() => {
    const stored = readStored();
    setChoiceState(stored);
    const next = stored === 'auto' ? systemTheme() : stored;
    setResolved(next);
    apply(next);
  }, []);

  // در حالت خودکار، تغییر تم سیستم را دنبال کن
  useEffect(() => {
    if (choice !== 'auto' || typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next = media.matches ? 'dark' : 'light';
      setResolved(next);
      apply(next);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [choice]);

  const setChoice = useCallback((value: ThemeChoice) => {
    setChoiceState(value);
    try {
      if (value === 'auto') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // ذخیره ممکن نشد؛ انتخاب فقط تا پایان همین نشست می‌ماند
    }
    const next = value === 'auto' ? systemTheme() : value;
    setResolved(next);
    apply(next);
  }, []);

  const api = useMemo<ThemeApi>(() => ({ choice, resolved, setChoice }), [choice, resolved, setChoice]);

  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>;
}

const OPTIONS: { value: ThemeChoice; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { value: 'auto', label: 'خودکار (سیستم)', icon: MonitorSmartphone },
  { value: 'light', label: 'روشن', icon: Sun },
  { value: 'dark', label: 'تیره', icon: Moon },
];

/** دکمه تغییر تم با منوی سه‌گزینه‌ای */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { choice, resolved, setChoice } = useTheme();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);

  const Icon = choice === 'auto' ? MonitorSmartphone : resolved === 'dark' ? Moon : Sun;

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="tap-target rounded-lg p-2 muted transition hover:opacity-70"
        aria-label="تغییر تم"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon size={17} />
      </button>

      {open ? (
        <div
          role="menu"
          className={cn(
            'card fade-up absolute left-0 top-full z-50 mt-2 w-48 overflow-hidden p-1 shadow-xl',
            compact && 'w-44',
          )}
        >
          {OPTIONS.map((option) => {
            const OptionIcon = option.icon;
            const active = choice === option.value;
            return (
              <button
                key={option.value}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setChoice(option.value);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-right text-xs transition',
                  active ? 'bg-[var(--surface-2)] font-semibold' : 'muted hover:bg-[var(--surface-2)]',
                )}
              >
                <OptionIcon size={15} />
                <span className="flex-1">{option.label}</span>
                {active ? <Check size={14} className="text-[var(--color-brand-600)]" /> : null}
              </button>
            );
          })}
          <div className="border-t px-3 py-2 text-[10px] muted">
            {choice === 'auto' ? `الان: ${resolved === 'dark' ? 'تیره' : 'روشن'}` : 'انتخاب دستی'}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** انتخابگر تم به شکل سه دکمه کنار هم — برای صفحه تنظیمات */
export function ThemePicker() {
  const { choice, resolved, setChoice } = useTheme();

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((option) => {
          const OptionIcon = option.icon;
          const active = choice === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setChoice(option.value)}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border p-3 text-xs font-semibold transition',
                active
                  ? 'border-[var(--color-brand-500)] bg-[color-mix(in_srgb,var(--color-brand-500)_10%,transparent)]'
                  : 'muted hover:bg-[var(--surface-2)]',
              )}
            >
              <OptionIcon size={20} />
              {option.label.split(' ')[0]}
            </button>
          );
        })}
      </div>
      <p className="mt-2.5 text-[11px] leading-6 muted">
        {choice === 'auto'
          ? `با تنظیمات دستگاه شما هماهنگ می‌شود. در حال حاضر تم ${resolved === 'dark' ? 'تیره' : 'روشن'} فعال است.`
          : `تم ${choice === 'dark' ? 'تیره' : 'روشن'} همیشه فعال می‌ماند.`}
      </p>
    </div>
  );
}
