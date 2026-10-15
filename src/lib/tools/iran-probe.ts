import { env } from '../env';
import { ToolError } from './net';

/**
 * اتصال TCP از داخل ایران، با سرویس آزمایشی که روی یکی از سرورهای ایرانی
 * خودمان اجرا می‌شود (scripts/iran-probe-agent.mjs؛ همان که پنل برای سنجش
 * آی‌پی سرورها به کار می‌برد).
 *
 * سرور سایت خارج از ایران است، پس ابزار «تست دسترسی از ایران» بدون این سرویس
 * نمی‌تواند نتیجه درستی بدهد و اصلاً نمایش داده نمی‌شود.
 */

export function iranProbeReady(): boolean {
  return env.iranProbe.enabled;
}

type AgentResult = { ip: string; port: number; reachable: boolean; latencyMs: number | null; error: string | null };

/** چند اتصال پشت سر هم به یک مقصد، از داخل ایران */
export async function probeFromIran(ip: string, port: number, attempts: number, timeoutMs: number): Promise<AgentResult[]> {
  if (!env.iranProbe.enabled) throw new ToolError('سرویس آزمایش از ایران راه‌اندازی نشده است.', 503);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), attempts * timeoutMs + 10_000);
  try {
    const res = await fetch(`${env.iranProbe.url.replace(/\/$/, '')}/probe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.iranProbe.secret}` },
      // هر مقصد تکراری یک تلاش جداست؛ این‌طور زمان هر اتصال جدا برمی‌گردد
      body: JSON.stringify({ targets: Array.from({ length: attempts }, () => ({ ip, port })), controls: [], timeoutMs, tries: 1 }),
      signal: controller.signal,
    });
    if (!res.ok) throw new ToolError('سرویس آزمایش در ایران پاسخ نداد؛ چند دقیقه دیگر امتحان کنید.', 503);
    const body = (await res.json()) as { online?: boolean; results?: AgentResult[] };
    if (body.online === false) {
      throw new ToolError('اینترنت سرور آزمایش در ایران الان قطع است؛ نتیجه قابل اعتماد نیست. کمی بعد امتحان کنید.', 503);
    }
    return body.results ?? [];
  } catch (err) {
    if (err instanceof ToolError) throw err;
    throw new ToolError('ارتباط با سرویس آزمایش در ایران برقرار نشد؛ چند دقیقه دیگر امتحان کنید.', 503);
  } finally {
    clearTimeout(timer);
  }
}
