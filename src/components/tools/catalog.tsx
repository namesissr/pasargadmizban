import Link from 'next/link';
import { Globe, Radar, Server, Lock, Gauge, Network, KeyRound, ArrowLeft } from 'lucide-react';
import { TOOLS, type ToolDef } from '@/lib/tools/registry';

const ICONS = {
  globe: Globe,
  radar: Radar,
  server: Server,
  lock: Lock,
  gauge: Gauge,
  network: Network,
  key: KeyRound,
} as const;

export function ToolIcon({ icon, size = 18 }: { icon: ToolDef['icon']; size?: number }) {
  const Icon = ICONS[icon];
  return <Icon size={size} />;
}

/** کارت‌های ابزارها؛ در فهرست ابزارها و پایین هر ابزار (به‌جز خودش) */
export function ToolGrid({ exclude, compact }: { exclude?: string; compact?: boolean }) {
  const tools = TOOLS.filter((t) => t.slug !== exclude);
  return (
    <ul className={`grid gap-3 ${compact ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
      {tools.map((tool) => (
        <li key={tool.slug}>
          <Link
            href={`/tools/${tool.slug}`}
            className="card flex h-full items-start gap-3 p-4 transition hover:border-[var(--color-brand-500)]"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--color-brand-50)] text-[var(--color-brand-600)]">
              <ToolIcon icon={tool.icon} />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1 text-sm font-bold">
                {tool.name} <ArrowLeft size={13} className="opacity-50" />
              </span>
              <span className="mt-1 block text-[11px] leading-6 muted">{tool.summary}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
