import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { z } from 'zod';
import { env } from '../env';
import { ApiError } from '../errors';
import type { ResearchBrief } from './research';

/**
 * نویسنده مقاله.
 *
 * مدل، مقاله را از صفر و با زبان خودش می‌نویسد؛ خلاصه تحقیق فقط می‌گوید
 * «کاربر دنبال چه چیزی است و چه پرسش‌هایی دارد». عمداً هیچ متنی از منابع به
 * مدل داده نمی‌شود جز خلاصه کوتاه نتایج گوگل، و در پرامپت صریح آمده که کپی
 * ممنوع است. خروجی، JSON با ساختار ثابت است تا بشود بی‌واسطه ذخیره‌اش کرد.
 */

export type InternalLink = { path: string; title: string };

export type GeneratedArticle = z.infer<typeof articleSchema>;

export const articleSchema = z.object({
  title: z.string().trim().min(10).max(120),
  slug: z.string().trim().min(3).max(120),
  excerpt: z.string().trim().min(40).max(300),
  metaTitle: z.string().trim().min(10).max(70),
  metaDescription: z.string().trim().min(60).max(180),
  content: z.string().min(1000),
  tags: z.array(z.string().trim().min(2).max(40)).min(2).max(6),
  faqs: z
    .array(z.object({ q: z.string().trim().min(8).max(200), a: z.string().trim().min(20).max(900) }))
    .min(2)
    .max(5),
  coverAlt: z.string().trim().min(5).max(160),
  categorySlug: z.string().trim().max(80).optional(),
});

/** همین ساختار را به مدل هم می‌دهیم تا خروجی دقیقاً قابل اعتماد باشد */
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title',
    'slug',
    'excerpt',
    'metaTitle',
    'metaDescription',
    'content',
    'tags',
    'faqs',
    'coverAlt',
    'categorySlug',
  ],
  properties: {
    title: { type: 'string', description: 'عنوان مقاله، شامل کلیدواژه هدف، حداکثر ۷۰ نویسه' },
    slug: { type: 'string', description: 'نشانی انگلیسی یا فارسی کوتاه با خط تیره، ۳ تا ۵ کلمه' },
    excerpt: { type: 'string', description: 'خلاصه یک تا دو جمله‌ای' },
    metaTitle: { type: 'string', description: 'عنوان سئو، بین ۳۰ تا ۶۰ نویسه' },
    metaDescription: { type: 'string', description: 'توضیحات متا، بین ۱۲۰ تا ۱۶۰ نویسه، شامل کلیدواژه' },
    content: { type: 'string', description: 'متن کامل مقاله به مارک‌داون' },
    tags: { type: 'array', items: { type: 'string' }, description: 'دو تا پنج برچسب فارسی' },
    faqs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['q', 'a'],
        properties: { q: { type: 'string' }, a: { type: 'string' } },
      },
      description: 'دو تا چهار پرسش پرتکرار با پاسخ کوتاه',
    },
    coverAlt: { type: 'string', description: 'متن جانشین تصویر شاخص' },
    categorySlug: { type: 'string', description: 'نشانی دسته مناسب از فهرست داده‌شده' },
  },
} as const;

const SYSTEM = `تو نویسنده فنی وبلاگ «پاسارگاد میزبان» هستی؛ یک سرویس فروش سرور ابری با پرداخت ریالی برای کاربران ایرانی.

قواعد نوشتن:
• فارسی روان و ساده بنویس، با لحن یک مهندس باتجربه که به همکارش توضیح می‌دهد. نه تبلیغاتی، نه تشریفاتی.
• هر چه می‌نویسی باید از دانش خودت و با جمله‌های خودت باشد. هرگز از هیچ منبعی جمله کپی نکن و بازنویسی نزدیک هم نکن.
• عدد، قیمت، آمار و نقل‌قولی که مطمئن نیستی نیاور. ادعای بی‌پشتوانه درباره رقبا ننویس.
• ساختار: مقدمه کوتاه (۲ تا ۳ جمله) که همان ابتدا پاسخ اصلی را می‌دهد، بعد ۴ تا ۷ سرفصل «## »، و در پایان یک جمع‌بندی کوتاه.
• کلیدواژه هدف باید در عنوان، پاراگراف اول و دست‌کم یکی از سرفصل‌ها بیاید؛ ولی تکرار بی‌رویه نکن.
• مارک‌داون مجاز: ## و ### برای تیتر، - برای فهرست، **پررنگ**، [متن](نشانی) برای لینک، جدول با |، بلوک کد با سه بک‌تیک، و جعبه نکته با :::tip ... ::: یا :::warning ... :::
• عنوان مقاله را داخل متن (با #) تکرار نکن؛ متن از مقدمه شروع می‌شود.
• دست‌کم سه لینک داخلی از فهرست لینک‌های مجاز بگذار، آن‌جایی که واقعاً به کار خواننده می‌آید. لینک بیرونی فقط به مستندات رسمی (مثل docs.hetzner.com یا ubuntu.com) و حداکثر یکی.
• اگر موضوع فنی است، دستور واقعی و درست لینوکس بده؛ دستور ساختگی ننویس.
• طول متن: بین ۹۰۰ تا ۱۴۰۰ کلمه.`;

