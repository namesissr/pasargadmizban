import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/app/shell';
import { Card } from '@/components/ui';
import { TASK_NECESSITY_FA, TASK_PRIORITY_FA, TASK_STATUS_COLOR, TASK_STATUS_FA, type TaskStatus } from '@/lib/dev-tasks-shared';

export const metadata: Metadata = { title: 'راهنمای گردش کار تسک‌ها' };

const FLOW: { status: TaskStatus; who: string; text: string }[] = [
  { status: 'TODO', who: 'مدیر', text: 'تسک را با جزئیات، اولویت، ضرورت و مهلت ثبت می‌کند. برنامه‌نویس فوراً در پنل، تلگرام و ایمیل باخبر می‌شود.' },
  { status: 'IN_PROGRESS', who: 'برنامه‌نویس', text: 'با زدن «شروع کار» اعلام می‌کند روی آن کار می‌کند. مدیر می‌بیند چه کاری در جریان است.' },
  { status: 'BLOCKED', who: 'برنامه‌نویس', text: 'اگر اطلاعات یا تصمیمی لازم باشد، «نیاز به اطلاعات» را می‌زند و سؤالش را می‌نویسد. مدیر فوراً باخبر می‌شود و در گفتگوی تسک پاسخ می‌دهد.' },
  { status: 'REVIEW', who: 'برنامه‌نویس', text: 'پس از اتمام، «اعلام انجام شد» را می‌زند و توضیح می‌دهد چه کرده و چطور تست شود. کار به صف بررسی مدیر می‌رود.' },
  { status: 'DONE', who: 'مدیر', text: 'نتیجه را بررسی می‌کند: اگر درست است «تأیید و بستن»، وگرنه «برگرداندن برای اصلاح» با توضیح ایراد. تسک تا تأیید مدیر بسته نمی‌شود.' },
];

