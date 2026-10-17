/**
 * ثابت‌ها و قواعد مشترک میز کار تسک‌ها.
 *
 * این فایل هیچ وابستگی سمت سروری ندارد تا هم API و هم صفحات مرورگر از همین
 * یک منبع برای برچسب‌ها، رنگ‌ها و قواعد گذار وضعیت استفاده کنند.
 */

export type Tone = 'ok' | 'warn' | 'bad' | 'muted';

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'DONE', 'CANCELED'] as const;
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const TASK_NECESSITIES = ['OPTIONAL', 'NEEDED', 'ESSENTIAL', 'CRITICAL'] as const;
export const TASK_TYPES = ['BUG', 'FEATURE', 'IMPROVEMENT', 'TASK'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type TaskNecessity = (typeof TASK_NECESSITIES)[number];
export type TaskType = (typeof TASK_TYPES)[number];

/** وضعیت‌هایی که هنوز کاری روی آن‌ها مانده است */
export const OPEN_STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'REVIEW'];

export const TASK_STATUS_FA: Record<TaskStatus, { label: string; tone: Tone; hint: string }> = {
  TODO: { label: 'در صف انجام', tone: 'muted', hint: 'ثبت شده و منتظر شروع' },
  IN_PROGRESS: { label: 'در حال انجام', tone: 'warn', hint: 'برنامه‌نویس روی آن کار می‌کند' },
  BLOCKED: { label: 'نیاز به اطلاعات', tone: 'bad', hint: 'متوقف — منتظر پاسخ یا تصمیم مدیر' },
  REVIEW: { label: 'انجام شد — منتظر تأیید', tone: 'warn', hint: 'برنامه‌نویس اعلام کرده انجام شد' },
  DONE: { label: 'تأیید و بسته شد', tone: 'ok', hint: 'مدیر نتیجه را تأیید کرد' },
  CANCELED: { label: 'لغو شده', tone: 'muted', hint: 'دیگر لازم نیست' },
};

/** رنگ نوار بالای ستون‌ها و نقطه وضعیت */
export const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  TODO: '#64748b',
  IN_PROGRESS: '#0ea5e9',
  BLOCKED: '#ef4444',
  REVIEW: '#f59e0b',
  DONE: '#10b981',
  CANCELED: '#94a3b8',
};

export const TASK_PRIORITY_FA: Record<TaskPriority, { label: string; tone: Tone; color: string }> = {
  LOW: { label: 'کم', tone: 'muted', color: '#94a3b8' },
  MEDIUM: { label: 'متوسط', tone: 'ok', color: '#0ea5e9' },
  HIGH: { label: 'زیاد', tone: 'warn', color: '#f59e0b' },
  URGENT: { label: 'فوری', tone: 'bad', color: '#ef4444' },
};

export const TASK_NECESSITY_FA: Record<TaskNecessity, { label: string; tone: Tone; hint: string }> = {
  OPTIONAL: { label: 'اختیاری', tone: 'muted', hint: 'اگر وقت شد؛ پیشنهاد یا بهبود جزئی' },
  NEEDED: { label: 'لازم', tone: 'ok', hint: 'باید انجام شود ولی کار را متوقف نکرده' },
  ESSENTIAL: { label: 'ضروری', tone: 'warn', hint: 'روی کار مشتری یا فروش اثر مستقیم دارد' },
  CRITICAL: { label: 'حیاتی', tone: 'bad', hint: 'سایت یا پرداخت مختل است؛ مقدم بر همه کارها' },
};

export const TASK_TYPE_FA: Record<TaskType, { label: string; emoji: string }> = {
  BUG: { label: 'باگ', emoji: '🐞' },
  FEATURE: { label: 'قابلیت جدید', emoji: '✨' },
  IMPROVEMENT: { label: 'بهبود', emoji: '🛠️' },
  TASK: { label: 'کار عمومی', emoji: '📌' },
};

/** بخش‌های پیشنهادی سایت؛ کاربر می‌تواند بخش دلخواه هم بنویسد */
export const DEFAULT_AREAS = [
  'صفحه اصلی سایت',
  'ورود و ثبت‌نام',
  'داشبورد کاربر',
  'ساخت سرور',
  'مدیریت سرور',
  'کیف پول و پرداخت',
  'فاکتور و تراکنش',
  'تیکت و پشتیبانی',
  'پنل مدیریت',
  'ربات تلگرام',
  'ایمیل و پیامک',
  'ورکر و کارهای زمان‌بندی‌شده',
  'نسخه موبایل',
  'سرور و زیرساخت',
];

/** قالب پیشنهادی گزارش باگ تا برنامه‌نویس همه اطلاعات لازم را یک‌جا داشته باشد */
export const BUG_TEMPLATE = `مراحل ایجاد مشکل:
۱.
۲.
۳.

نتیجه مورد انتظار:


نتیجه فعلی (چه اتفاقی می‌افتد):


اطلاعات تکمیلی (مرورگر، گوشی/کامپیوتر، حساب کاربری تست):
`;

