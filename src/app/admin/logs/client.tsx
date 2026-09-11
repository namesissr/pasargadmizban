'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Search } from 'lucide-react';
import { Badge, Card, Input, LoadingBlock, Pagination, Select } from '@/components/ui';
import { fetcher } from '@/lib/client';
import { formatNumber } from '@/lib/money';
import { faDateTime, truncate } from '@/lib/utils';

type Row = {
  id: string;
  action: string;
  label: string;
  actorType: string;
  entity: string | null;
  entityId: string | null;
  ip: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  user: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
};

type Response = {
  items: Row[];
  meta: { total: number; page: number; totalPages: number };
  actions: { action: string; label: string; count: number }[];
};

const ACTOR_FA: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted' }> = {
  user: { label: 'کاربر', tone: 'muted' },
  admin: { label: 'مدیر', tone: 'warn' },
  system: { label: 'سیستم', tone: 'ok' },
  gateway: { label: 'درگاه', tone: 'ok' },
};

export function LogsClient() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('ALL');
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const key = `/api/admin/logs?page=${page}&action=${encodeURIComponent(action)}&q=${encodeURIComponent(q)}`;
  const { data, isLoading } = useSWR<Response>(key, fetcher);

  return (
    <Card
      title={data ? `${formatNumber(data.meta.total)} رویداد` : 'رویدادها'}
      action={
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 muted" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="ایمیل، IP یا شناسه"
              className="w-44 pr-8 text-xs"
            />
          </div>
          <Select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            className="w-52 text-xs"
          >
            <option value="ALL">همه رویدادها</option>
            {data?.actions.map((a) => (
              <option key={a.action} value={a.action}>
                {a.label} ({a.count})
              </option>
            ))}
          </Select>
        </div>
      }
      bodyClassName="p-0"
    >
      {isLoading && !data ? (
        <LoadingBlock />
      ) : !data?.items.length ? (
        <p className="py-12 text-center text-xs muted">رویدادی با این فیلترها ثبت نشده است.</p>
      ) : (
        <>
          <div className="scroll-x">
            <table className="table table-cards">
              <thead>
                <tr>
                  <th>رویداد</th>
                  <th>عامل</th>
                  <th>کاربر</th>
                  <th>موضوع</th>
                  <th>آدرس IP</th>
                  <th>زمان</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((log) => {
                  const actor = ACTOR_FA[log.actorType] ?? { label: log.actorType, tone: 'muted' as const };
                  const hasMeta = log.meta && Object.keys(log.meta).length > 0;
                  return (
                    <>
                      <tr
                        key={log.id}
                        onClick={() => hasMeta && setExpanded(expanded === log.id ? null : log.id)}
                        className={hasMeta ? 'cursor-pointer' : ''}
                      >
                        <td data-label="رویداد" className="text-xs font-semibold">{log.label}</td>
                        <td data-label="عامل">
                          <Badge tone={actor.tone}>{actor.label}</Badge>
                        </td>
                        <td data-label="کاربر" className="max-w-40">
                          {log.user ? (
                            <Link
                              href={`/admin/users/${log.user.id}`}
                              className="ltr block truncate text-[11px] hover:text-[var(--color-brand-600)]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {log.user.email}
                            </Link>
                          ) : (
                            <span className="text-[11px] muted">—</span>
                          )}
                        </td>
                        <td data-label="موضوع" className="text-[11px] muted">
                          {log.entity ? `${log.entity}` : '—'}
                          {log.entityId ? (
                            <span className="mono ltr block truncate">{truncate(log.entityId, 18)}</span>
                          ) : null}
                        </td>
                        <td data-label="آدرس IP" className="mono ltr text-[11px] muted">{log.ip ?? '—'}</td>
                        <td data-label="زمان" className="whitespace-nowrap text-[11px] muted">{faDateTime(log.createdAt)}</td>
                      </tr>
                      {expanded === log.id && hasMeta ? (
                        <tr key={`${log.id}-meta`}>
                          <td colSpan={6} className="surface-2">
                            <pre className="mono ltr overflow-x-auto whitespace-pre-wrap p-3 text-[10px] leading-5">
                              {JSON.stringify(log.meta, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      ) : null}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={data.meta.page} totalPages={data.meta.totalPages} onChange={setPage} />
        </>
      )}
    </Card>
  );
}
