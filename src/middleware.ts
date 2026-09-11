import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

/**
 * میان‌افزار سبک: تصمیم می‌گیرد کاربر به صفحه محافظت‌شده برود یا به صفحه ورود.
 *
 * امضای توکن همین‌جا (روی Edge) بررسی می‌شود تا کوکی خراب یا منقضی، کاربر را
 * پشت درِ بسته گیر نیندازد. اعتبارسنجی نهایی نشست — که به دیتابیس نیاز دارد و
 * ابطال دستی نشست را هم می‌بیند — در لایه سرور (getCurrentUser) انجام می‌شود.
 */

const PROTECTED = ['/dashboard', '/admin'];
const AUTH_PAGES = ['/login', '/register'];

const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? '');

/**
 * مقدار کوکی نشست از دو بخش ساخته شده: یک JWT و پس از آخرین نقطه، توکن خام
 * نشست. اینجا فقط امضای JWT بررسی می‌شود؛ تطبیق توکن خام با دیتابیس کار لایه
 * سرور است.
 */
async function tokenIsValid(value: string): Promise<boolean> {
  if (!value || !process.env.SESSION_SECRET) return false;

  const idx = value.lastIndexOf('.');
  if (idx < 0) return false;
  const jwt = value.slice(0, idx);

  try {
    await jwtVerify(jwt, secret, { algorithms: ['HS256'] });
    return true;
  } catch {
    // امضای نادرست یا انقضای توکن
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  const cookieName = process.env.SESSION_COOKIE || 'pm_session';
  const raw = req.cookies.get(cookieName)?.value ?? '';

  const hasCookie = Boolean(raw);
  const hasSession = hasCookie && (await tokenIsValid(raw));

  // کوکی هست ولی توکن معتبر نیست: پاکش کن تا حلقه تغییر مسیر پیش نیاید
  const clearStaleCookie = (res: NextResponse) => {
    if (hasCookie && !hasSession) res.cookies.delete(cookieName);
    return res;
  };

  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(p + '/')) && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return clearStaleCookie(NextResponse.redirect(url));
  }

  if (AUTH_PAGES.includes(pathname)) {
    // اگر خودِ سرور کاربر را به اینجا فرستاده (پارامتر next)، یعنی نشست در دیتابیس
    // باطل شده است؛ در این حالت نباید دوباره به داشبورد برگردد وگرنه حلقه می‌شود.
    const bouncedFromServer = searchParams.has('next');
    if (hasSession && !bouncedFromServer) {
      const url = req.nextUrl.clone();
      url.pathname = '/dashboard';
      url.search = '';
      return NextResponse.redirect(url);
    }
    return clearStaleCookie(NextResponse.next());
  }

  return clearStaleCookie(NextResponse.next());
}

export const config = {
  matcher: [
    /*
     * همه مسیرها به جز:
     *  - api (خودشان احراز هویت می‌کنند)
     *  - فایل‌های استاتیک Next
     *  - فایل‌های عمومی
     */
    '/((?!api|_next/static|_next/image|favicon.svg|fonts|uploads|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?)$).*)',
  ],
};
