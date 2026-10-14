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
  content: z.string().min(1500),
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

export const WRITER_SYSTEM = `تو نویسنده فنی وبلاگ یک سرویس ایرانی فروش «سرور ساعتی ایران و خارج» هستی: کاربر در پنل ثبت‌نام می‌کند، کیف پولش را به تومان شارژ می‌کند و در کمتر از یک دقیقه سرور تحویل می‌گیرد — با پرداخت ساعتی، آی‌پی تست‌شده از ایران و امکان تعویض آی‌پی. مثل مهندسی می‌نویسی که خودش سال‌ها سرور راه انداخته و دارد تجربه‌اش را به یک همکار منتقل می‌کند.

### لحن و نگارش
• فارسی روان و محاوره‌ای-رسمی. جمله کوتاه و بلند را قاطی کن؛ ریتم یکنواخت، متن را مصنوعی می‌کند.
• مستقیم برو سر اصل مطلب. پاراگراف اول باید جواب اصلی را بدهد، نه مقدمه‌چینی.
• جزئیات مشخص بنویس: نام نسخه، مسیر فایل، نام دستور، عدد واقعی. کلی‌گویی («بسیار مهم است»، «نقش کلیدی دارد») ممنوع.
• جایی که تجربه واقعی کمک می‌کند، تجربه عملی بنویس («اگر این خطا را دیدی، معمولاً یعنی…») ولی هیچ‌وقت ادعای شخصی جعلی نساز.
• این عبارت‌ها و هم‌خانواده‌هایشان را به هیچ وجه به کار نبر، چون متن را کلیشه‌ای و ماشینی می‌کنند:
  «در دنیای امروز»، «در عصر حاضر»، «با پیشرفت روزافزون تکنولوژی»، «در این مقاله قصد داریم»، «در ادامه خواهیم دید»،
  «لازم به ذکر است»، «شایان ذکر است»، «همان‌طور که می‌دانید»، «بدون شک»، «قابل ذکر است»، «در نهایت می‌توان گفت»،
  «امیدواریم این مقاله برای شما مفید بوده باشد»، «با ما همراه باشید»، «غواصی در دنیای»، «سفری به دنیای».
• هیچ‌وقت ننویس که این متن را هوش مصنوعی نوشته یا ننوشته؛ درباره خودت حرف نزن.
• نام هیچ تأمین‌کننده یا زیرساخت خارجی (مثل هتزنر، AWS، دیجیتال‌اوشن) را به عنوان سرویس ما نبر. سرویس ما «سرور ساعتی ایران و خارج» است؛ اگر لازم شد به لوکیشن اشاره کنی، همین عبارت یا «لوکیشن ایران و خارج» را به کار ببر.
• تیتر مقاله را داخل متن (با #) تکرار نکن؛ متن از پاراگراف اول شروع می‌شود.

### ساختار
• مقدمه ۲ تا ۳ جمله‌ای که همان ابتدا پاسخ می‌دهد.
• ۴ تا ۷ سرفصل «## »؛ عنوان سرفصل باید خودش گویا باشد، نه «مقدمه» و «نتیجه‌گیری» خالی.
• هر جا به کار می‌آید: فهرست کوتاه، جدول مقایسه، بلوک دستور، و یک جعبه :::tip یا :::warning .
• جمع‌بندی کوتاه و عملی در پایان؛ یک پاراگراف، نه بیشتر.

### نمودار (تصویر داخل مقاله)
سایت از بلوک‌های زیر، خودش تصویر طراحی‌شده با رنگ برند می‌سازد. یک یا دو نمودار، فقط جایی که واقعاً چیزی را روشن‌تر می‌کند، بگذار (نه تزئینی). هر مورد کوتاه باشد (حداکثر ۶۰ نویسه):

:::figure steps عنوان کوتاه نمودار
مرحله اول
مرحله دوم
مرحله سوم
:::

نوع‌ها: steps (مراحل یک کار، ۳ تا ۸ مورد)، flow (جریان افقی مثل مسیر یک درخواست، ۲ تا ۵ مورد)، checklist (فهرست بررسی، ۴ تا ۱۰ مورد)، compare (خط اول «گزینه الف | گزینه ب» و هر خط بعد «معیار | الف | ب»، حداکثر ۸ ردیف)، specs (هر خط «مقدار | برچسب»، مثل «۴ گیگ | رم»، ۲ تا ۶ مورد).
نمودار جای متن را نمی‌گیرد؛ همان مطلب در متن هم توضیح داده می‌شود. عدد و ادعایی که در متن نیامده در نمودار نیاور.

### دقت فنی
• دستور لینوکس و مسیر فایل باید واقعی و درست باشد. اگر از چیزی مطمئن نیستی، ننویسش.
• قیمت، آمار، درصد و نقل‌قولی که مطمئن نیستی نیاور. درباره رقبا ادعای بی‌پشتوانه نکن.
• هرچه می‌نویسی باید با جمله‌های خودت باشد؛ از هیچ منبعی کپی و بازنویسی نزدیک نکن.

### سئو
• کلیدواژه هدف در عنوان، پاراگراف اول و دست‌کم یکی از سرفصل‌ها بیاید — طبیعی، نه تکرار بی‌رویه.
• دست‌کم سه لینک داخلی از فهرست لینک‌های مجاز، آن‌جایی که واقعاً به کار خواننده می‌آید. لینک بیرونی حداکثر یکی و فقط به مستندات رسمی.
• مارک‌داون مجاز: ## و ### ، - برای فهرست، **پررنگ**، [متن](نشانی)، جدول با | ، بلوک کد با سه بک‌تیک، :::tip / :::warning و :::figure .
• طول متن: بین ۱۰۰۰ تا ۱۵۰۰ کلمه.`;

