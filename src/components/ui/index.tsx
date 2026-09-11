'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, Eye, EyeOff, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─────────────  دکمه  ─────────────

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: React.ReactNode;
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  children,
  className,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 size={size === 'sm' ? 14 : 16} className="spin" /> : icon}
      {children}
    </button>
  );
}

// ─────────────  کارت  ─────────────

export function Card({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('card overflow-hidden', className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title ? <h2 className="text-sm font-bold">{title}</h2> : null}
            {description ? <p className="mt-1 text-xs leading-6 muted">{description}</p> : null}
          </div>
          {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </header>
      )}
      <div className={cn('p-4 sm:p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

// ─────────────  نشان وضعیت  ─────────────

export function Badge({
  tone = 'muted',
  children,
  className,
}: {
  tone?: 'ok' | 'warn' | 'bad' | 'muted';
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn('badge', `badge-${tone}`, className)}>{children}</span>;
}

// ─────────────  فیلد فرم  ─────────────

export function Field({
  label,
  error,
  hint,
  required,
  children,
  className,
}: {
  label?: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('w-full', className)}>
      {label ? (
        <label className="label">
          {label}
          {required ? <span className="mr-1 text-red-500">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-red-500">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs leading-6 muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const { invalid, className, ...rest } = props;
  return <input className={cn('input', invalid && 'border-red-400', className)} {...rest} />;
}

/**
 * ورودی مبلغ تومانی با جداکننده سه‌رقمی.
 *
 * کادر type=number جداکننده قبول نمی‌کند و خواندن «283000» سخت است؛ این کامپوننت
 * همان لحظه تایپ، عدد را به شکل «۲۸۳٬۰۰۰» نشان می‌دهد و رقم فارسی و انگلیسی،
 * هر دو را می‌پذیرد. مقدار بیرونی همیشه عدد خالص است.
 */
export function MoneyInput({
  value,
  onValueChange,
  invalid,
  className,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number;
  onValueChange: (value: number) => void;
  invalid?: boolean;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      dir="ltr"
      autoComplete="off"
      className={cn('input tabular text-left', invalid && 'border-red-400', className)}
      value={new Intl.NumberFormat('fa-IR').format(value)}
      onChange={(e) => {
        const digits = e.target.value
          .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
          .replace(/[^\d]/g, '');
        // بیش از ۱۵ رقم دیگر مبلغ نیست؛ جلوی سرریز عدد را می‌گیرد
        onValueChange(digits ? Number(digits.slice(0, 15)) : 0);
      }}
      {...rest}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  const { invalid, className, ...rest } = props;
  return <textarea className={cn('input min-h-28 resize-y leading-7', invalid && 'border-red-400', className)} {...rest} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  const { invalid, className, children, ...rest } = props;
  return (
    <select className={cn('input cursor-pointer', invalid && 'border-red-400', className)} {...rest}>
      {children}
    </select>
  );
}

// ─────────────  رمز عبور  ─────────────

export function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  const { className, ...rest } = props;
  return (
    <div className="relative">
      <input
        {...rest}
        type={show ? 'text' : 'password'}
        className={cn('input pl-10', className)}
        autoComplete={rest.autoComplete ?? 'current-password'}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'پنهان کردن رمز' : 'نمایش رمز'}
        className="absolute left-2 top-1/2 -translate-y-1/2 rounded p-1.5 muted hover:opacity-70"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

// ─────────────  کپی  ─────────────

export function CopyButton({
  value,
  label,
  className,
  size = 14,
}: {
  value: string;
  label?: string;
  className?: string;
  size?: number;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const el = document.createElement('textarea');
      el.value = value;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      try {
        document.execCommand('copy');
      } catch {
        /* مرورگر اجازه نداد */
      }
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="کپی"
      className={cn('inline-flex items-center gap-1 rounded p-1 text-xs muted transition hover:opacity-70', className)}
    >
      {copied ? <Check size={size} className="text-emerald-500" /> : <Copy size={size} />}
      {label ? <span>{copied ? 'کپی شد' : label}</span> : null}
    </button>
  );
}

/** نمایش مقدار محرمانه با قابلیت آشکارسازی و کپی */
export function SecretValue({ value, className }: { value: string; className?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <code className="mono ltr flex-1 truncate rounded-lg px-2 py-1.5 text-xs surface-2">
        {show ? value : '•'.repeat(Math.min(20, value.length))}
      </code>
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="rounded p-1 muted hover:opacity-70"
        aria-label={show ? 'پنهان کردن' : 'نمایش'}
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
      <CopyButton value={value} />
    </div>
  );
}

// ─────────────  مودال  ─────────────

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl' };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'card sheet max-h-[92vh] w-full overflow-y-auto rounded-b-none sm:rounded-2xl',
          widths[size],
        )}
      >
        {/* دستگیره کشیدن — نشانه بصری اینکه روی گوشی این یک شیت پایین‌کشویی است */}
        <div className="sheet-handle sm:hidden" aria-hidden />
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b px-5 py-4" style={{ background: 'var(--surface)' }}>
          <div className="min-w-0">
            <h3 id={titleId} className="text-sm font-bold">
              {title}
            </h3>
            {description ? <p className="mt-1 text-xs leading-6 muted">{description}</p> : null}
          </div>
          <button onClick={onClose} aria-label="بستن" className="tap-target shrink-0 rounded-lg muted hover:opacity-70">
            <X size={19} />
          </button>
        </header>
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <footer
            className="safe-bottom sticky bottom-0 flex flex-col-reverse gap-2 border-t px-5 py-3 sm:flex-row sm:flex-wrap sm:justify-end [&>button]:w-full sm:[&>button]:w-auto"
            style={{ background: 'var(--surface)' }}
          >
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

/** مودال تایید عملیات خطرناک */
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'تایید',
  danger = true,
  loading,
  requireText,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  /** اگر مقدار داده شود، کاربر باید دقیقاً همین متن را تایپ کند */
  requireText?: string;
}) {
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  const blocked = Boolean(requireText) && typed.trim() !== requireText;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            انصراف
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading} disabled={blocked}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-7">{message}</div>
      {requireText ? (
        <div className="mt-4">
          <label className="label">
            برای تایید، عبارت <code className="mono ltr rounded px-1 surface-2">{requireText}</code> را وارد کنید
          </label>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} className="ltr mono" autoFocus />
        </div>
      ) : null}
    </Modal>
  );
}

