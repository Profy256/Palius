'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Search, Loader2, LifeBuoy, Clock, AlertOctagon } from 'lucide-react';
import { IssueReport, IssueStats, fetchIssues, updateIssue } from '@/lib/api';
import { Panel, Stat, Badge, num, timeAgo, dateTime } from '@/components/ui';
import { ExportMenu } from '@/components/ExportMenu';

// ---------------------------------------------------------------------------
// Support queue.
//
// Ordered by the server so the worst thing is always first: open before closed,
// critical before low, newest last within a band. The operator should be able
// to work top-down without sorting anything.
// ---------------------------------------------------------------------------

const STATUSES = ['all', 'open', 'in_progress', 'resolved', 'closed'];
const SEVERITIES = ['all', 'critical', 'high', 'normal', 'low'];
const CATEGORIES = [
  'all', 'bug', 'billing', 'credits', 'generation', 'publishing',
  'connection', 'account', 'feature-request', 'other',
];

const SEVERITY_TONE: Record<string, string> = {
  critical: 'text-red-200 bg-red-500/20 border-red-500/50',
  high: 'text-amber-200 bg-amber-500/15 border-amber-500/40',
  normal: 'text-cyan-200 bg-cyan-500/10 border-cyan-500/30',
  low: 'text-zinc-300 bg-zinc-500/10 border-zinc-500/30',
};

const STATUS_TONE: Record<string, string> = {
  open: 'text-brand-200 bg-brand-500/15 border-brand-500/40',
  in_progress: 'text-cyan-200 bg-cyan-500/15 border-cyan-500/40',
  resolved: 'text-emerald-200 bg-emerald-500/15 border-emerald-500/40',
  closed: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30',
};

