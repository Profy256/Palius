'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { LifeBuoy, Plus, Loader2, RefreshCw } from 'lucide-react';
import { IssueReport, fetchMyIssues } from '@/lib/api';
import { ReportIssueModal } from '@/components/ReportIssueModal';

// ---------------------------------------------------------------------------
// Support, from the customer's side: what I reported, and what happened to it.
//
// A report that vanishes into a form is indistinguishable from one that was
// ignored, so the status and any operator note are shown back to the reporter.
// ---------------------------------------------------------------------------

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  open: { label: 'Open', className: 'text-brand-300 bg-brand-500/10 border-brand-500/30' },
  in_progress: { label: 'Being worked on', className: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30' },
  resolved: { label: 'Resolved', className: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  closed: { label: 'Closed', className: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30' },
};

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'text-red-300',
  high: 'text-amber-300',
  normal: 'text-zinc-300',
  low: 'text-zinc-400',
};

export function SupportSection() {
  const [issues, setIssues] = useState<IssueReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchMyIssues();
    setIssues(res?.issues ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-5 rounded-2xl bg-panel border border-line space-y-4">
      <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <LifeBuoy className="w-4 h-4 text-brand-400" />
          <h3 className="text-sm font-bold text-white">Support &amp; Reported Issues</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            aria-label="Refresh reports"
            className="p-2 rounded-xl bg-card border border-line text-zinc-400 hover:text-white"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setReportOpen(true)}
            className="px-3 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-ink text-xs font-bold flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Report an issue
          </button>
        </div>
      </div>

      <p className="text-[11px] text-zinc-400 leading-relaxed">
        Anything broken, wrongly charged, or missing — tell us here. Reports arrive with your
        account and recent activity attached, so nobody has to ask you to reproduce it from
        scratch.
      </p>

      {loading && issues.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-zinc-400 py-4">
          <Loader2 className="w-4 h-4 animate-spin text-brand-400" /> Loading your reports…
        </div>
      )}

      {!loading && issues.length === 0 && (
        <div className="py-8 text-center space-y-2">
          <p className="text-xs text-zinc-400">You haven&apos;t reported anything yet.</p>
          <button
            onClick={() => setReportOpen(true)}
            className="text-xs font-semibold text-brand-400 hover:text-brand-300"
          >
            Report an issue
          </button>
        </div>
      )}

      <div className="space-y-2">
        {issues.map(i => {
          const status = STATUS_STYLE[i.status] ?? STATUS_STYLE.open;
          return (
            <div key={i.id} className="p-3.5 rounded-xl bg-card border border-line space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white">{i.subject}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    {i.category} · <span className={SEVERITY_STYLE[i.severity] ?? ''}>{i.severity}</span>
                    {' · '}
                    {formatDate(i.createdAt)}
                  </p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-md border text-[10px] font-bold whitespace-nowrap ${status.className}`}
                >
                  {status.label}
                </span>
              </div>

              <p className="text-[11px] text-zinc-400 leading-relaxed line-clamp-3">{i.body}</p>

              {i.adminNote && (
                <p className="text-[11px] text-zinc-300 border-l-2 border-brand-500/40 pl-2.5 leading-relaxed">
                  <span className="font-semibold text-brand-300">From the team:</span> {i.adminNote}
                </p>
              )}

              {i.resolvedAt && (
                <p className="text-[10px] text-emerald-400">Resolved {formatDate(i.resolvedAt)}</p>
              )}
            </div>
          );
        })}
      </div>

      <ReportIssueModal
        isOpen={reportOpen}
        onClose={() => {
          setReportOpen(false);
          load();
        }}
        currentPage="Settings"
      />
    </div>
  );
}

// The backend stores UTC without a zone marker; parsing it as-is would read it
// as local time and show the wrong day near midnight.
function formatDate(ts: string) {
  if (!ts) return '';
  const d = ts.includes('T') ? new Date(ts) : new Date(ts.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
