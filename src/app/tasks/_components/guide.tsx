import Link from 'next/link';
import { Card } from '@/components/ui';
import { TASK_NECESSITY_FA, TASK_PRIORITY_FA, TASK_STATUS_COLOR, TASK_STATUS_FA, type TaskStatus } from '@/lib/dev-tasks-shared';

const FLOW: { status: TaskStatus; who: string; text: string }[] = [
  {
    status: 'TODO',
    who: 'کارفرما',
    text: 'تسک را با جزئیات، اولویت، ضرورت، مهلت و مسئول ثبت می‌کند. برنامه‌نویس فوراً در پنل، تلگرام و ایمیل باخبر می‌شود. اگر مسئولی تعیین نشود، تسک در «تسک‌های آزاد» همه برنامه‌نویس‌ها می‌آید.',
  },
  {
    status: 'IN_PROGRESS',
    who: 'برنامه‌نویس',
    text: 'با «شروع کار» اعلام می‌کند روی آن کار می‌کند و زمان‌سنج را روشن می‌کند تا ساعت کارکردش ثبت شود.',
  },
  {
    status: 'BLOCKED',
    who: 'برنامه‌نویس',
    text: 'اگر اطلاعات یا تصمیمی لازم باشد «نیاز به اطلاعات» را می‌زند و سؤالش را می‌نویسد. هر دو کارفرما فوراً باخبر می‌شوند و هر کدام می‌تواند پاسخ دهد.',
  },
  {
    status: 'REVIEW',
    who: 'برنامه‌نویس',
    text: 'پس از اتمام «اعلام انجام شد» را می‌زند و توضیح می‌دهد چه کرده و چطور تست شود. کار به صف «منتظر تأیید» داشبورد کارفرما می‌رود.',
  },
  {
    status: 'DONE',
    who: 'کارفرما',
    text: 'یکی از کارفرماها نتیجه را بررسی می‌کند: «تأیید و بستن» با امتیاز کیفیت ۱ تا ۵، یا «برگرداندن برای اصلاح» با توضیح ایراد. تسک تا تأیید کارفرما بسته نمی‌شود.',
  },
];