export function IssuesView() {
  const [issues, setIssues] = useState<IssueReport[]>([]);
  const [stats, setStats] = useState<IssueStats | null>(null);
  const [status, setStatus] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchIssues({ status, severity, category, q: query });
    setIssues(res?.issues ?? []);
    setStats(res?.stats ?? null);
    setLoading(false);
  }, [status, severity, category, query]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = async (id: string, body: Parameters<typeof updateIssue>[1]) => {
    const res = await updateIssue(id, body);
    if (!res) {
      window.alert('Update failed — the backend rejected the request.');
      return;
    }
    await load();
  };

  return (
    <div className="space-y-5">
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Stat label="Open" value={num(stats.open)} sub={`${stats.inProgress} in progress`} accent="text-brand-400"
            active={status === 'open'} onClick={() => setStatus('open')} />
          <Stat label="Critical open" value={num(stats.openCritical)} sub={`${stats.critical} ever raised`}
            accent={stats.openCritical > 0 ? 'text-red-400' : 'text-zinc-300'}
            active={severity === 'critical'} onClick={() => { setSeverity('critical'); setStatus('all'); }} />
          <Stat label="Last 24 hours" value={num(stats.last24h)} sub="new reports" accent="text-cyan-400" />
          <Stat label="Oldest open" value={stats.oldestOpenAge || '—'} sub="waiting on us" accent="text-amber-400" />
          <Stat label="Avg resolve" value={stats.avgResolveHours ? `${stats.avgResolveHours}h` : '—'} sub="time to resolution" accent="text-emerald-400" />
          <Stat label="Total" value={num(stats.total)} sub={`${stats.resolved} resolved`} accent="text-white"
            active={status === 'all'} onClick={() => { setStatus('all'); setSeverity('all'); }} />
        </div>
      )}

      <div className="rounded-2xl bg-panel border border-line p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search subject, description, customer…"
            className="w-full bg-well border border-line rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-zinc-500"
          />
        </div>
        <Select value={status} onChange={setStatus} options={STATUSES} prefix="Status" />
        <Select value={severity} onChange={setSeverity} options={SEVERITIES} prefix="Severity" />
        <Select value={category} onChange={setCategory} options={CATEGORIES} prefix="Category" />
        <ExportMenu dataset="issues" params={{ status, severity, category }} label="Export issues" />
      </div>

      <Panel title={`${issues.length} ${issues.length === 1 ? 'report' : 'reports'}`}>
        {loading && (
          <div className="flex items-center gap-2 text-xs text-zinc-400 py-6">
            <Loader2 className="w-4 h-4 animate-spin text-brand-400" /> Loading reports…
          </div>
        )}

        {!loading && issues.length === 0 && (
          <div className="py-10 text-center space-y-2">
            <LifeBuoy className="w-6 h-6 text-zinc-600 mx-auto" />
            <p className="text-xs text-zinc-400">Nothing matches this filter.</p>
          </div>
        )}

        <div className="space-y-2">
          {issues.map(i => (
            <div
              key={i.id}
              className={`rounded-xl border p-4 space-y-2 transition-colors ${
                i.severity === 'critical' && i.status === 'open'
                  ? 'bg-red-500/5 border-red-500/30'
                  : 'bg-card border-line'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  onClick={() => setExpanded(expanded === i.id ? null : i.id)}
                  className="text-left min-w-0 flex-1"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge label={i.severity} tone={SEVERITY_TONE[i.severity] ?? SEVERITY_TONE.normal} />
                    <Badge label={i.status.replace('_', ' ')} tone={STATUS_TONE[i.status] ?? STATUS_TONE.open} />
                    <span className="text-[10px] font-mono text-zinc-500">{i.category}</span>
                  </div>
                  <p className="text-sm font-semibold text-white mt-1.5">{i.subject}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    {i.userName || i.userId}
                    {i.userEmail && ` · ${i.userEmail}`}
                    {i.userPlan && ` · ${i.userPlan}`}
                    {' · '}
                    <span title={dateTime(i.createdAt)}>{timeAgo(i.createdAt)}</span>
                    {i.page && ` · from ${i.page}`}
                  </p>
                </button>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {i.status !== 'in_progress' && i.status !== 'resolved' && (
                    <ActionButton label="Start" onClick={() => patch(i.id, { status: 'in_progress' })} />
                  )}
                  {i.status !== 'resolved' && (
                    <ActionButton label="Resolve" tone="emerald" onClick={() => patch(i.id, { status: 'resolved' })} />
                  )}
                  {i.status === 'resolved' && (
                    <ActionButton label="Reopen" onClick={() => patch(i.id, { status: 'open' })} />
                  )}
                  {i.status !== 'closed' && (
                    <ActionButton label="Close" onClick={() => patch(i.id, { status: 'closed' })} />
                  )}
                </div>
              </div>

              {expanded === i.id && (
                <div className="space-y-3 pt-2 border-t border-line">
                  <p className="text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed">{i.body}</p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] text-zinc-400">
                    <Meta label="Report id" value={i.id} />
                    <Meta label="Platform" value={i.platform || '—'} />
                    <Meta label="Operation" value={i.operationId || '—'} />
                    <Meta label="Reply to" value={i.contactEmail || i.userEmail || '—'} />
                    <Meta label="Assigned to" value={i.assignedTo || 'unassigned'} />
                    <Meta label="Updated" value={dateTime(i.updatedAt)} />
                    <Meta label="Resolved" value={i.resolvedAt ? dateTime(i.resolvedAt) : '—'} />
                    <Meta label="Browser" value={i.userAgent ? i.userAgent.slice(0, 40) : '—'} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={i.severity}
                      onChange={e => patch(i.id, { severity: e.target.value })}
                      className="bg-well border border-line rounded-lg px-2.5 py-1.5 text-[11px] text-white"
                    >
                      {SEVERITIES.filter(s => s !== 'all').map(s => (
                        <option key={s} value={s}>severity: {s}</option>
                      ))}
                    </select>
                    <select
                      value={i.category}
                      onChange={e => patch(i.id, { category: e.target.value })}
                      className="bg-well border border-line rounded-lg px-2.5 py-1.5 text-[11px] text-white"
                    >
                      {CATEGORIES.filter(s => s !== 'all').map(s => (
                        <option key={s} value={s}>category: {s}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        const who = window.prompt('Assign to whom?', i.assignedTo || '');
                        if (who === null) return;
                        patch(i.id, { assignedTo: who });
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-card border border-line text-[11px] text-zinc-200"
                    >
                      Assign
                    </button>
                  </div>

                  <NoteEditor
                    initial={i.adminNote}
                    onSave={note => patch(i.id, { adminNote: note })}
                  />
                </div>
              )}

              {expanded !== i.id && i.adminNote && (
                <p className="text-[11px] text-zinc-400 border-l-2 border-line pl-2.5">
                  <span className="font-semibold text-zinc-300">Note:</span> {i.adminNote}
                </p>
              )}
            </div>
          ))}
        </div>
      </Panel>

      {stats && Object.keys(stats.byCategory).length > 0 && (
        <Panel title="What is breaking">
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.byCategory)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, n]) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className="px-3 py-2 rounded-xl bg-card border border-line hover:border-line-strong text-left"
                >
                  <span className="text-xs font-semibold text-white block">{cat}</span>
                  <span className="text-[10px] text-zinc-400">{n} report{n === 1 ? '' : 's'}</span>
                </button>
              ))}
          </div>
        </Panel>
      )}

      {stats && stats.openCritical > 0 && (
        <p className="text-[11px] text-red-300 flex items-center gap-1.5">
          <AlertOctagon className="w-3.5 h-3.5" />
          {stats.openCritical} critical report{stats.openCritical === 1 ? '' : 's'} still open.
        </p>
      )}
      {stats && stats.oldestOpenAge && (
        <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          Oldest unresolved report has been waiting {stats.oldestOpenAge}.
        </p>
      )}
    </div>
  );
}

function NoteEditor({ initial, onSave }: { initial: string; onSave: (note: string) => void }) {
  const [note, setNote] = useState(initial);
  useEffect(() => setNote(initial), [initial]);

  return (
    <div className="space-y-1.5">
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        rows={2}
        placeholder="Internal note — what you found, what you did…"
        className="w-full bg-well border border-line rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-500"
      />
      <button
        onClick={() => onSave(note)}
        disabled={note === initial}
        className="px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-400 text-ink text-[11px] font-bold disabled:opacity-40"
      >
        Save note
      </button>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  tone = 'zinc',
}: {
  label: string;
  onClick: () => void;
  tone?: 'zinc' | 'emerald';
}) {
  const tones = {
    zinc: 'bg-card border-line text-zinc-200 hover:bg-raised',
    emerald: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25',
  };
  return (
    <button onClick={onClick} className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold ${tones[tone]}`}>
      {label}
    </button>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="font-mono uppercase font-bold text-zinc-500 block">{label}</span>
      <span className="text-zinc-300 break-all">{value}</span>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  prefix,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  prefix: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="bg-well border border-line rounded-xl px-3 py-2 text-xs text-white"
    >
      {options.map(o => (
        <option key={o} value={o}>
          {prefix}: {o.replace('_', ' ')}
        </option>
      ))}
    </select>
  );
}
