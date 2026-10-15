import type { Table } from './tables';

/**
 * فهمیدن محتوای خروجی سرچ کنسول.
 *
 * نام فایل‌ها و سرستون‌ها به زبان رابط سرچ کنسول بستگی دارد (Queries یا
 * «درخواست‌ها»، Clicks یا «کلیک‌ها»)، پس نوع هر جدول را از ترکیب سرستون و
 * خود داده تشخیص می‌دهیم: ستونی که نشانی دارد «صفحه‌ها» است، ستونی که
 * تاریخ دارد «روزها»، و بقیه از روی کلمه‌های سرستون.
 */

export type Metrics = { clicks: number; impressions: number; ctr: number; position: number };
export type MetricRow = Metrics & { key: string };

export type ParsedExport = {
  queries: MetricRow[];
  pages: MetricRow[];
  daily: MetricRow[];
  /** عددهای بازه قبل، اگر خروجی در حالت مقایسه گرفته شده باشد */
  previous: { queries: MetricRow[]; pages: MetricRow[]; daily: MetricRow[] } | null;
  rangeLabel: string | null;
  /** اگر خروجی روی یک صفحه فیلتر شده باشد، نشانی آن صفحه */
  pageFilter: string | null;
  /** چه جدول‌هایی شناخته شد، برای گزارش به مدیر */
  recognized: string[];
};

type Kind = 'queries' | 'pages' | 'daily' | 'filters' | 'skip';

const DIGITS: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

/** عدد از متن: رقم فارسی، جداکننده هزارگان و علامت درصد را می‌فهمد */
export function toNumber(raw: string): { value: number; percent: boolean } {
  const text = (raw ?? '').replace(/[۰-۹٠-٩]/g, (d) => DIGITS[d] ?? d).trim();
  const percent = /[%٪]/.test(text);
  const clean = text.replace(/[%٪\s‎‏]/g, '').replace(/[,٬]/g, '').replace(/٫/g, '.');
  const value = Number(clean);
  return { value: Number.isFinite(value) ? value : 0, percent };
}

type Columns = {
  key: number;
  clicks: number[];
  impressions: number[];
  ctr: number[];
  position: number[];
};

function metricOf(header: string): keyof Omit<Columns, 'key'> | null {
  const h = header.toLowerCase();
  if (/\bctr\b|نرخ/.test(h)) return 'ctr';
  if (/click|کلیک/.test(h)) return 'clicks';
  if (/impression|نمایش|نمایش‌ها|بازدید/.test(h)) return 'impressions';
  if (/position|موقعیت|جایگاه|رتبه/.test(h)) return 'position';
  return null;
}

function columnsOf(header: string[]): Columns | null {
  const cols: Columns = { key: -1, clicks: [], impressions: [], ctr: [], position: [] };
  header.forEach((h, i) => {
    const metric = metricOf(h);
    if (metric) cols[metric].push(i);
    else if (cols.key < 0) cols.key = i;
  });
  if (cols.key < 0 || (!cols.clicks.length && !cols.impressions.length)) return null;
  return cols;
}

const looksLikeUrl = (v: string) => /^(https?:\/\/|sc-domain:)/i.test(v.trim());
const looksLikeDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
const looksLikeSerial = (v: string) => /^\d{5}(\.0+)?$/.test(v.trim()) && Number(v) > 30000 && Number(v) < 80000;