export default function TaskGuidePage() {
  return (
    <>
      <PageHeader
        title="راهنمای گردش کار"
        description="این بخش برای این ساخته شده که هیچ کاری فراموش نشود: هر تسک تا وقتی مدیر تأییدش نکرده، باز می‌ماند و سیستم مدام یادآوری می‌کند."
        breadcrumb={[{ href: '/tasks', label: 'میز کار تسک‌ها' }]}
      />

      <div className="space-y-5">
        <Card title="چرخه زندگی هر تسک">
          <ol className="space-y-4">
            {FLOW.map((f, i) => (
              <li key={f.status} className="flex gap-3">
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
                  style={{ background: TASK_STATUS_COLOR[f.status] }}
                >
                  {new Intl.NumberFormat('fa-IR').format(i + 1)}
                </span>
                <div>
                  <div className="text-sm font-bold">
                    {TASK_STATUS_FA[f.status].label} <span className="text-xs font-normal muted">— {f.who}</span>
                  </div>
                  <p className="mt-1 text-xs leading-7 muted">{f.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <div className="grid gap-5 md:grid-cols-2">
          <Card title="اولویت: چقدر زود؟">
            <ul className="space-y-2 text-xs leading-7">
              {Object.values(TASK_PRIORITY_FA).map((p) => (
                <li key={p.label} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                  <b>{p.label}</b>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-7 muted">اولویت ترتیب اجرا را مشخص می‌کند. تسک «فوری» اگر دو ساعت پس از ثبت شروع نشود، هر شش ساعت یادآوری می‌شود.</p>
          </Card>
          <Card title="ضرورت: چقدر لازم؟">
            <ul className="space-y-2 text-xs leading-7">
              {Object.values(TASK_NECESSITY_FA).map((n) => (
                <li key={n.label}>
                  <b>{n.label}:</b> <span className="muted">{n.hint}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card title="یادآوری خودکار — چرا چیزی فراموش نمی‌شود">
          <ul className="list-inside list-disc space-y-2 text-xs leading-7">
            <li>
              <b>هر روز ساعت ۹ صبح</b> (به‌جز جمعه): برنامه‌نویس فهرست کارهای باز خودش را به ترتیب اهمیت می‌گیرد؛ مدیر گزارش کارهای منتظر
              تأیید، منتظر پاسخ، عقب‌افتاده و بی‌حرکت را.
            </li>
            <li>
              <b>کمتر از یک روز تا مهلت:</b> به مسئول یادآوری می‌شود. <b>مهلت گذشته:</b> هر روز به مسئول و مدیر هشدار داده می‌شود.
            </li>
            <li>
              <b>«انجام شد» یا «نیاز به اطلاعات» بی‌جواب:</b> اگر بیش از ۲۴ ساعت بماند، هر روز به مدیر یادآوری می‌شود.
            </li>
            <li>
              <b>هر تغییر</b> (تسک جدید، سپردن، تغییر وضعیت، نظر تازه، بالا رفتن اولویت) همان لحظه به طرف مقابل اطلاع داده می‌شود.
            </li>
            <li>تسک‌هایی که پس از آخرین بازدید شما تغییر کرده‌اند با نشان «به‌روزرسانی جدید» و عدد قرمز در منو مشخص می‌شوند.</li>
          </ul>
          <p className="mt-3 rounded-lg p-3 text-xs leading-7 surface-2">
            برای اینکه اعلان‌ها روی گوشی هم برسد، هر دو نفر حساب خود را از{' '}
            <Link href="/dashboard/notifications-settings" className="font-semibold text-[var(--color-brand-600)] hover:underline">
              تنظیمات اطلاع‌رسانی
            </Link>{' '}
            به ربات تلگرام وصل کنید و دسته «پشتیبانی و تیکت» را روشن نگه دارید.
          </p>
        </Card>

        <div className="grid gap-5 md:grid-cols-2">
          <Card title="برای مدیر: تسک خوب چطور نوشته می‌شود؟">
            <ul className="list-inside list-disc space-y-1.5 text-xs leading-7">
              <li>عنوان کوتاه و دقیق: چه چیزی، کجا خراب است یا باید اضافه شود.</li>
              <li>برای باگ از دکمه «درج قالب گزارش باگ» استفاده کنید: مراحل ایجاد، نتیجه مورد انتظار، نتیجه فعلی.</li>
              <li>اسکرین‌شات را مستقیم با Ctrl+V در متن بچسبانید؛ خودکار پیوست می‌شود.</li>
              <li>آدرس صفحه مشکل‌دار را در فیلد «آدرس صفحه» بگذارید.</li>
              <li>کار بزرگ را با چک‌لیست به مراحل کوچک بشکنید.</li>
              <li>روی تخته کانبان، ترتیب کارت‌های ستون «در صف» را با کشیدن عوض کنید تا برنامه‌نویس بداند اول سراغ کدام برود.</li>
            </ul>
          </Card>
          <Card title="برای برنامه‌نویس: روال روزانه">
            <ul className="list-inside list-disc space-y-1.5 text-xs leading-7">
              <li>از نمای «سپرده به من» شروع کنید؛ ترتیب هوشمند، مهم‌ترین و نزدیک‌ترین مهلت‌ها را بالا می‌آورد.</li>
              <li>قبل از شروع هر کار «شروع کار» را بزنید.</li>
              <li>اگر سؤال دارید، کار را معطل نگذارید: «نیاز به اطلاعات» را بزنید و سؤال را بنویسید.</li>
              <li>مراحل چک‌لیست را همان موقع تیک بزنید تا پیشرفت دیده شود.</li>
              <li>هنگام «اعلام انجام شد» بنویسید چه تغییری دادید و چطور تست شود.</li>
              <li>اگر کار برگشت خورد، توضیح مدیر در تاریخچه تسک آمده است.</li>
            </ul>
          </Card>
        </div>

        <Card title="نقش‌ها و دسترسی‌ها">
          <div className="scroll-x">
            <table className="table text-xs">
              <thead>
                <tr>
                  <th>کار</th>
                  <th>مدیر</th>
                  <th>برنامه‌نویس</th>
                  <th>پشتیبان</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['ثبت تسک، نظر و پیوست', '✅', '✅', '✅'],
                  ['تعیین اولویت، ضرورت، مهلت و مسئول', '✅', '—', 'فقط هنگام ثبت'],
                  ['شروع کار، اعلام انجام شد، نیاز به اطلاعات', '✅', '✅', '—'],
                  ['تأیید و بستن، برگرداندن، لغو، بازگشایی', '✅', '—', '—'],
                  ['چک‌لیست', '✅', '✅', 'تسک‌های خودش'],
                  ['بایگانی و حذف', '✅', '—', '—'],
                ].map((row) => (
                  <tr key={row[0]}>
                    {row.map((c, i) => (
                      <td key={i} className={i ? 'text-center' : ''}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-7 muted">
            برای ساخت حساب برنامه‌نویس: او در سایت ثبت‌نام می‌کند، سپس از پنل مدیریت ← کاربران، نقش حسابش را «برنامه‌نویس» کنید. برنامه‌نویس فقط
            به همین میز کار دسترسی دارد و اطلاعات مالی و مشتریان را نمی‌بیند.
          </p>
        </Card>
      </div>
    </>
  );
}
