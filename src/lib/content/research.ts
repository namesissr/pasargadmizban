import { env } from '../env';
import { googleSuggest } from './keywords';

/**
 * تحقیق موضوع، پیش از نوشتن.
 *
 * دو تصمیم مهم اینجا گرفته شده:
 *
 * ۱) متن صفحه‌های رقیب خوانده و کپی نمی‌شود. فقط عنوان، نشانی و خلاصه کوتاهی
 *    که خود گوگل نشان می‌دهد (و سرویس دارای مجوز به ما می‌دهد) برداشته
 *    می‌شود، در حد فهمیدن «کاربر دنبال چه چیزی است». بازنشر مقاله دیگران،
 *    هم نقض حق نشر است و هم بر اساس سیاست‌های اسپم گوگل باعث جریمه می‌شود.
 *
 * ۲) اگر کلید سرویس نتایج گوگل تنظیم نشده باشد، سیستم خاموش نمی‌شود: تحقیق
 *    با پیشنهادهای جستجوی گوگل انجام می‌شود که پرسش‌های واقعی کاربران را
 *    نشان می‌دهد.
 */

export type SourceResult = { title: string; url: string; snippet: string };

export type ResearchBrief = {
  keyword: string;
  /** پرسش‌هایی که کاربران واقعاً جستجو می‌کنند */
  questions: string[];
  /** عبارت‌های نزدیک، برای پوشش موضوعی کامل‌تر */
  relatedTerms: string[];
  /** نتایج بالای گوگل — فقط عنوان و خلاصه، برای شناخت نیت جستجو */
  sources: SourceResult[];
  /** آیا نتایج گوگل در دسترس بود یا تحقیق فقط با پیشنهادها انجام شد */
  usedSerp: boolean;
};

async function serperSearch(keyword: string): Promise<{ results: SourceResult[]; questions: string[]; related: string[] }> {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'x-api-key': env.content.serpKey, 'content-type': 'application/json' },
    body: JSON.stringify({ q: keyword, gl: 'ir', hl: 'fa', num: 10 }),
  });
  if (!res.ok) throw new Error(`serper: ${res.status}`);

  const data = (await res.json()) as {
    organic?: { title?: string; link?: string; snippet?: string }[];
    peopleAlsoAsk?: { question?: string }[];
    relatedSearches?: { query?: string }[];
  };

  return {
    results: (data.organic ?? [])
      .slice(0, 10)
      .map((r) => ({ title: r.title ?? '', url: r.link ?? '', snippet: r.snippet ?? '' }))
      .filter((r) => r.title && r.url),
    questions: (data.peopleAlsoAsk ?? []).map((q) => q.question ?? '').filter(Boolean),
    related: (data.relatedSearches ?? []).map((r) => r.query ?? '').filter(Boolean),
  };
}

async function serpapiSearch(keyword: string): Promise<{ results: SourceResult[]; questions: string[]; related: string[] }> {
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('q', keyword);
  url.searchParams.set('hl', 'fa');
  url.searchParams.set('gl', 'ir');
  url.searchParams.set('num', '10');
  url.searchParams.set('api_key', env.content.serpKey);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`serpapi: ${res.status}`);

  const data = (await res.json()) as {
    organic_results?: { title?: string; link?: string; snippet?: string }[];
    related_questions?: { question?: string }[];
    related_searches?: { query?: string }[];
  };

  return {
    results: (data.organic_results ?? [])
      .slice(0, 10)
      .map((r) => ({ title: r.title ?? '', url: r.link ?? '', snippet: r.snippet ?? '' }))
      .filter((r) => r.title && r.url),
    questions: (data.related_questions ?? []).map((q) => q.question ?? '').filter(Boolean),
    related: (data.related_searches ?? []).map((r) => r.query ?? '').filter(Boolean),
  };
}

/** خلاصه تحقیق برای یک عبارت کلیدی */
export async function researchKeyword(keyword: string): Promise<ResearchBrief> {
  let sources: SourceResult[] = [];
  let questions: string[] = [];
  let relatedTerms: string[] = [];
  let usedSerp = false;

  const provider = env.content.serpProvider;
  if (env.content.serpKey && (provider === 'serper' || provider === 'serpapi')) {
    try {
      const data = provider === 'serper' ? await serperSearch(keyword) : await serpapiSearch(keyword);
      sources = data.results;
      questions = data.questions;
      relatedTerms = data.related;
      usedSerp = true;
    } catch {
      // سرویس در دسترس نبود؛ به مسیر رایگان برمی‌گردیم
      usedSerp = false;
    }
  }

  // پیشنهادهای جستجو، هم جایگزین رایگان‌اند و هم مکمل خوبی برای نتایج گوگل
  if (questions.length < 4 || relatedTerms.length < 4) {
    // هسته عبارت (بدون واژه‌های پرسشی) پیشنهادهای بیشتری می‌گیرد؛
    // «آموزش لینوکس چیست» تقریباً پیشنهادی ندارد، ولی «آموزش لینوکس» دارد
    const core = keyword
      .replace(/\s*(چیست|چیه|چگونه|چطور|چرا|آیا|کدام)\s*\??$/u, '')
      .replace(/^\s*(چگونه|چطور|چرا|آیا|کدام)\s+/u, '')
      .trim();

    const [plain, what, how, fromCore] = await Promise.all([
      googleSuggest(keyword),
      googleSuggest(`${core} چیست`),
      googleSuggest(`چگونه ${core}`),
      core && core !== keyword ? googleSuggest(core) : Promise.resolve([]),
    ]);
    const fromSuggest = [...plain, ...fromCore, ...what, ...how].map((s) => s.trim()).filter(Boolean);

    for (const item of fromSuggest) {
      const isQuestion = /چیست|چگونه|چطور|چرا|آیا|کدام/.test(item);
      if (isQuestion && questions.length < 10 && !questions.includes(item)) questions.push(item);
      else if (!isQuestion && relatedTerms.length < 12 && !relatedTerms.includes(item)) relatedTerms.push(item);
    }
  }

  return {
    keyword,
    questions: questions.slice(0, 10),
    relatedTerms: relatedTerms.slice(0, 12),
    sources: sources.slice(0, 8),
    usedSerp,
  };
}
