'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import useSWR from 'swr';
import {
  LayoutDashboard,
  Server,
  Wallet,
  Receipt,
  LifeBuoy,
  KeyRound,
  User,
  Bell,
  Menu,
  X,
  LogOut,
  ShieldCheck,
  Users,
  Settings,
  Tags,
  ScrollText,
  CreditCard,
  Boxes,
  ArrowLeftRight,
  Plus,
  BellRing,
  Gift,
  Cloud,
  Radar,
  TicketPercent,
  Mail,
  Megaphone,
  MoreHorizontal,
  Send,
  Landmark,
  ListChecks,
  Columns3,
  BarChart3,
  BookOpen,
  ClipboardList,
  Timer,
  Code2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatToman } from '@/lib/money';
import { apiPost, fetcher } from '@/lib/client';
import { useToast } from '@/components/ui/toast';
import { ThemeToggle } from '@/components/app/theme';

export type ShellUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: 'USER' | 'SUPPORT' | 'ADMIN' | 'DEVELOPER' | 'EMPLOYER';
  balance: number;
};

/** tasks: پنل کارفرما — dev: پنل برنامه‌نویس */
type Area = 'user' | 'admin' | 'tasks' | 'dev';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  exact?: boolean;
  /** شمارنده تسک‌های دارای به‌روزرسانی دیده‌نشده کنار این گزینه نشان داده شود */
  taskBadge?: boolean;
  /** فقط برای کارفرما (مدیر یا کارفرما)، نه پشتیبان */
  managerOnly?: boolean;
};

const USER_NAV: NavItem[] = [
  { href: '/dashboard', label: 'داشبورد', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/servers', label: 'سرورهای من', icon: Server },
  { href: '/dashboard/transfers', label: 'انتقال سرور', icon: Send },
  { href: '/dashboard/wallet', label: 'کیف پول', icon: Wallet },
  { href: '/dashboard/transactions', label: 'تراکنش‌ها', icon: ArrowLeftRight },
  { href: '/dashboard/invoices', label: 'فاکتورها', icon: Receipt },
  { href: '/dashboard/tickets', label: 'پشتیبانی', icon: LifeBuoy },
  { href: '/dashboard/ssh-keys', label: 'کلیدهای SSH', icon: KeyRound },
  { href: '/dashboard/referrals', label: 'معرفی دوستان', icon: Gift },
  { href: '/dashboard/notifications-settings', label: 'اطلاع‌رسانی', icon: BellRing },
  { href: '/dashboard/profile', label: 'حساب کاربری', icon: User },
];

const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'داشبورد مدیریت', icon: LayoutDashboard, exact: true },
  { href: '/admin/users', label: 'کاربران', icon: Users },
  { href: '/admin/servers', label: 'سرورها', icon: Server },
  { href: '/admin/transactions', label: 'تراکنش‌ها', icon: CreditCard },
  { href: '/admin/invoices', label: 'فاکتورها', icon: Receipt },
  { href: '/admin/tickets', label: 'تیکت‌ها', icon: LifeBuoy },
  { href: '/tasks', label: 'تسک‌های توسعه', icon: ClipboardList, taskBadge: true },
  { href: '/admin/hetzner', label: 'حساب‌های هتزنر', icon: Cloud },
  { href: '/admin/ip-health', label: 'سلامت آدرس‌ها', icon: Radar },
  { href: '/admin/catalog', label: 'کاتالوگ هتزنر', icon: Boxes },
  { href: '/admin/pricing', label: 'قیمت‌گذاری', icon: Tags },
  { href: '/admin/promos', label: 'کدهای هدیه', icon: TicketPercent },
  { href: '/admin/announcements', label: 'اعلان‌های سایت', icon: Megaphone },
  { href: '/admin/messaging', label: 'ایمیل و پیامک', icon: Mail },
  { href: '/admin/gateways', label: 'درگاه‌ها', icon: Landmark },
  { href: '/admin/settings', label: 'تنظیمات', icon: Settings },
  { href: '/admin/logs', label: 'گزارش رویدادها', icon: ScrollText },
];