export function TaskGuide({ panel }: { panel: 'employer' | 'developer' }) {
  return (
    <div className="space-y-5">
      <Card title="دو پنل جدا">
        <div className="grid gap-4 text-xs leading-7 md:grid-cols-2">
          <div className="rounded-xl p-4 surface-2">
            <div className="mb-1 text-sm font-bold">پنل کارفرما — /tasks</div>
            برای مدیر سایت و نقش «کارفرما». داشبورد کارهای منتظر تأیید و سؤال‌های بی‌جواب، ثبت تسک، سپردن به برنامه‌نویس، تیم برنامه‌نویسان،
            کارکرد و ساعت‌ها و گزارش عملکرد. چند کارفرما با هم کار می‌کنند و هر کدام می‌تواند تأیید کند.
          </div>
          <div className="rounded-xl p-4 surface-2">
            <div className="mb-1 text-sm font-bold">پنل برنامه‌نویس — /dev</div>
            فقط برای نقش «برنامه‌نویس». میز کار شخصی با «کار بعدی»، کارهای برگشتی، تسک‌های آزاد، زمان‌سنج و کارکرد خودش. اطلاعات مالی، کاربران
            سایت و پنل کارفرما را نمی‌بیند.
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-6 muted">
          پیوند تسک‌ها در اعلان‌ها به شکل <code className="mono ltr rounded px-1 surface-2">/t/۱۲</code> است و هر نفر را به صفحه همان تسک در پنل خودش می‌برد.
        </p>
      </Card>

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
          <p className="mt-3 text-xs leading-7 muted">
            اولویت ترتیب اجرا را مشخص می‌کند. تسک «فوری» اگر دو ساعت پس از ثبت شروع نشود، هر شش ساعت یادآوری می‌شود.
          </p>
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

      <Card title="یادآوری و اعلان — چرا چیزی فراموش نمی‌شود">
        <ul className="list-inside list-disc space-y-2 text-xs leading-7">
          <li>
            <b>هر روز ساعت ۹ صبح</b> (به‌جز جمعه): هر برنامه‌نویس فهرست کارهای باز خودش را به ترتیب اهمیت می‌گیرد؛ هر کارفرما گزارش کارهای منتظر
            تأیید، منتظر پاسخ، عقب‌افتاده، بی‌حرکت و <b>کارکرد ۲۴ ساعت گذشته هر برنامه‌نویس</b> را.
          </li>
          <li>
            <b>کمتر از یک روز تا مهلت:</b> به مسئول یادآوری می‌شود. <b>مهلت گذشته:</b> هر روز به مسئول و کارفرماها.
          </li>
          <li>
            <b>«انجام شد» یا «نیاز به اطلاعات» بی‌جواب:</b> اگر بیش از ۲۴ ساعت بماند، هر روز به کارفرماها یادآوری می‌شود.
          </li>
          <li>
            <b>صدا زدن:</b> در گفتگوی تسک می‌توانید هر نفر را صدا بزنید؛ اعلان ویژه با ایمیل می‌گیرد و دنبال‌کننده تسک می‌شود.
          </li>
          <li>
            <b>دنبال کردن:</b> با دکمه «دنبال کردن» از همه تغییرات تسک باخبر می‌شوید — مثلاً کارفرمای دوم برای کاری که دیگری ثبت کرده.
          </li>
          <li>زمان‌سنجی که بیش از ۱۰ ساعت روشن بماند خودکار بسته می‌شود تا کارکرد اشتباه بالا نرود.</li>
        </ul>
        <p className="mt-3 rounded-lg p-3 text-xs leading-7 surface-2">
          برای اینکه اعلان‌ها روی گوشی هم برسد، حساب خود را از{' '}
          <Link href="/dashboard/notifications-settings" className="font-semibold text-[var(--color-brand-600)] hover:underline">
            تنظیمات اطلاع‌رسانی
          </Link>{' '}
          به ربات تلگرام وصل کنید و دسته «پشتیبانی و تیکت» را روشن نگه دارید.
        </p>
      </Card>

      {panel === 'employer' ? (
        <Card title="برای کارفرما">
          <ul className="list-inside list-disc space-y-1.5 text-xs leading-7">
            <li>روز را از «داشبورد کارفرما» شروع کنید: اول صف «منتظر تأیید» و «سؤال‌های بی‌جواب».</li>
            <li>عنوان کوتاه و دقیق بنویسید؛ برای باگ از دکمه «درج قالب گزارش باگ» استفاده کنید و اسکرین‌شات را با Ctrl+V بچسبانید.</li>
            <li>هنگام سپردن تسک، تعداد کار باز هر برنامه‌نویس کنار نامش آمده؛ صفحه «تیم برنامه‌نویسان» جزئیات بیشتری دارد.</li>
            <li>اگر می‌خواهید کارفرمای دیگر هم در جریان باشد، هنگام ثبت گزینه «در جریان قرار دادن» را بزنید.</li>
            <li>روی تخته کانبان، ترتیب کارت‌های ستون «در صف» را با کشیدن عوض کنید تا برنامه‌نویس بداند اول سراغ کدام برود.</li>
            <li>هنگام تأیید، امتیاز کیفیت بدهید؛ میانگین آن در صفحه تیم دیده می‌شود.</li>
          </ul>
          <p className="mt-3 text-xs leading-7 muted">
            <b>افزودن کارفرما یا برنامه‌نویس:</b> فرد در سایت ثبت‌نام می‌کند، سپس مدیر سایت از پنل مدیریت ← کاربران، نقش حسابش را «کارفرما» یا
            «برنامه‌نویس» می‌کند. نقش «کارفرما» فقط به پنل کارفرما دسترسی دارد و پنل مدیریت سایت را نمی‌بیند.
          </p>
        </Card>
      ) : (
        <Card title="برای برنامه‌نویس: روال روزانه">
          <ul className="list-inside list-disc space-y-1.5 text-xs leading-7">
            <li>روز را از «میز کار من» شروع کنید؛ «کار بعدی» مهم‌ترین کار شماست. کارهای برگشتی همیشه بالای صفحه می‌آیند.</li>
            <li>قبل از شروع هر کار «شروع کار» و «شروع زمان‌سنج» را بزنید؛ شروع زمان‌سنج روی تسک دیگر، قبلی را خودکار می‌بندد.</li>
            <li>اگر زمان‌سنج را فراموش کردید، از «ثبت دستی کارکرد» استفاده کنید.</li>
            <li>اگر سؤال دارید، کار را معطل نگذارید: «نیاز به اطلاعات» را بزنید یا در گفتگو کارفرما را صدا بزنید.</li>
            <li>مراحل چک‌لیست را همان موقع تیک بزنید تا پیشرفت دیده شود.</li>
            <li>هنگام «اعلام انجام شد» بنویسید چه تغییری دادید و چطور تست شود.</li>
            <li>اگر کار آزاد (بی‌مسئول) دیدید و وقت دارید، «برداشتن این تسک» را بزنید.</li>
          </ul>
        </Card>
      )}

      <Card title="نقش‌ها و دسترسی‌ها">
        <div className="scroll-x">
          <table className="table text-xs">
            <thead>
              <tr>
                <th>کار</th>
                <th>کارفرما</th>
                <th>برنامه‌نویس</th>
                <th>پشتیبان</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['ثبت تسک، نظر، پیوست و صدا زدن', '✅', '✅', '✅'],
                ['تعیین اولویت، ضرورت، مهلت و مسئول', '✅', '—', 'فقط هنگام ثبت'],
                ['شروع کار، اعلام انجام شد، نیاز به اطلاعات', '✅', '✅', '—'],
                ['زمان‌سنج و ثبت کارکرد', '✅', 'تسک‌های خودش', '—'],
                ['تأیید با امتیاز، برگرداندن، لغو، بازگشایی', '✅', '—', '—'],
                ['تیم و کارکرد همه برنامه‌نویس‌ها', '✅', 'کارکرد خودش', '—'],
                ['گزارش عملکرد', '✅', '—', '✅'],
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
      </Card>
    </div>
  );
}