function buildPrompt(input: {
  brief: ResearchBrief;
  internalLinks: InternalLink[];
  categories: { slug: string; name: string }[];
  brandName: string;
}): string {
  const { brief, internalLinks, categories, brandName } = input;

  const sources = brief.sources.length
    ? brief.sources
        .map((s, i) => `${i + 1}. ${s.title} — ${s.url}\n   خلاصه گوگل: ${s.snippet}`)
        .join('\n')
    : '— نتایج گوگل در دسترس نبود؛ بر اساس دانش خودت بنویس.';

  return `کلیدواژه هدف: «${brief.keyword}»

برای این عبارت یک مقاله کامل بنویس.

پرسش‌هایی که کاربران در گوگل جستجو می‌کنند:
${brief.questions.length ? brief.questions.map((q) => `• ${q}`).join('\n') : '• (موردی یافت نشد)'}

عبارت‌های مرتبط که خوب است در متن پوشش داده شوند:
${brief.relatedTerms.length ? brief.relatedTerms.map((t) => `• ${t}`).join('\n') : '• (موردی یافت نشد)'}

نتایج فعلی بالای گوگل برای این عبارت — فقط برای شناخت نیت جستجو و پیدا کردن زاویه بهتر.
از این‌ها هیچ جمله‌ای برنمی‌داری و محتوایشان را بازنویسی نمی‌کنی:
${sources}

لینک‌های داخلی مجاز (دست‌کم سه مورد را به‌جا در متن استفاده کن):
${internalLinks.map((l) => `• [${l.title}](${l.path})`).join('\n')}

دسته‌های وبلاگ — مناسب‌ترین را در categorySlug برگردان:
${categories.map((c) => `• ${c.slug} — ${c.name}`).join('\n')}

نام برند برای اشاره‌های طبیعی در متن: ${brandName}. اشاره به برند حداکثر دو بار و فقط جایی که واقعاً مربوط است (مثل تعویض آی‌پی یا پرداخت ریالی).

خروجی را دقیقاً در قالب JSON خواسته‌شده بده.`;
}

export type WriteResult = {
  article: GeneratedArticle;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

/** یک مقاله تازه از خلاصه تحقیق می‌سازد */
export async function writeArticle(input: {
  brief: ResearchBrief;
  internalLinks: InternalLink[];
  categories: { slug: string; name: string }[];
  brandName: string;
}): Promise<WriteResult> {
  if (!env.content.apiKey) {
    throw new ApiError('کلید ANTHROPIC_API_KEY تنظیم نشده است؛ بدون آن تولید مقاله ممکن نیست.', 503);
  }

  const client = new Anthropic({ apiKey: env.content.apiKey, maxRetries: 2 });

  const response = await client.messages.parse({
    model: env.content.model,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: jsonSchemaOutputFormat(OUTPUT_SCHEMA) },
    system: SYSTEM,
    messages: [{ role: 'user', content: buildPrompt(input) }],
  });

  if (response.stop_reason === 'refusal') {
    throw new ApiError('مدل نوشتن این موضوع را رد کرد؛ موضوع دیگری انتخاب می‌شود.', 422);
  }
  if (response.stop_reason === 'max_tokens') {
    throw new ApiError('پاسخ مدل نیمه‌کاره ماند (سقف توکن). موضوع برای تلاش دوباره در صف می‌ماند.', 502);
  }

  const parsed = articleSchema.safeParse(response.parsed_output);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ApiError(
      `خروجی مدل با ساختار مقاله نخواند: ${first?.path.join('.') || '?'} — ${first?.message ?? ''}`,
      502,
    );
  }

  return {
    article: parsed.data,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
