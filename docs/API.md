# مرجع API پنل

تمام مسیرها زیر `/api` قرار دارند و با کوکی نشست احراز هویت می‌شوند.

## قالب پاسخ

موفق:

```json
{ "ok": true, "data": { } }
```

ناموفق:

```json
{
  "ok": false,
  "error": {
    "message": "پیام فارسی قابل نمایش به کاربر",
    "code": "insufficient_funds",
    "fields": { "amount": "مبلغ کمتر از حد مجاز است." }
  }
}
```

## کدهای وضعیت

| کد | معنی |
|---|---|
| ۲۰۰ / ۲۰۱ | موفق |
| ۴۰۰ | ورودی نامعتبر یا عملیات غیرمجاز در وضعیت فعلی |
| ۴۰۱ | وارد نشده‌اید |
| ۴۰۲ | موجودی کیف پول کافی نیست |
| ۴۰۳ | دسترسی ندارید |
| ۴۰۴ | یافت نشد |
| ۴۰۹ | تضاد (نام تکراری، سرور در حال عملیات دیگر، ظرفیت ناموجود) |
| ۴۲۲ | خطای اعتبارسنجی — جزئیات در `error.fields` |
| ۴۲۹ | محدودیت نرخ — هدر `Retry-After` را ببینید |
| ۵۰۲ | خطای سرویس بیرونی (هتزنر یا درگاه) |

---

## احراز هویت

| متد | مسیر | توضیح |
|---|---|---|
| POST | `/auth/register` | ثبت‌نام. اولین کاربر مدیر می‌شود. |
| POST | `/auth/login` | ورود |
| POST | `/auth/logout` | خروج |
| POST | `/auth/forgot-password` | ارسال لینک بازیابی |
| POST | `/auth/reset-password` | ثبت رمز جدید با توکن |
| POST | `/auth/verify-email` | تایید ایمیل با توکن |
| POST | `/auth/resend-verification` | ارسال مجدد ایمیل تایید |

---

## حساب کاربری

| متد | مسیر | توضیح |
|---|---|---|
| GET | `/profile` | اطلاعات کامل حساب |
| PATCH | `/profile` | ویرایش اطلاعات |
| POST | `/profile/password` | تغییر رمز عبور |
| GET | `/me/balance` | موجودی، نرخ مصرف و اعتبار باقی‌مانده |
| GET | `/me/sessions` | نشست‌های فعال |
| DELETE | `/me/sessions` | خروج از همه دستگاه‌ها |
| GET | `/notifications` | اعلان‌ها |
| POST | `/notifications/read` | علامت‌گذاری خوانده‌شده |

---

## کاتالوگ و قیمت

| متد | مسیر | توضیح |
|---|---|---|
| GET | `/catalog` | پلن‌ها، لوکیشن‌ها و سیستم‌عامل‌ها با قیمت تومانی |
| GET | `/quote` | پیش‌فاکتور یک ترکیب مشخص |

پارامترهای `/quote`:

```
?serverType=cx22&location=fsn1&billingCycle=HOURLY&months=1&backups=false
```

---

## سرورها

| متد | مسیر | توضیح |
|---|---|---|
| GET | `/servers` | لیست سرورها (`page`, `status`, `q`) |
| POST | `/servers` | ساخت سرور جدید |
| GET | `/servers/{id}` | جزئیات (`?sync=1` برای همگام‌سازی زنده) |
| PATCH | `/servers/{id}` | تغییر نام و برچسب |
| DELETE | `/servers/{id}` | حذف (نیازمند `confirmName`) |
| GET/POST | `/servers/{id}/actions` | تاریخچه / اجرای عملیات |
| GET | `/servers/{id}/metrics` | نمودار مصرف |
| POST | `/servers/{id}/console` | لینک کنسول تحت وب |
| POST | `/servers/{id}/rebuild` | نصب مجدد سیستم‌عامل |
| GET/POST | `/servers/{id}/resize` | پلن‌های قابل ارتقا / اجرای ارتقا |
| POST | `/servers/{id}/renew` | تمدید دستی |
| PATCH | `/servers/{id}/renew` | فعال/غیرفعال کردن تمدید خودکار |
| GET/POST/DELETE | `/servers/{id}/snapshots` | مدیریت اسنپ‌شات |
| GET/POST/DELETE | `/servers/{id}/firewall` | مدیریت فایروال |
| GET/POST | `/servers/{id}/rdns` | رکورد معکوس |
| POST | `/servers/{id}/password` | نمایش رمز روت ذخیره‌شده |
| GET | `/servers/{id}/change-ip` | هزینه، سهمیه ماهانه، شرایط و تاریخچه تعویض آدرس |
| POST | `/servers/{id}/change-ip` | اجرای تعویض آدرس IPv4 (نیازمند `confirm: true`) |

