import Link from 'next/link';
import type { Metadata } from 'next';
import { Server, Wallet, LifeBuoy, TrendingDown, Plus, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';
import prisma from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { burnRate } from '@/lib/billing';
import { formatToman, formatNumber } from '@/lib/money';
import { faDateTime, faRelative, SERVER_STATUS_FA, faDuration } from '@/lib/utils';
import { Card, Stat, Badge, Alert, EmptyState, Button } from '@/components/ui';
import { LoyaltyCard } from '@/components/app/loyalty-card';
import { PageHeader } from '@/components/app/shell';

export const metadata: Metadata = { title: 'داشبورد' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireUser();

  const [servers, balanceRow, burn, unpaidInvoices, openTickets, recentTx, announcement] = await Promise.all([
    prisma.server.findMany({
      where: { userId: user.id, status: { not: 'DELETED' } },
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: {
        id: true,
        name: true,
        status: true,
        serverTypeName: true,
        locationName: true,
        ipv4: true,
        billingCycle: true,
        priceHourly: true,
        priceMonthly: true,
        expiresAt: true,
        cores: true,
        memory: true,
        disk: true,
      },
    }),
    prisma.user.findUnique({ where: { id: user.id }, select: { balance: true, emailVerifiedAt: true, status: true } }),
    burnRate(user.id),
    prisma.invoice.aggregate({ where: { userId: user.id, status: 'UNPAID' }, _sum: { total: true }, _count: true }),
    prisma.ticket.count({ where: { userId: user.id, status: { notIn: ['CLOSED'] } } }),
    prisma.transaction.findMany({
      where: { userId: user.id, status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, type: true, direction: true, amount: true, description: true, createdAt: true },
    }),
    prisma.announcement.findFirst({ where: { active: true, pinned: true }, orderBy: { createdAt: 'desc' } }),
  ]);

  const balance = balanceRow?.balance ?? 0n;
  const totalServers = await prisma.server.count({ where: { userId: user.id, status: { not: 'DELETED' } } });
  const runningCount = servers.filter((s) => s.status === 'RUNNING').length;

  const hoursLeft = burn.hourly > 0n ? Number(balance / burn.hourly) : null;
  const lowBalance = hoursLeft !== null && hoursLeft < 72;

  return (
    <>
      <PageHeader
        title={`سلام ${user.firstName ?? ''}`}
        description="خلاصه وضعیت سرویس‌ها، اعتبار و مصرف شما."
        action={
          <Link href="/dashboard/servers/new" className="btn btn-primary">
            <Plus size={16} /> ساخت سرور
          </Link>
        }
      />

      <div className="space-y-5">
        {balanceRow?.status === 'PENDING' && !balanceRow.emailVerifiedAt ? (
          <Alert
            tone="warning"
            title="ایمیل خود را تایید کنید"
            action={
              <Link href="/dashboard/profile" className="btn btn-secondary btn-sm">
                رفتن به حساب کاربری
              </Link>
            }
          >
            تا زمانی که ایمیل حساب تایید نشود، امکان ساخت سرور وجود ندارد.
          </Alert>
        ) : null}

        {lowBalance ? (
          <Alert
            tone={hoursLeft !== null && hoursLeft < 24 ? 'error' : 'warning'}
            title="اعتبار شما رو به اتمام است"
            action={
              <Link href="/dashboard/wallet" className="btn btn-primary btn-sm">
                شارژ کیف پول
              </Link>
            }
          >
            با مصرف فعلی، اعتبار شما حدود {faDuration(Number(hoursLeft) * 3600_000)} دیگر کافی است. پس از اتمام موجودی
            سرورها تعلیق می‌شوند.
          </Alert>
        ) : null}

        {announcement ? (
          <Alert tone={announcement.level as 'info'} title={announcement.title}>
            {announcement.body}
          </Alert>
        ) : null}

        {/* آمار */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <Stat
            label="موجودی کیف پول"
            value={formatToman(balance)}
            hint={
              hoursLeft !== null
                ? `کافی برای حدود ${faDuration(Number(hoursLeft) * 3600_000)}`
                : 'هنوز سرویس فعالی ندارید'
            }
            icon={<Wallet size={16} />}
            tone={balance <= 0n ? 'bad' : lowBalance ? 'warn' : 'ok'}
          />
          <Stat
            label="سرورهای فعال"
            value={`${formatNumber(runningCount)} از ${formatNumber(totalServers)}`}
            hint={`سقف مجاز شما: ${formatNumber(user.maxServers)} سرور`}
            icon={<Server size={16} />}
          />
          <Stat
            label="مصرف ماهانه تخمینی"
            value={formatToman(burn.monthly)}
            hint={`روزانه حدود ${formatToman(burn.daily)}`}
            icon={<TrendingDown size={16} />}
          />
          <Stat
            label="تیکت‌های باز"
            value={formatNumber(openTickets)}
            hint={
              unpaidInvoices._count > 0
                ? `${formatNumber(unpaidInvoices._count)} فاکتور پرداخت‌نشده`
                : 'فاکتور پرداخت‌نشده ندارید'
            }
            icon={<LifeBuoy size={16} />}
            tone={unpaidInvoices._count > 0 ? 'warn' : undefined}
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {/* سرورها */}
          <Card
            className="lg:col-span-2"
            title="سرورهای اخیر"
            action={
              <Link href="/dashboard/servers" className="text-xs text-[var(--color-brand-600)] hover:underline">
                مشاهده همه
              </Link>
            }
            bodyClassName={servers.length ? 'p-0' : undefined}
          >
            {servers.length === 0 ? (
              <EmptyState
                icon={<Server size={38} />}
                title="هنوز سروری نساخته‌اید"
                description="برای شروع، کیف پول را شارژ کنید و اولین سرور ابری خود را در کمتر از یک دقیقه تحویل بگیرید."
                action={
                  <Link href="/dashboard/servers/new">
                    <Button icon={<Plus size={16} />}>ساخت اولین سرور</Button>
                  </Link>
                }
              />
            ) : (
              <div className="scroll-x">
                <table className="table table-cards">
                  <thead>
                    <tr>
                      <th>نام</th>
                      <th>مشخصات</th>
                      <th>آدرس IP</th>
                      <th>وضعیت</th>
                      <th>هزینه</th>
                    </tr>
                  </thead>
                  <tbody>
                    {servers.map((s) => {
                      const st = SERVER_STATUS_FA[s.status] ?? { label: s.status, tone: 'muted' as const };
                      return (
                        <tr key={s.id}>
                          <td data-label="نام">
                            <Link
                              href={`/dashboard/servers/${s.id}`}
                              className="font-semibold hover:text-[var(--color-brand-600)]"
                            >
                              {s.name}
                            </Link>
                            <div className="mt-0.5 text-[11px] muted">{s.locationName.toUpperCase()}</div>
                          </td>
                          <td data-label="مشخصات" className="text-xs muted">
                            {formatNumber(s.cores)} هسته · {formatNumber(s.memory)} گیگ رم · {formatNumber(s.disk)} گیگ
                            دیسک
                          </td>
                          <td data-label="آدرس IP" className="mono ltr text-xs">{s.ipv4 ?? '—'}</td>
                          <td data-label="وضعیت">
                            <Badge tone={st.tone}>{st.label}</Badge>
                          </td>
                          <td data-label="هزینه" className="tabular whitespace-nowrap text-xs">
                            {s.billingCycle === 'HOURLY'
                              ? `${formatToman(s.priceHourly, { suffix: false })} / ساعت`
                              : `${formatToman(s.priceMonthly, { suffix: false })} / ماه`}
                            {s.expiresAt ? (
                              <div className="mt-0.5 text-[11px] muted">سررسید {faRelative(s.expiresAt)}</div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* تراکنش‌ها */}
          <Card
            title="آخرین تراکنش‌ها"
            action={
              <Link href="/dashboard/transactions" className="text-xs text-[var(--color-brand-600)] hover:underline">
                همه
              </Link>
            }
          >
            {recentTx.length === 0 ? (
              <p className="py-6 text-center text-xs muted">تراکنشی ثبت نشده است.</p>
            ) : (
              <ul className="space-y-3">
                {recentTx.map((t) => (
                  <li key={t.id} className="flex items-start justify-between gap-3 border-b pb-3 last:border-b-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium">{t.description ?? '—'}</div>
                      <div className="mt-0.5 text-[11px] muted">{faDateTime(t.createdAt)}</div>
                    </div>
                    <span
                      className={`tabular shrink-0 text-xs font-bold ${
                        t.direction === 'CREDIT' ? 'text-emerald-600' : 'text-red-500'
                      }`}
                    >
                      {t.direction === 'CREDIT' ? '+' : '−'}
                      {formatToman(t.amount, { suffix: false })}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 rounded-xl p-3 text-xs leading-6 surface-2">
              <div className="flex items-center gap-1.5 font-semibold">
                <Clock size={14} /> نحوه محاسبه هزینه
              </div>
              <p className="mt-1.5 muted">
                سرورهای ساعتی هر ساعت از کیف پول کسر می‌شوند و سقف پرداخت ماهانه آن‌ها از قیمت ماهانه بیشتر نمی‌شود.
              </p>
            </div>
          </Card>
        </div>

        {/* باشگاه مشتریان */}
        <LoyaltyCard />

        {/* راهنمای شروع */}
        {totalServers === 0 ? (
          <Card title="سه گام تا اولین سرور">
            <ol className="grid gap-4 sm:grid-cols-3">
              {[
                { title: 'تایید حساب', body: 'ایمیل خود را تایید کنید تا حساب فعال شود.', done: Boolean(balanceRow?.emailVerifiedAt) },
                { title: 'شارژ کیف پول', body: 'مبلغ مورد نیاز را از طریق درگاه بانکی واریز کنید.', done: balance > 0n },
                { title: 'ساخت سرور', body: 'پلن و لوکیشن را انتخاب کنید؛ تحویل خودکار است.', done: false },
              ].map((step, i) => (
                <li key={i} className="rounded-xl border p-4">
                  <div className="flex items-center gap-2">
                    {step.done ? (
                      <CheckCircle2 size={17} className="text-emerald-500" />
                    ) : (
                      <span className="grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold surface-2">
                        {formatNumber(i + 1)}
                      </span>
                    )}
                    <span className="text-sm font-bold">{step.title}</span>
                  </div>
                  <p className="mt-2 text-xs leading-6 muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </Card>
        ) : null}

        {unpaidInvoices._count > 0 ? (
          <Alert
            tone="warning"
            title={`${formatNumber(unpaidInvoices._count)} فاکتور پرداخت‌نشده دارید`}
            action={
              <Link href="/dashboard/invoices" className="btn btn-secondary btn-sm">
                <AlertTriangle size={14} /> مشاهده فاکتورها
              </Link>
            }
          >
            مجموع مبلغ: {formatToman(unpaidInvoices._sum.total ?? 0n)}
          </Alert>
        ) : null}
      </div>
    </>
  );
}