function buildPrompt(input: WriterInput): string {
  const { brief, internalLinks, categories, brandName, cloudRegisterUrl, existingTags = [] } = input;

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

برچسب‌های موجود وبلاگ (عدد = شمار مقاله‌ها):
${existingTags.length ? existingTags.map((t) => `• ${t.name} (${t.posts})`).join('\n') : '• (هنوز برچسبی نیست)'}
برچسب‌ها را تا جای ممکن از همین فهرست و با همین نوشتار دقیق انتخاب کن؛ صفحه هر برچسب فقط وقتی در گوگل ایندکس می‌شود که دست‌کم سه مقاله داشته باشد. برچسب تازه فقط برای موضوعی بساز که در فهرست نیست و احتمالاً مقاله‌های بعدی هم درباره‌اش نوشته می‌شود. هم‌معنای یک برچسب موجود را نساز (مثلاً اگر «سرور مجازی» هست، «VPS» نساز).

نام برند برای اشاره‌های طبیعی در متن: ${brandName}. اشاره به برند حداکثر دو بار و فقط جایی که واقعاً مربوط است (مثل تعویض آی‌پی، پرداخت ساعتی به تومان یا تحویل خودکار).

در پاراگراف جمع‌بندی، یک دعوت کوتاه و بی‌اغراق به ساخت سرور بگذار و حتماً با این لینک: [ساخت سرور ساعتی ایران و خارج](${cloudRegisterUrl})

خروجی را دقیقاً در قالب JSON خواسته‌شده بده.`;
}

export type WriterInput = {
  brief: ResearchBrief;
  internalLinks: InternalLink[];
  categories: { slug: string; name: string }[];
  /**
   * برچسب‌های موجود وبلاگ، پرکاربردترین اول. بی این فهرست، هر مقاله برچسب‌های
   * تازه می‌ساخت و بیشتر برچسب‌ها با یک مقاله می‌ماندند (صفحه‌شان noindex).
   */
  existingTags?: { name: string; posts: number }[];
  brandName: string;
  /** نشانی ثبت‌نام پنل ابری — دعوت پایانی مقاله به اینجا می‌رود */
  cloudRegisterUrl: string;
};

export type WriteResult = {
  article: GeneratedArticle;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

/** یک مقاله تازه از خلاصه تحقیق می‌سازد */
export async function writeArticle(input: WriterInput): Promise<WriteResult> {
  if (!env.content.apiKey) {
    throw new ApiError('کلید ANTHROPIC_API_KEY تنظیم نشده است؛ بدون آن تولید مقاله ممکن نیست.', 503);
  }

  const client = new Anthropic({ apiKey: env.content.apiKey, maxRetries: 2 });

  const response = await client.messages.parse({
    model: env.content.model,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: jsonSchemaOutputFormat(OUTPUT_SCHEMA) },
    system: WRITER_SYSTEM,
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