const TASKS_NAV: NavItem[] = [
  { href: '/tasks', label: 'داشبورد کارفرما', icon: LayoutDashboard, exact: true, taskBadge: true },
  { href: '/tasks/list', label: 'همه تسک‌ها', icon: ListChecks },
  { href: '/tasks/board', label: 'تخته کانبان', icon: Columns3 },
  { href: '/tasks/team', label: 'تیم برنامه‌نویسان', icon: Users, managerOnly: true },
  { href: '/tasks/worklog', label: 'کارکرد و ساعت‌ها', icon: Timer, managerOnly: true },
  { href: '/tasks/reports', label: 'گزارش عملکرد', icon: BarChart3 },
  { href: '/tasks/guide', label: 'راهنمای گردش کار', icon: BookOpen },
];

const DEV_NAV: NavItem[] = [
  { href: '/dev', label: 'میز کار من', icon: LayoutDashboard, exact: true, taskBadge: true },
  { href: '/dev/tasks', label: 'تسک‌ها', icon: ListChecks },
  { href: '/dev/board', label: 'تخته کانبان', icon: Columns3 },
  { href: '/dev/worklog', label: 'کارکرد من', icon: Timer },
  { href: '/dev/new', label: 'گزارش باگ یا پیشنهاد', icon: Plus },
  { href: '/dev/guide', label: 'راهنمای گردش کار', icon: BookOpen },
];

