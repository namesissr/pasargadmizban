import { ok, route } from '@/lib/api';
import { requireUser } from '@/lib/auth';
import { templateList, CATEGORY_LABEL } from '@/lib/app-templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** فهرست قالب‌های نصب یک‌کلیکه برای صفحه ساخت سرور */
export const GET = route(async () => {
  await requireUser();
  return ok({
    templates: templateList(),
    categories: CATEGORY_LABEL,
  });
});