عملیات مجاز در `POST /servers/{id}/actions`:

```
poweron · poweroff · shutdown · reboot · reset
reset_password · enable_rescue · disable_rescue
enable_backup · disable_backup · detach_iso
```

نمونه ساخت سرور:

```json
POST /api/servers
{
  "name": "web-01",
  "label": "سرور سایت",
  "serverType": "cx22",
  "location": "fsn1",
  "image": "ubuntu-24.04",
  "billingCycle": "HOURLY",
  "months": 1,
  "sshKeyIds": ["ckxyz..."],
  "enableBackups": false,
  "enableIpv4": true
}
```

نمونه تعویض آدرس:

```json
POST /api/servers/{id}/change-ip
{
  "confirm": true,
  "reason": "آدرس از داخل ایران باز نمی‌شود"
}
```

پاسخ موفق شامل `oldIp`، `newIp`، `fee` و `downtimeSeconds` است. در صورت شکست هر مرحله،
آدرس قبلی برگردانده می‌شود و مبلغ کامل به کیف پول باز می‌گردد.

پاسخ `GET` علاوه بر هزینه و سهمیه، این‌ها را هم می‌دهد:

| فیلد | معنی |
|---|---|
| `reachState` | نتیجه بررسی دسترسی از ایران: `OK`، `BLOCKED`، `INCONCLUSIVE`، `UNKNOWN` |
| `reachCheckedAt` | زمان آخرین بررسی |
| `free` و `freeUntil` | آیا هنوز در پنجره تعویض رایگان پس از ساخت هستیم |
| `normalFee` | هزینه عادی، برای وقتی که پنجره رایگان تمام شود |
| `autoSwaps` | چند بار پنل خودش آدرس این سرور را رایگان عوض کرده است |

---

## مالی

| متد | مسیر | توضیح |
|---|---|---|
| POST | `/wallet/topup` | شروع شارژ؛ پاسخ شامل `redirectUrl` |
| GET/POST | `/wallet/callback` | بازگشت از درگاه (توسط زیبال فراخوانی می‌شود) |
| GET/POST | `/wallet/manual` | رسیدهای واریز دستی |
| GET | `/transactions` | گردش حساب |
| GET | `/invoices` | فهرست فاکتورها |
| GET | `/invoices/{id}` | جزئیات فاکتور |
| POST | `/invoices/{id}` | پرداخت فاکتور از کیف پول |

---

## پشتیبانی و کلیدها

| متد | مسیر | توضیح |
|---|---|---|
| GET/POST | `/tickets` | لیست / ایجاد تیکت |
| GET | `/tickets/{id}` | مشاهده گفتگو |
| DELETE | `/tickets/{id}` | بستن تیکت |
| POST | `/tickets/{id}/reply` | پاسخ |
| GET/POST | `/ssh-keys` | لیست / افزودن کلید |
| POST | `/wallet/redeem` | استفاده از کد هدیه |
| PUT | `/wallet/redeem` | پیش‌بررسی یک کد |
| GET | `/me/loyalty` | وضعیت باشگاه مشتریان کاربر |
| DELETE | `/ssh-keys/{id}` | حذف کلید |

---

## مدیریت (فقط ADMIN و SUPPORT)

