import { TOOLS, toolBySlug, type ToolDef } from './registry';
import { iranProbeReady } from './iran-probe';

/**
 * ابزارهایی که روی این نصب واقعاً کار می‌کنند.
 * «تست دسترسی از ایران» فقط وقتی سرویس آزمایش در ایران تنظیم شده باشد نمایش
 * داده می‌شود؛ وگرنه نتیجه‌اش از خارج ایران بود و گمراه‌کننده.
 */
export function isToolAvailable(tool: ToolDef): boolean {
  return tool.kind !== 'tcp' || iranProbeReady();
}

export function availableTools(): ToolDef[] {
  return TOOLS.filter(isToolAvailable);
}

export function availableTool(slug: string): ToolDef | undefined {
  const tool = toolBySlug(slug);
  return tool && isToolAvailable(tool) ? tool : undefined;
}
