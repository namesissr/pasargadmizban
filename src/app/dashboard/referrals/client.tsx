'use client';

import useSWR from 'swr';
import { Gift, Users, TrendingUp, Share2 } from 'lucide-react';
import { Alert, Badge, Button, Card, CopyButton, EmptyState, LoadingBlock, Stat } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { fetcher } from '@/lib/client';
import { formatToman, formatNumber } from '@/lib/money';
import { faDate, USER_STATUS_FA } from '@/lib/utils';

type Report = {
  enabled: boolean;
  percent: number;
  minDeposit: number;
  maxPerDeposit: number;
  welcomeBonus: number;
  code: string | null;
  link: string | null;
  stats: { invited: number; active: number; totalEarned: number; totalDeposits: number; payouts: number };
  referrals: { id: string; name: string; email: string; status: string; joinedAt: string; earned: number }[];
  commissions: {
    id: string;
    amount: number;
    depositAmount: number;
    percent: number;
    from: string;
    createdAt: string;
  }[];
};

export function ReferralsClient() {
  const toast = useToast();
  const { data, isLoading } = useSWR<Report>('/api/referrals', fetcher);

  if (isLoading && !data) return <LoadingBlock />;
  if (!data) return <Alert tone="error">دریافت اطلاعات ممکن نشد.</Alert>;

  if (!data.enabled) {
    return (
      <Card>
        <EmptyState
          icon={<Gift size={40} />}
          title="برنامه معرفی در حال حاضر فعال نیست"
          description="برای اطلاع از زمان فعال‌سازی، اطلاعیه‌های پنل را دنبال کنید."
        />
      </Card>
    );
  }

  async function share() {
    if (!data?.link) return;
    const text = `با این لینک در پاسارگاد میزبان ثبت‌نام کن و سرور ابری با پرداخت ریالی بگیر:\n${data.link}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'پاسارگاد میزبان', text, url: data.link });
        return;
      } catch {
        // کاربر اشتراک‌گذاری را لغو کرد
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success('متن دعوت کپی شد.');
    } catch {
      toast.info('لینک دعوت را از کادر بالا کپی کنید.');
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="درآمد کل شما"
          value={formatToman(data.stats.totalEarned)}
          hint={`از ${formatNumber(data.stats.payouts)} پرداخت`}
          icon={<TrendingUp size={16} />}
          tone="ok"
        />
        <Stat label="دعوت‌شده‌ها" value={formatNumber(data.stats.invited)} icon={<Users size={16} />} />
        <Stat
          label="فعال (شارژ کرده)"
          value={formatNumber(data.stats.active)}
          hint="کاربرانی که برایتان درآمد ساخته‌اند"
        />
        <Stat
          label="سهم شما"
          value={`${formatNumber(data.percent)}٪`}
          hint={`از هر شارژ بالای ${formatToman(data.minDeposit)}`}
          icon={<Gift size={16} />}
        />
      </div>

      <Card title="لینک دعوت اختصاصی شما">
        <div className="space-y-4">
          {data.link ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <code className="mono ltr min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-xl px-3 py-2.5 text-xs surface-2">
                  {data.link}
                </code>
                <CopyButton value={data.link} label="کپی لینک" className="shrink-0" />
                <Button variant="secondary" size="sm" onClick={share} icon={<Share2 size={13} />}>
                  اشتراک‌گذاری
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs muted">کد معرف:</span>
                <code className="mono ltr rounded-lg px-2.5 py-1.5 text-sm font-bold surface-2">{data.code}</code>
                <CopyButton value={data.code ?? ''} />
              </div>
            </>
          ) : (
            <Alert tone="warning">کد معرف برای حساب شما ساخته نشده است. با پشتیبانی تماس بگیرید.</Alert>
          )}

          <div className="rounded-xl p-4 text-xs leading-7 surface-2">
            <div className="font-semibold">چطور کار می‌کند؟</div>
            <ol className="mt-2 list-inside list-decimal muted">
              <li>لینک بالا را برای دوستان خود بفرستید.</li>
              <li>آن‌ها با همین لینک ثبت‌نام می‌کنند{data.welcomeBonus > 0 ? ` و ${formatToman(data.welcomeBonus)} هدیه می‌گیرند` : ''}.</li>
              <li>
                هر بار که کیف پول خود را شارژ کنند، <b className="text-[var(--text)]">{formatNumber(data.percent)}٪</b>{' '}
                مبلغ به کیف پول شما اضافه می‌شود.
              </li>
              <li>این درآمد دائمی است و به یک بار محدود نمی‌شود.</li>
            </ol>
            {data.maxPerDeposit > 0 ? (
              <p className="mt-2 muted">سقف پورسانت هر تراکنش: {formatToman(data.maxPerDeposit)}</p>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <Card
          title={`دعوت‌شده‌ها (${formatNumber(data.referrals.length)})`}
          bodyClassName={data.referrals.length ? 'p-0' : undefined}
        >
          {data.referrals.length === 0 ? (
            <EmptyState
              icon={<Users size={34} />}
              title="هنوز کسی را دعوت نکرده‌اید"
              description="لینک بالا را با دوستانتان به اشتراک بگذارید."
            />
          ) : (
            <div className="scroll-x">
              <table className="table table-cards">
                <thead>
                  <tr>
                    <th>کاربر</th>
                    <th>عضویت</th>
                    <th>وضعیت</th>
                    <th>درآمد شما</th>
                  </tr>
                </thead>
                <tbody>
                  {data.referrals.map((r) => {
                    const st = USER_STATUS_FA[r.status] ?? { label: r.status, tone: 'muted' as const };
                    return (
                      <tr key={r.id}>
                        <td data-label="کاربر">
                          <div className="text-xs font-semibold">{r.name}</div>
                          <div className="ltr text-[10px] muted">{r.email}</div>
                        </td>
                        <td data-label="عضویت" className="whitespace-nowrap text-xs muted">{faDate(r.joinedAt)}</td>
                        <td data-label="وضعیت">
                          <Badge tone={st.tone}>{st.label}</Badge>
                        </td>
                        <td data-label="درآمد شما" className="tabular whitespace-nowrap text-xs font-bold text-emerald-600">
                          {r.earned > 0 ? formatToman(r.earned, { suffix: false }) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title="تاریخچه پورسانت"
          bodyClassName={data.commissions.length ? 'p-0' : undefined}
        >
          {data.commissions.length === 0 ? (
            <EmptyState
              icon={<Gift size={34} />}
              title="هنوز پورسانتی دریافت نکرده‌اید"
              description="به محض اینکه یکی از دعوت‌شده‌ها کیف پولش را شارژ کند، سهم شما اینجا ثبت می‌شود."
            />
          ) : (
            <div className="scroll-x">
              <table className="table table-cards">
                <thead>
                  <tr>
                    <th>از</th>
                    <th>مبلغ شارژ</th>
                    <th>سهم شما</th>
                    <th>تاریخ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.commissions.map((c) => (
                    <tr key={c.id}>
                      <td data-label="از" className="text-xs">{c.from}</td>
                      <td data-label="مبلغ شارژ" className="tabular whitespace-nowrap text-xs muted">
                        {formatToman(c.depositAmount, { suffix: false })}
                      </td>
                      <td data-label="سهم شما" className="tabular whitespace-nowrap text-xs font-bold text-emerald-600">
                        + {formatToman(c.amount, { suffix: false })}
                      </td>
                      <td data-label="تاریخ" className="whitespace-nowrap text-xs muted">{faDate(c.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
