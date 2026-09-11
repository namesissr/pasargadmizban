import Link from 'next/link';
import { Server, ShieldCheck, Zap, Headphones } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* ستون تبلیغاتی */}
      <div className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12"
        style={{ background: 'linear-gradient(160deg, var(--color-brand-800), var(--color-brand-950))' }}>
        <div
          className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full opacity-25 blur-3xl"
          style={{ background: 'var(--color-brand-400)' }}
        />
        <div
          className="pointer-events-none absolute -bottom-32 -right-16 h-96 w-96 rounded-full opacity-20 blur-3xl"
          style={{ background: 'var(--color-brand-300)' }}
        />

        <Link href="/" className="relative flex items-center gap-3 text-white">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15">
            <Server size={21} />
          </span>
          <span>
            <span className="block text-lg font-extrabold">پاسارگاد میزبان</span>
            <span className="block text-xs opacity-75">سرور ابری با پرداخت ریالی</span>
          </span>
        </Link>

        <div className="relative text-white">
          <h2 className="text-2xl font-extrabold leading-relaxed">
            سرور ابری اروپا و آمریکا،
            <br />
            تحویل خودکار در کمتر از یک دقیقه
          </h2>
          <ul className="mt-8 space-y-4 text-sm">
            <li className="flex items-start gap-3">
              <Zap size={18} className="mt-0.5 shrink-0 opacity-80" />
              <span className="opacity-90 leading-7">
                پرداخت ساعتی یا ماهانه به تومان. فقط برای مدتی که سرور روشن است هزینه بدهید.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 opacity-80" />
              <span className="opacity-90 leading-7">
                کنترل کامل سرور: روشن و خاموش، نصب مجدد، اسنپ‌شات، فایروال و کنسول تحت وب.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Headphones size={18} className="mt-0.5 shrink-0 opacity-80" />
              <span className="opacity-90 leading-7">
                پشتیبانی فارسی از طریق تیکت، با پیگیری وضعیت لحظه‌ای.
              </span>
            </li>
          </ul>
        </div>

        <div className="relative text-xs text-white/55">
          © پاسارگاد میزبان — تمامی حقوق محفوظ است.
        </div>
      </div>

      {/* ستون فرم */}
      <div className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-8 flex items-center justify-center gap-2 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--color-brand-600)] text-white">
              <Server size={18} />
            </span>
            <span className="text-base font-extrabold">پاسارگاد میزبان</span>
          </Link>
          {children}
        </div>
      </div>
    </div>
  );
}