/** شماره روز Excel → YYYY-MM-DD */
function serialToDate(v: string): string {
  const ms = Math.round((Number(v) - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

function kindOf(table: Table, header: string[], cols: Columns | null): Kind {
  const first = (header[0] ?? '').toLowerCase();
  const name = table.name.toLowerCase();
  if (/^filter|فیلتر/.test(first) || /filter|فیلتر/.test(name)) return 'filters';
  if (!cols) return 'skip';

  const sample = table.rows.slice(1, 21).map((r) => r[cols.key] ?? '').filter(Boolean);
  if (sample.length && sample.filter(looksLikeUrl).length / sample.length > 0.6) return 'pages';

  const keyHeader = (header[cols.key] ?? '').toLowerCase();
  const dateHeader = /date|تاریخ|روز/.test(keyHeader);
  if (sample.length && sample.every(looksLikeDate)) return 'daily';
  if (dateHeader && sample.length && sample.every(looksLikeSerial)) return 'daily';

  const hint = `${keyHeader} ${name}`;
  if (/countr|کشور|device|دستگاه|appearance|ظاهر|نمایش در جستجو/.test(hint)) return 'skip';
  if (/quer|پرسش|درخواست|پرسمان|پرس‌وجو|جستجو|جست‌وجو|عبارت|کوئری|کلیدواژه/.test(hint)) return 'queries';
  if (/page|صفحه/.test(hint)) return 'pages';
  return 'skip';
}

function readRows(table: Table, cols: Columns, kind: Kind, slot: 0 | 1): MetricRow[] {
  const pick = (row: string[], indexes: number[]) => {
    const i = indexes[slot];
    return i === undefined ? null : toNumber(row[i] ?? '');
  };

  const out: MetricRow[] = [];
  for (const row of table.rows.slice(1)) {
    let key = (row[cols.key] ?? '').trim();
    if (!key) continue;
    if (kind === 'daily' && looksLikeSerial(key)) key = serialToDate(key);

    const clicks = pick(row, cols.clicks);
    const impressions = pick(row, cols.impressions);
    if (!clicks && !impressions) continue;
    const ctr = pick(row, cols.ctr);
    const position = pick(row, cols.position);

    const c = clicks?.value ?? 0;
    const im = impressions?.value ?? 0;
    // نرخ کلیک در CSV با «٪» می‌آید و در Excel کسر است
    const ctrValue = ctr ? (ctr.percent || ctr.value > 1 ? ctr.value / 100 : ctr.value) : im ? c / im : 0;
    out.push({
      key,
      clicks: Math.round(c),
      impressions: Math.round(im),
      ctr: ctrValue,
      position: position?.value ?? 0,
    });
  }
  return out;
}

const LABELS: Record<Exclude<Kind, 'skip' | 'filters'>, string> = {
  queries: 'عبارت‌های جستجو',
  pages: 'صفحه‌ها',
  daily: 'آمار روزانه',
};

export function parseExport(tables: Table[]): ParsedExport {
  const result: ParsedExport = {
    queries: [],
    pages: [],
    daily: [],
    previous: null,
    rangeLabel: null,
    pageFilter: null,
    recognized: [],
  };
  const prev = { queries: [] as MetricRow[], pages: [] as MetricRow[], daily: [] as MetricRow[] };
  let compare = false;

  for (const table of tables) {
    const header = (table.rows[0] ?? []).map((h) => h.trim());
    if (!header.length) continue;
    const cols = columnsOf(header);
    const kind = kindOf(table, header, cols);

    if (kind === 'filters') {
      for (const [filter = '', value = ''] of table.rows.slice(1)) {
        const f = filter.toLowerCase();
        if (/date|تاریخ|بازه/.test(f) && value.trim()) result.rangeLabel = value.trim();
        if (/page|صفحه/.test(f)) {
          const url = /https?:\/\/[^\s"']+/.exec(value)?.[0];
          if (url) result.pageFilter = url;
        }
      }
      continue;
    }
    if (kind === 'skip' || !cols) continue;
    // هر جدول یک بار: اگر دو فایل یک نوع داشتند، اولی حساب می‌شود
    if (result[kind].length) continue;

    result[kind] = readRows(table, cols, kind, 0);
    if (cols.clicks.length > 1 || cols.impressions.length > 1) {
      compare = true;
      prev[kind] = readRows(table, cols, kind, 1);
    }
    if (result[kind].length) result.recognized.push(`${LABELS[kind]}: ${result[kind].length} ردیف`);
  }

  if (compare) result.previous = prev;
  result.daily.sort((a, b) => a.key.localeCompare(b.key));
  return result;
}

/** جمع چند ردیف؛ جایگاه وزنی با نمایش، مثل خود سرچ کنسول */
export function sumMetrics(rows: Metrics[]): Metrics {
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const weighted = rows.reduce((s, r) => s + r.position * r.impressions, 0);
  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: impressions ? weighted / impressions : 0,
  };
}

/**
 * عددهای کل: آمار روزانه دقیق‌ترین است؛ اگر نبود، جمع صفحه‌ها و در آخر جمع
 * عبارت‌ها (که به خاطر عبارت‌های ناشناس گوگل کمتر از واقع است).
 */
export function totalsOf(data: { daily: MetricRow[]; pages: MetricRow[]; queries: MetricRow[] }): Metrics {
  const fallback = sumMetrics(data.pages.length ? data.pages : data.queries);
  if (!data.daily.length) return fallback;
  const totals = sumMetrics(data.daily);
  // بعضی خروجی‌ها در جدول روزانه ستون جایگاه ندارند
  return totals.position ? totals : { ...totals, position: fallback.position };
}