// ─────────────  حالت خالی  ─────────────

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
      {icon ? <div className="mb-3 muted opacity-70">{icon}</div> : null}
      <h3 className="text-sm font-bold">{title}</h3>
      {description ? <p className="mt-2 max-w-md text-xs leading-7 muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

// ─────────────  اسپینر  ─────────────

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cn('spin muted', className)} />;
}

export function LoadingBlock({ label = 'در حال بارگذاری…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-xs muted">
      <Spinner size={16} />
      {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4 w-full', className)} />;
}

// ─────────────  تب‌ها  ─────────────

export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: { id: string; label: string; icon?: React.ReactNode; badge?: number }[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('scroll-x border-b', className)}>
      <div className="flex min-w-max gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2.5 text-xs font-semibold transition',
              active === tab.id ? 'text-[var(--color-brand-600)]' : 'muted hover:opacity-80',
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.badge ? (
              <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{tab.badge}</span>
            ) : null}
            {active === tab.id ? (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-[var(--color-brand-600)]" />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────  کلید تغییر وضعیت  ─────────────

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <label className={cn('flex items-start gap-3', disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer')}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition',
          checked ? 'bg-[var(--color-brand-600)]' : 'bg-[var(--border)]',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all',
            checked ? 'right-0.5' : 'right-[1.125rem]',
          )}
        />
      </button>
      {(label || description) && (
        <span className="min-w-0">
          {label ? <span className="block text-sm font-medium">{label}</span> : null}
          {description ? <span className="mt-0.5 block text-xs leading-6 muted">{description}</span> : null}
        </span>
      )}
    </label>
  );
}

// ─────────────  صفحه‌بندی  ─────────────

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const fa = (n: number) => new Intl.NumberFormat('fa-IR', { useGrouping: false }).format(n);

  return (
    <div className="flex items-center justify-center gap-2 py-4">
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronRight size={14} /> قبلی
      </Button>
      <span className="tabular px-2 text-xs muted">
        صفحه {fa(page)} از {fa(totalPages)}
      </span>
      <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        بعدی <ChevronLeft size={14} />
      </Button>
    </div>
  );
}

// ─────────────  آمار  ─────────────

export function Stat({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'ok' | 'warn' | 'bad';
}) {
  const toneClass = tone === 'ok' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : tone === 'bad' ? 'text-red-600' : '';
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs muted">{label}</span>
        {icon ? <span className="muted opacity-70">{icon}</span> : null}
      </div>
      <div className={cn('tabular mt-2 text-lg font-bold', toneClass)}>{value}</div>
      {hint ? <div className="mt-1 text-[11px] leading-5 muted">{hint}</div> : null}
    </div>
  );
}

// ─────────────  هشدار  ─────────────

export function Alert({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: 'info' | 'success' | 'warning' | 'error';
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const styles = {
    info: 'border-sky-500/35 bg-sky-500/8 text-sky-700',
    success: 'border-emerald-500/35 bg-emerald-500/8 text-emerald-700',
    warning: 'border-amber-500/40 bg-amber-500/10 text-amber-700',
    error: 'border-red-500/35 bg-red-500/8 text-red-700',
  };
  return (
    <div className={cn('rounded-xl border px-4 py-3', styles[tone])}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {title ? <div className="text-sm font-bold">{title}</div> : null}
          {children ? <div className="mt-1 text-xs leading-7">{children}</div> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