/** چهار میان‌بر پرکاربرد که روی گوشی در نوار پایین می‌نشینند */
const USER_TABS: NavItem[] = [
  { href: '/dashboard', label: 'خانه', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/servers', label: 'سرورها', icon: Server },
  { href: '/dashboard/wallet', label: 'کیف پول', icon: Wallet },
  { href: '/dashboard/tickets', label: 'پشتیبانی', icon: LifeBuoy },
];

const ADMIN_TABS: NavItem[] = [
  { href: '/admin', label: 'خانه', icon: LayoutDashboard, exact: true },
  { href: '/admin/servers', label: 'سرورها', icon: Server },
  { href: '/admin/users', label: 'کاربران', icon: Users },
  { href: '/admin/tickets', label: 'تیکت‌ها', icon: LifeBuoy },
];

const TASKS_TABS: NavItem[] = [
  { href: '/tasks', label: 'داشبورد', icon: LayoutDashboard, exact: true, taskBadge: true },
  { href: '/tasks/list', label: 'تسک‌ها', icon: ListChecks },
  { href: '/tasks/new', label: 'تسک جدید', icon: Plus },
  { href: '/tasks/team', label: 'تیم', icon: Users, managerOnly: true },
];

const DEV_TABS: NavItem[] = [
  { href: '/dev', label: 'میز کار', icon: LayoutDashboard, exact: true, taskBadge: true },
  { href: '/dev/tasks', label: 'تسک‌ها', icon: ListChecks },
  { href: '/dev/board', label: 'تخته', icon: Columns3 },
  { href: '/dev/worklog', label: 'کارکرد', icon: Timer },
];

const NAVS: Record<Area, NavItem[]> = { user: USER_NAV, admin: ADMIN_NAV, tasks: TASKS_NAV, dev: DEV_NAV };
const TABS: Record<Area, NavItem[]> = { user: USER_TABS, admin: ADMIN_TABS, tasks: TASKS_TABS, dev: DEV_TABS };
const HOME: Record<Area, string> = { user: '/dashboard', admin: '/admin', tasks: '/tasks', dev: '/dev' };
const AREA_TITLE: Record<Area, string> = {
  user: 'سرور ابری',
  admin: 'پنل مدیریت',
  tasks: 'پنل کارفرما',
  dev: 'پنل برنامه‌نویس',
};

const isTaskMember = (role: ShellUser['role']) =>
  role === 'ADMIN' || role === 'EMPLOYER' || role === 'SUPPORT' || role === 'DEVELOPER';

/** تعداد تسک‌های بازی که از آخرین بازدید کاربر تغییر کرده‌اند */
function useTaskBadge(enabled: boolean): number {
  const { data } = useSWR<{ unread: number }>(enabled ? '/api/tasks/summary' : null, fetcher, {
    refreshInterval: 60_000,
  });
  return data?.unread ?? 0;
}

/** زمان‌سنج کارکردی که الان روشن است — در نوار بالا نشان داده می‌شود تا فراموش نشود */
function RunningTimer() {
  const { data } = useSWR<{ running: { startedAt: string; task: { number: number; title: string } } | null }>(
    '/api/tasks/timer',
    fetcher,
    { refreshInterval: 60_000 },
  );
  const [, tick] = useState(0);
  useEffect(() => {
    if (!data?.running) return;
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [data?.running]);

  if (!data?.running) return null;
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(data.running.startedAt).getTime()) / 60_000));
  const fa = (n: number) => new Intl.NumberFormat('fa-IR', { minimumIntegerDigits: 2, useGrouping: false }).format(n);
  return (
    <Link
      href={`/t/${data.running.task.number}`}
      title={`زمان‌سنج روشن: ${data.running.task.title}`}
      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/12 px-2.5 py-1.5 text-xs font-bold text-emerald-700 transition hover:opacity-80"
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
      <span className="tabular ltr">{fa(Math.floor(minutes / 60))}:{fa(minutes % 60)}</span>
      <span className="hidden sm:inline">#{new Intl.NumberFormat('fa-IR', { useGrouping: false }).format(data.running.task.number)}</span>
    </Link>
  );
}

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function Shell({
  user,
  area = 'user',
  children,
}: {
  user: ShellUser;
  area?: Area;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const manager = user.role === 'ADMIN' || user.role === 'EMPLOYER';
  const nav = NAVS[area].filter((item) => manager || !item.managerOnly);
  const taskBadge = useTaskBadge(area !== 'user' && isTaskMember(user.role));

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // وقتی منوی کشویی باز است، پس‌زمینه نباید بلغزد
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // بستن با کلید Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="flex min-h-screen">
      {/* پس‌زمینه منوی موبایل */}
      {open ? (
        <div className="fixed inset-0 z-40 bg-black/45 lg:hidden" onClick={() => setOpen(false)} aria-hidden />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-[17rem] max-w-[85vw] shrink-0 flex-col border-l shadow-2xl transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:max-w-none lg:translate-x-0 lg:shadow-none',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        style={{ background: 'var(--surface)' }}
        aria-hidden={!open ? undefined : false}
      >
        <div className="safe-top flex items-center justify-between gap-2 border-b px-4 py-4">
          <Link href={HOME[area]} className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--color-brand-600)] text-white">
              <Server size={17} />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-extrabold">پاسارگاد میزبان</span>
              <span className="block text-[11px] muted">{AREA_TITLE[area]}</span>
            </span>
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="tap-target rounded-lg muted lg:hidden"
            aria-label="بستن منو"
          >
            <X size={19} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          {area === 'user' ? (
            <Link href="/dashboard/servers/new" className="btn btn-primary mb-3 w-full">
              <Plus size={16} /> ساخت سرور جدید
            </Link>
          ) : area === 'tasks' ? (
            <Link href="/tasks/new" className="btn btn-primary mb-3 w-full">
              <Plus size={16} /> ثبت تسک جدید
            </Link>
          ) : area === 'dev' ? (
            <div className="mb-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold surface-2">
              <Code2 size={16} /> پنل برنامه‌نویس
            </div>
          ) : null}

          <ul className="space-y-1">
            {nav.map((item) => {
              const active = isActive(pathname, item);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium transition',
                      active
                        ? 'bg-[var(--color-brand-600)] text-white'
                        : 'muted hover:bg-[var(--surface-2)] hover:text-[var(--text)]',
                    )}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon size={17} />
                    {item.label}
                    {item.taskBadge && taskBadge > 0 ? (
                      <span className="mr-auto grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                        {new Intl.NumberFormat('fa-IR').format(taskBadge)}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>

          <AreaLinks role={user.role} area={area} />

          {/* روی گوشی خروج از حساب داخل همین منو در دسترس است */}
          <div className="mt-4 border-t pt-3 lg:hidden">
            <LogoutButton className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium muted transition hover:bg-[var(--surface-2)] hover:text-red-500">
              <LogOut size={17} />
              خروج از حساب
            </LogoutButton>
          </div>
        </nav>

        <BalanceBox balance={user.balance} area={area} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} area={area} onMenu={() => setOpen(true)} />
        <main className="has-bottom-nav flex-1 p-4 sm:p-6">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
        <footer className="has-bottom-nav border-t px-6 py-4 text-center text-[11px] muted">
          پاسارگاد میزبان — تمامی حقوق محفوظ است.
        </footer>
      </div>

      <BottomNav area={area} manager={manager} taskBadge={taskBadge} onMenu={() => setOpen(true)} />
    </div>
  );
}

/** پیوند جابه‌جایی بین پنل‌ها بر اساس نقش کاربر */
function AreaLinks({ role, area }: { role: ShellUser['role']; area: Area }) {
  const links: { href: string; label: string; icon: React.ComponentType<{ size?: number }> }[] = [];
  const staff = role === 'ADMIN' || role === 'SUPPORT';
  if (staff && area !== 'admin') links.push({ href: '/admin', label: 'ورود به پنل مدیریت', icon: ShieldCheck });
  if (isTaskMember(role) && area === 'user') {
    links.push(
      role === 'DEVELOPER'
        ? { href: '/dev', label: 'پنل برنامه‌نویس', icon: Code2 }
        : { href: '/tasks', label: 'پنل کارفرما (تسک‌ها)', icon: ClipboardList },
    );
  }
  if (area !== 'user') links.push({ href: '/dashboard', label: 'پنل کاربری', icon: LayoutDashboard });
  if (!links.length) return null;

  return (
    <div className="mt-4 space-y-1 border-t pt-3">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium muted transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          <l.icon size={17} />
          {l.label}
        </Link>
      ))}
    </div>
  );
}

