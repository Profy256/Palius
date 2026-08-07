'use client';

import React from 'react';

// ---------------------------------------------------------------------------
// The admin panel's shared primitives and number formatting.
//
// These started life duplicated inside each dashboard, which meant a table on
// one tab could quietly render its money differently from the table on the
// next. One definition each, imported everywhere.
// ---------------------------------------------------------------------------

export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-panel border border-line p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
  accent = 'text-white',
  onClick,
  active,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const base =
    'p-4 rounded-xl border space-y-1.5 text-left transition-colors ' +
    (active ? 'bg-brand-500/10 border-brand-500/40' : 'bg-panel border-line');

  const content = (
    <>
      <span className="text-[10px] text-zinc-400 font-mono uppercase font-bold block">{label}</span>
      <div className={`text-xl font-extrabold ${accent}`}>{value}</div>
      {sub && <span className="text-[10px] text-zinc-400 block leading-snug">{sub}</span>}
    </>
  );

  if (!onClick) return <div className={base}>{content}</div>;
  return (
    <button onClick={onClick} className={`${base} hover:border-line-strong w-full`}>
      {content}
    </button>
  );
}

export function Row({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="min-w-0">
        <span className={`text-xs ${strong ? 'font-bold text-white' : 'text-zinc-300'}`}>{label}</span>
        {hint && <span className="block text-[10px] text-zinc-400 leading-snug">{hint}</span>}
      </div>
      <span className={`text-xs font-mono shrink-0 ${strong ? 'font-bold text-brand-300' : 'text-zinc-200'}`}>
        {value}
      </span>
    </div>
  );
}

export function Chip({ children }: { children: React.ReactNode }) {
  return <span className="px-2 py-1 rounded-lg bg-card border border-line text-zinc-300">{children}</span>;
}

export function Badge({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold font-mono uppercase whitespace-nowrap ${tone}`}>
      {label}
    </span>
  );
}

export function CostBar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.max(1, (value / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="text-zinc-300 truncate">{label}</span>
        <span className="font-mono text-zinc-200 shrink-0">{usd(value)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-well overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Table({
  head,
  rows,
  empty,
  minWidth = 720,
  onRowClick,
}: {
  head: string[];
  rows: React.ReactNode[][];
  empty: string;
  minWidth?: number;
  onRowClick?: (index: number) => void;
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-zinc-400 py-4">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse" style={{ minWidth }}>
        <thead>
          <tr className="text-left">
            {head.map(h => (
              <th
                key={h}
                className="pb-2 pr-4 text-[10px] font-mono font-bold uppercase text-zinc-400 border-b border-line whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              onClick={onRowClick ? () => onRowClick(i) : undefined}
              className={`border-b border-line/60 last:border-0 ${
                onRowClick ? 'cursor-pointer hover:bg-card/60' : ''
              }`}
            >
              {r.map((cell, j) => (
                <td key={j} className="py-2.5 pr-4 align-top text-zinc-200">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------- formatting ---

export const usd = (v: number) =>
  (v < 0 ? '-$' : '$') +
  Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const num = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 0 });

export const fmt = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1 });

// timeAgo renders a stored UTC timestamp as an age. The backend writes
// "YYYY-MM-DD HH:MM:SS" in UTC with no zone marker, which JS would otherwise
// read as local time and report as hours out.
export function timeAgo(ts: string) {
  if (!ts) return '—';
  const d = parseUTC(ts);
  const diff = Date.now() - d.getTime();
  if (isNaN(diff)) return ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 60) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function shortDate(ts: string) {
  if (!ts) return '—';
  const d = parseUTC(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function dateTime(ts: string) {
  if (!ts) return '—';
  const d = parseUTC(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function parseUTC(ts: string) {
  if (ts.includes('T')) return new Date(ts);
  return new Date(ts.replace(' ', 'T') + 'Z');
}