| متد | مسیر | توضیح |
|---|---|---|
| GET | `/admin/stats` | آمار داشبورد |
| GET | `/admin/users` | فهرست کاربران |
| GET/PATCH/DELETE | `/admin/users/{id}` | مدیریت کاربر |
| POST | `/admin/users/{id}/balance` | تعدیل موجودی (فقط ADMIN) |
| POST | `/admin/users/{id}/impersonate` | ورود به حساب کاربر (فقط ADMIN) |
| GET | `/admin/servers` | همه سرورها |
| GET/POST | `/admin/servers/{id}` | جزئیات / تعلیق، رفع تعلیق، حذف، همگام‌سازی |
| GET | `/admin/transactions` | همه تراکنش‌ها |
| POST | `/admin/transactions/{id}` | تایید، رد یا استعلام مجدد |
| GET | `/admin/tickets` | همه تیکت‌ها |
| PATCH | `/admin/tickets/{id}` | تغییر وضعیت و اولویت |
| GET/PATCH | `/admin/catalog` | کاتالوگ / فعال و غیرفعال کردن |
| POST | `/admin/catalog/sync` | همگام‌سازی با هتزنر |
| GET/POST/DELETE | `/admin/pricing` | قوانین قیمت‌گذاری |
| GET/PATCH | `/admin/settings` | تنظیمات سراسری |
| GET | `/admin/hetzner` | فهرست حساب‌های هتزنر با ظرفیت و وضعیت |
| POST | `/admin/hetzner` | افزودن حساب تازه (فقط ADMIN) |
| PUT | `/admin/hetzner` | آزمایش یک توکن پیش از ثبت (فقط ADMIN) |
| GET | `/admin/hetzner/{id}` | جزئیات حساب و سرورهای روی آن |
| PATCH | `/admin/hetzner/{id}` | ویرایش نام، توکن، سقف، اولویت و فعال بودن (فقط ADMIN) |
| POST | `/admin/hetzner/{id}` | خواندن دوباره ظرفیت و سلامت از هتزنر |
| DELETE | `/admin/hetzner/{id}` | حذف حساب (فقط ADMIN) |
| GET | `/admin/ip-health` | وضعیت سرویس آزمایش، بلوک‌های سوخته و نرخ هر لوکیشن |
| POST | `/admin/ip-health` | آزمایش دستی یک آدرس از داخل ایران (فقط ADMIN) |
| PATCH | `/admin/ip-health` | سوخته یا سالم اعلام کردن دستی یک بلوک /24 (فقط ADMIN) |
| PUT | `/admin/ip-health` | اجرای دستی یک دور بررسی سرورهای تازه (فقط ADMIN) |
| GET/POST | `/admin/promos` | فهرست / ساخت کد هدیه و تخفیف |
| PATCH/DELETE | `/admin/promos/{id}` | ویرایش، غیرفعال یا حذف کد (فقط ADMIN) |
| GET | `/admin/eur-rate` | تاریخچه دریافت‌های نرخ یورو |
| POST | `/admin/eur-rate` | آزمایش دریافت (`action: "test"`) یا اعمال فوری (`action: "apply"`) — فقط ADMIN |
| GET | `/admin/ip-cleanup` | فهرست آدرس‌های بلااستفاده در همه حساب‌ها |
| POST | `/admin/ip-cleanup` | حذف فوری همه آدرس‌های بلااستفاده (فقط ADMIN) |
| GET | `/admin/announcements` | فهرست اعلان‌های سایت |
| POST | `/admin/announcements` | ساخت اعلان (فقط ADMIN) |
| PATCH/DELETE | `/admin/announcements/{id}` | ویرایش یا حذف اعلان (فقط ADMIN) |
| GET | `/admin/logs` | دفتر ممیزی |

---

## کارهای زمان‌بندی‌شده

```
GET /api/cron?job=<نام-کار>
Authorization: Bearer <CRON_SECRET>
```

بدون پارامتر `job`، فهرست کارهای موجود برگردانده می‌شود. مدیر واردشده نیز بدون توکن می‌تواند آن را اجرا کند.

---

## محدودیت نرخ

| عملیات | سقف |
|---|---|
| ورود | ۸ در ۵ دقیقه به ازای هر ایمیل |
| ثبت‌نام | ۵ در ساعت به ازای هر IP |
| بازیابی رمز | ۵ در ساعت |
| ساخت سرور | ۱۰ در ۱۰ دقیقه |
| عملیات سرور | ۶۰ در دقیقه |
| شارژ کیف پول | ۱۵ در ۱۰ دقیقه |
| ثبت تیکت | ۱۰ در ۱۰ دقیقه |

هنگام عبور از سقف، پاسخ ۴۲۹ با هدر `Retry-After` (ثانیه) برگردانده می‌شود.