/** نوار پیمایش پایین صفحه — فقط روی گوشی و تبلت کوچک دیده می‌شود */
function BottomNav({
  area,
  manager,
  taskBadge,
  onMenu,
}: {
  area: Area;
  manager: boolean;
  taskBadge: number;
  onMenu: () => void;
}) {
  const pathname = usePathname();
  const tabs = TABS[area].filter((item) => manager || !item.managerOnly);

  return (
    <nav
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t lg:hidden"
      style={{
        background: 'color-mix(in srgb, var(--surface) 94%, transparent)',
        backdropFilter: 'blur(12px)',
      }}
      aria-label="پیمایش سریع"
    >
      <div className="mx-auto flex max-w-lg items-stretch">
        {tabs.map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold transition',
                active ? 'text-[var(--color-brand-600)]' : 'muted',
              )}
            >
              <span
                className={cn(
                  'relative grid h-7 w-12 place-items-center rounded-full transition',
                  active ? 'bg-[color-mix(in_srgb,var(--color-brand-500)_16%,transparent)]' : '',
                )}
              >
                <Icon size={18} />
                {item.taskBadge && taskBadge > 0 ? (
                  <span className="absolute -top-0.5 right-1.5 h-2 w-2 rounded-full bg-red-500" />
                ) : null}
              </span>
              {item.label}
            </Link>
          );
        })}

        <button
          onClick={onMenu}
          className="flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold muted transition"
          aria-label="منوی کامل"
        >
          <span className="grid h-7 w-12 place-items-center rounded-full">
            <MoreHorizontal size={18} />
          </span>
          بیشتر
        </button>
      </div>
    </nav>
  );
}

function BalanceBox({ balance, area }: { balance: number; area: Area }) {
  const { data } = useSWR<{ balance: number }>('/api/me/balance', fetcher, {
    refreshInterval: 60_000,
    fallbackData: { balance },
  });
  const value = data?.balance ?? balance;

  if (area !== 'user') return null;

  return (
    <div className="safe-bottom border-t p-3">
      <Link href="/dashboard/wallet" className="block rounded-xl p-3 transition surface-2 hover:opacity-90">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] muted">موجودی کیف پول</span>
          <Wallet size={14} className="muted" />
        </div>
        <div className={cn('tabular mt-1 text-sm font-bold', value <= 0 ? 'text-red-500' : '')}>
          {formatToman(value)}
        </div>
      </Link>
    </div>
  );
}

function LogoutButton({ className, children }: { className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await apiPost('/api/auth/logout');
      router.push('/login');
      router.refresh();
    } catch {
      toast.error('خروج از حساب انجام نشد.');
      setBusy(false);
    }
  }

  return (
    <button onClick={logout} disabled={busy} className={className}>
      {children}
    </button>
  );
}