export type TaskRole = 'ADMIN' | 'SUPPORT' | 'DEVELOPER';

export function isTaskRole(role: string | null | undefined): role is TaskRole {
  return role === 'ADMIN' || role === 'SUPPORT' || role === 'DEVELOPER';
}

/** فقط مدیر سیستم می‌تواند اولویت، مهلت و مسئول را تعیین کند و کار را تأیید کند */
export function isTaskManager(role: string | null | undefined): boolean {
  return role === 'ADMIN';
}

/**
 * گذارهای مجاز وضعیت برای برنامه‌نویس.
 * مدیر محدودیتی ندارد؛ پشتیبان فقط گزارش می‌دهد و وضعیت را عوض نمی‌کند.
 */
const DEVELOPER_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  TODO: ['IN_PROGRESS', 'BLOCKED', 'REVIEW'],
  IN_PROGRESS: ['REVIEW', 'BLOCKED', 'TODO'],
  BLOCKED: ['IN_PROGRESS', 'TODO'],
  REVIEW: ['IN_PROGRESS'],
  DONE: [],
  CANCELED: [],
};

export function allowedTransitions(role: string | null | undefined, from: TaskStatus): TaskStatus[] {
  if (isTaskManager(role)) return TASK_STATUSES.filter((s) => s !== from);
  if (role === 'DEVELOPER') return DEVELOPER_TRANSITIONS[from];
  return [];
}

/**
 * گذارهایی که بدون توضیح معنا ندارند: توقف کار (چه اطلاعاتی لازم است؟)
 * و برگرداندن کار انجام‌شده (چه چیزی درست نیست؟).
 */
export function transitionNeedsComment(from: TaskStatus, to: TaskStatus): boolean {
  if (to === 'BLOCKED') return true;
  if ((from === 'REVIEW' || from === 'DONE') && (to === 'TODO' || to === 'IN_PROGRESS')) return true;
  return false;
}

/** عنوان دکمه هر گذار — از دید کسی که آن را می‌زند */
export function transitionLabel(from: TaskStatus, to: TaskStatus): string {
  if (to === 'IN_PROGRESS' && from === 'TODO') return 'شروع کار';
  if (to === 'IN_PROGRESS' && from === 'BLOCKED') return 'ادامه کار';
  if (to === 'IN_PROGRESS' && from === 'REVIEW') return 'برگرداندن برای اصلاح';
  if (to === 'IN_PROGRESS') return 'بازگشت به در حال انجام';
  if (to === 'REVIEW') return 'اعلام انجام شد';
  if (to === 'BLOCKED') return 'نیاز به اطلاعات / توقف';
  if (to === 'DONE') return from === 'REVIEW' ? 'تأیید و بستن' : 'بستن به‌عنوان انجام‌شده';
  if (to === 'CANCELED') return 'لغو تسک';
  if (to === 'TODO' && (from === 'DONE' || from === 'CANCELED')) return 'بازگشایی دوباره';
  return 'بازگشت به صف';
}

const PRIORITY_WEIGHT: Record<TaskPriority, number> = { LOW: 0, MEDIUM: 10, HIGH: 25, URGENT: 45 };
const NECESSITY_WEIGHT: Record<TaskNecessity, number> = { OPTIONAL: 0, NEEDED: 8, ESSENTIAL: 20, CRITICAL: 40 };

/**
 * امتیاز ترتیب هوشمند: اولویت و ضرورت با هم، به‌علاوه نزدیکی مهلت.
 * عدد بزرگ‌تر یعنی باید زودتر سراغش رفت.
 */
export function urgencyScore(task: {
  priority: string;
  necessity: string;
  dueAt?: string | Date | null;
}): number {
  let score =
    (PRIORITY_WEIGHT[task.priority as TaskPriority] ?? 0) + (NECESSITY_WEIGHT[task.necessity as TaskNecessity] ?? 0);
  if (task.dueAt) {
    const hoursLeft = (new Date(task.dueAt).getTime() - Date.now()) / 3_600_000;
    if (hoursLeft < 0) score += 40;
    else if (hoursLeft < 24) score += 25;
    else if (hoursLeft < 72) score += 12;
    else if (hoursLeft < 168) score += 5;
  }
  return score;
}

export function isOverdue(task: { status: string; dueAt?: string | Date | null }): boolean {
  if (!task.dueAt) return false;
  if (!OPEN_STATUSES.includes(task.status as TaskStatus)) return false;
  return new Date(task.dueAt).getTime() < Date.now();
}

/** پیوست‌های مجاز — تصویر برای اسکرین‌شات، و چند قالب متنی و فشرده برای لاگ و فایل نمونه */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_MAX_PER_TASK = 30;
export const ATTACHMENT_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/json': 'json',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

export function isImageMime(mime: string): boolean {
  return mime.startsWith('image/');
}
