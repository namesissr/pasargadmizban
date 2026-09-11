import Link from 'next/link';
import { FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <FileQuestion size={56} className="mx-auto muted opacity-50" />
        <h1 className="mt-5 text-lg font-extrabold">صفحه مورد نظر پیدا نشد</h1>
        <p className="mt-2 text-xs leading-7 muted">
          ممکن است آدرس اشتباه وارد شده باشد یا این مورد حذف شده باشد.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/dashboard" className="btn btn-primary">
            بازگشت به داشبورد
          </Link>
          <Link href="/dashboard/tickets/new" className="btn btn-secondary">
            تماس با پشتیبانی
          </Link>
        </div>
      </div>
    </div>
  );
}