function Topbar({ user, area, onMenu }: { user: ShellUser; area: Area; onMenu: () => void }) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

  return (
    <header
      className="safe-top sticky top-0 z-30 flex items-center gap-1 border-b px-3 py-3 sm:gap-2 sm:px-6"
      style={{ background: 'color-mix(in srgb, var(--surface) 88%, transparent)', backdropFilter: 'blur(8px)' }}
    >
      <button onClick={onMenu} className="tap-target rounded-lg muted lg:hidden" aria-label="منو">
        <Menu size={20} />
      </button>

      {/* روی گوشی نام برند در نوار بالا می‌آید چون منو بسته است */}
      <Link href={HOME[area]} className="text-sm font-extrabold lg:hidden">
        پاسارگاد میزبان
      </Link>

      <div className="flex-1" />

      {area === 'user' ? (
        <Link
          href="/dashboard/servers/new"
          className="btn btn-primary btn-sm hidden sm:inline-flex lg:hidden"
        >
          <Plus size={15} /> سرور جدید
        </Link>
      ) : area === 'tasks' ? (
        <Link href="/tasks/new" className="btn btn-primary btn-sm hidden sm:inline-flex">
          <Plus size={15} /> تسک جدید
        </Link>
      ) : null}

      {area === 'tasks' || area === 'dev' ? <RunningTimer /> : null}

      <NotificationBell />
      <ThemeToggle />

      <div className="mx-1 hidden h-6 w-px bg-[var(--border)] sm:block" />

      <div className="hidden text-right sm:block">
        <div className="max-w-40 truncate text-xs font-semibold">{name}</div>
        <div className="max-w-40 truncate text-[11px] muted ltr">{user.email}</div>
      </div>

      <LogoutButton className="tap-target hidden rounded-lg muted transition hover:text-red-500 lg:inline-flex">
        <LogOut size={17} />
      </LogoutButton>
    </header>
  );
}

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data, mutate } = useSWR<{ items: NotificationRow[]; unread: number }>(
    '/api/notifications?limit=8',
    fetcher,
    { refreshInterval: 45_000 },
  );

  const unread = data?.unread ?? 0;

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);

  async function markAll() {
    await apiPost('/api/notifications/read').catch(() => null);
    mutate();
  }

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="tap-target relative rounded-lg muted transition hover:opacity-70"
        aria-label="اعلان‌ها"
      >
        <Bell size={18} />
        {unread > 0 ? (
          <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
            {unread > 9 ? '۹+' : new Intl.NumberFormat('fa-IR').format(unread)}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="card fade-up absolute left-0 top-full z-50 mt-2 w-[min(88vw,20rem)] overflow-hidden shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <span className="text-xs font-bold">اعلان‌ها</span>
            {unread > 0 ? (
              <button onClick={markAll} className="text-[11px] text-[var(--color-brand-600)] hover:underline">
                خواندن همه
              </button>
            ) : null}
          </div>
          <div className="max-h-[min(60vh,20rem)] overflow-y-auto">
            {!data ? (
              <div className="px-4 py-6 text-center text-xs muted">در حال بارگذاری…</div>
            ) : data.items.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs muted">اعلان جدیدی ندارید.</div>
            ) : (
              data.items.map((n) => {
                const content = (
                  <div
                    className={cn(
                      'border-b px-4 py-3 transition last:border-b-0 hover:bg-[var(--surface-2)]',
                      !n.readAt && 'bg-[var(--surface-2)]',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={cn(
                          'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                          n.type === 'error'
                            ? 'bg-red-500'
                            : n.type === 'warning'
                              ? 'bg-amber-500'
                              : n.type === 'success'
                                ? 'bg-emerald-500'
                                : 'bg-sky-500',
                        )}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold">{n.title}</div>
                        {n.body ? <div className="mt-1 line-clamp-2 text-[11px] leading-6 muted">{n.body}</div> : null}
                      </div>
                    </div>
                  </div>
                );
                return n.link ? (
                  <Link key={n.id} href={n.link} onClick={() => setOpen(false)}>
                    {content}
                  </Link>
                ) : (
                  <div key={n.id}>{content}</div>
                );
              })
            )}
          </div>
          <Link
            href="/dashboard/notifications"
            onClick={() => setOpen(false)}
            className="block border-t px-4 py-2.5 text-center text-[11px] text-[var(--color-brand-600)] hover:underline"
          >
            مشاهده همه اعلان‌ها
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
  breadcrumb,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  breadcrumb?: { href: string; label: string }[];
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {breadcrumb?.length ? (
          <nav className="mb-1.5 flex flex-wrap items-center gap-1 text-[11px] muted">
            {breadcrumb.map((b, i) => (
              <span key={b.href} className="flex items-center gap-1">
                {i > 0 ? <span className="opacity-50">/</span> : null}
                <Link href={b.href} className="hover:underline">
                  {b.label}
                </Link>
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="text-lg font-extrabold sm:text-xl">{title}</h1>
        {description ? <p className="mt-1 text-xs leading-6 muted">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}
