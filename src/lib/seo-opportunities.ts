/**
 * فرصت‌های صفحه اول.
 *
 * سریع‌ترین راه گرفتن ورودی از گوگل، نوشتن مقاله تازه نیست؛ بهتر کردن
 * مقاله‌هایی است که گوگل همین حالا نزدیک صفحه اول نشانشان می‌دهد. این
 * فهرست دو جور مقاله را پیدا می‌کند:
 *   near: جایگاه ۸ تا ۲۰ (ته صفحه اول یا صفحه دوم) — با کامل‌تر کردن متن بالا می‌آیند
 *   ctr:  در صفحه اول‌اند ولی کمتر از انتظار کلیک می‌گیرند — عنوان و توضیح متا باید جذاب‌تر شود
 */

export type Metrics = { clicks: number; impressions: number; ctr: number; position: number };

export type Opportunity = Metrics & {
  postId: string;
  title: string;
  slug: string;
  kind: 'near' | 'ctr';
  /** کلیک اضافه تقریبی در همان بازه، اگر به جایگاه ۳ برسد (near) یا به نرخ کلیک معمول جایگاهش (ctr) */
  potential: number;
};

/** نرخ کلیک معمول هر جایگاه در نتایج گوگل (تقریبی، از منحنی‌های عمومی صنعت) */
export function expectedCtr(position: number): number {
  const curve = [0.28, 0.16, 0.11, 0.08, 0.065, 0.05, 0.04, 0.032, 0.027, 0.023];
  const p = Math.max(1, Math.round(position));
  return p <= curve.length ? curve[p - 1] : 0.01;
}

export function findOpportunities(
  posts: { id: string; title: string; slug: string; status: string; noindex: boolean }[],
  perPage: Record<string, Metrics>,
): Opportunity[] {
  const out: Opportunity[] = [];
  for (const post of posts) {
    if (post.status !== 'PUBLISHED' || post.noindex) continue;
    const m = perPage[post.id];
    if (!m || !m.impressions || !m.position) continue;

    if (m.position >= 7.5 && m.position <= 20.5 && m.impressions >= 5) {
      out.push({
        ...m,
        postId: post.id,
        title: post.title,
        slug: post.slug,
        kind: 'near',
        potential: Math.max(0, Math.round(m.impressions * (expectedCtr(3) - m.ctr))),
      });
    } else if (m.position < 7.5 && m.impressions >= 30 && m.ctr < expectedCtr(m.position) * 0.5) {
      out.push({
        ...m,
        postId: post.id,
        title: post.title,
        slug: post.slug,
        kind: 'ctr',
        potential: Math.max(0, Math.round(m.impressions * (expectedCtr(m.position) - m.ctr))),
      });
    }
  }
  return out.sort((a, b) => b.potential - a.potential || b.impressions - a.impressions).slice(0, 50);
}

/** عبارت‌هایی که سایت با آن‌ها در صفحه دوم یا ته صفحه اول دیده می‌شود */
export function nearQueries<T extends { impressions: number; position: number }>(rows: T[], limit = 25): T[] {
  return rows
    .filter((r) => r.position >= 7.5 && r.position <= 20.5 && r.impressions >= 3)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, limit);
}
