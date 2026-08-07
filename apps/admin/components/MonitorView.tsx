'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Loader2,
  Sparkles,
  UserPlus,
  CreditCard,
  Receipt,
  LifeBuoy,
  ShieldAlert,
  Wrench,
  Play,
  Pause,
} from 'lucide-react';
import {
  ActivityItem,
  AuditEntry,
  Subscription,
  CreditPurchase,
  fetchActivity,
  fetchAudit,
  fetchSubscriptions,
  fetchPurchases,
} from '@/lib/api';
import { Panel, Stat, Table, Badge, usd, num, timeAgo, dateTime, shortDate } from '@/components/ui';
import { ExportMenu } from '@/components/ExportMenu';

// ---------------------------------------------------------------------------
// Live monitoring.
//
// One feed of everything the platform did — generation, unmetered AI calls,
// signups, subscriptions, purchases, support reports, margin alerts and
// operator actions — merged and ordered by time. Watching eight tables
// separately is how incidents get noticed a day late.
// ---------------------------------------------------------------------------

type Pane = 'feed' | 'revenue' | 'audit';

const KIND_ICON: Record<string, React.ReactNode> = {
  generation: <Sparkles className="w-3.5 h-3.5" />,
  ai: <Activity className="w-3.5 h-3.5" />,
  signup: <UserPlus className="w-3.5 h-3.5" />,
  subscription: <CreditCard className="w-3.5 h-3.5" />,
  purchase: <Receipt className="w-3.5 h-3.5" />,
  issue: <LifeBuoy className="w-3.5 h-3.5" />,
  margin: <ShieldAlert className="w-3.5 h-3.5" />,
  admin: <Wrench className="w-3.5 h-3.5" />,
};

const SEVERITY_TONE: Record<string, string> = {
  error: 'text-red-300 border-red-500/40 bg-red-500/10',
  warn: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
  info: 'text-zinc-400 border-line bg-card',
};

const KINDS = ['all', 'generation', 'ai', 'signup', 'subscription', 'purchase', 'issue', 'margin', 'admin'];

export function MonitorView() {
  const [pane, setPane] = useState<Pane>('feed');
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [purchases, setPurchases] = useState<CreditPurchase[]>([]);
  const [revenue, setRevenue] = useState({ mrr: 0, arr: 0, live: 0, packUSD: 0, creditsSold: 0 });
  const [kind, setKind] = useState('all');
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(true);

  const load = useCallback(async () => {
    const [act, aud, sub, pur] = await Promise.all([
      fetchActivity(150, kind),
      fetchAudit(150),
      fetchSubscriptions(),
      fetchPurchases(),
    ]);
    setActivity(act?.activity ?? []);
    setAudit(aud?.audit ?? []);
    setSubs(sub?.subscriptions ?? []);
    setPurchases(pur?.purchases ?? []);
    setRevenue({
      mrr: sub?.mrr ?? 0,
      arr: sub?.arr ?? 0,
      live: sub?.live ?? 0,
      packUSD: pur?.revenueUSD ?? 0,
      creditsSold: pur?.creditsSold ?? 0,
    });
    setLoading(false);
  }, [kind]);

  useEffect(() => {
    load();
  }, [load]);

  // Live mode polls; it is opt-out because an operator watching an incident
  // should not have to keep clicking refresh.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [live, load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {(['feed', 'revenue', 'audit'] as Pane[]).map(p => (
          <button
            key={p}
            onClick={() => setPane(p)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
              pane === p
                ? 'bg-brand-500/15 text-brand-400 border border-brand-500/30'
                : 'text-zinc-400 hover:text-white border border-transparent'
            }`}
          >
            {p === 'feed' ? 'Live activity' : p === 'revenue' ? 'Revenue' : 'Audit trail'}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setLive(v => !v)}
          className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 ${
            live ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' : 'bg-card border-line text-zinc-400'
          }`}
        >
          {live ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          {live ? 'Live · 15s' : 'Paused'}
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-zinc-400 py-6">
          <Loader2 className="w-4 h-4 animate-spin text-brand-400" /> Loading platform activity…
        </div>
      )}

      {/* ------------------------------------------------------------- feed */}
      {pane === 'feed' && !loading && (
        <>
          <div className="rounded-2xl bg-panel border border-line p-4 flex flex-wrap items-center gap-2">
            {KINDS.map(k => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold capitalize transition-colors ${
                  kind === k
                    ? 'bg-brand-500/15 text-brand-300 border border-brand-500/40'
                    : 'bg-card border border-line text-zinc-400 hover:text-white'
                }`}
              >
                {k}
              </button>
            ))}
            <div className="flex-1" />
            <ExportMenu dataset="activity" label="Export feed" />
          </div>

          <Panel title={`${activity.length} events`}>
            {activity.length === 0 ? (
              <p className="text-xs text-zinc-400 py-4">Nothing recorded for this filter yet.</p>
            ) : (
              <div className="space-y-1.5">
                {activity.map((a, i) => (
                  <div
                    key={`${a.at}-${i}`}
                    className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border ${
                      SEVERITY_TONE[a.severity] ?? SEVERITY_TONE.info
                    }`}
                  >
                    <span className="mt-0.5 shrink-0">{KIND_ICON[a.kind] ?? <Activity className="w-3.5 h-3.5" />}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-white font-semibold truncate">{a.title}</p>
                      {a.detail && <p className="text-[11px] text-zinc-400 truncate">{a.detail}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[11px] text-zinc-300 block">{a.userName || a.userId || '—'}</span>
                      <span className="text-[10px] text-zinc-500 block" title={dateTime(a.at)}>{timeAgo(a.at)}</span>
                    </div>
                    {a.amountUSD !== 0 && (
                      <span className={`text-[11px] font-mono shrink-0 w-20 text-right ${a.amountUSD < 0 ? 'text-red-300' : 'text-zinc-300'}`}>
                        {usd(a.amountUSD)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}

      {/* ---------------------------------------------------------- revenue */}
      {pane === 'revenue' && !loading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="MRR" value={usd(revenue.mrr)} sub={`${revenue.live} live subscriptions`} accent="text-emerald-400" />
            <Stat label="ARR" value={usd(revenue.arr)} sub="run rate" accent="text-white" />
            <Stat label="Credit pack revenue" value={usd(revenue.packUSD)} sub={`${num(revenue.creditsSold)} credits sold`} accent="text-purple-400" />
            <Stat label="Subscriptions on record" value={num(subs.length)} sub="including cancelled" accent="text-brand-400" />
          </div>

          <Panel
            title="Subscriptions"
            action={<ExportMenu dataset="subscriptions" label="Export" />}
          >
            <Table
              minWidth={820}
              empty="No subscriptions yet."
              head={['Customer', 'Plan', 'Status', 'Monthly', 'Started', 'Renews', 'Provider', 'Cancelled']}
              rows={subs.map(s => [
                <div key="c">
                  <span className="text-white font-semibold block">{s.userName || s.userId}</span>
                  <span className="text-[10px] text-zinc-400">{s.email}</span>
                </div>,
                s.plan,
                <Badge
                  key="s"
                  label={s.status.replace('_', ' ')}
                  tone={
                    s.status === 'active'
                      ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
                      : s.status === 'canceled'
                        ? 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30'
                        : 'text-amber-300 bg-amber-500/10 border-amber-500/30'
                  }
                />,
                <span key="m" className="font-mono">{usd(s.monthlyUSD)}</span>,
                shortDate(s.startedAt),
                s.periodEnd ? shortDate(s.periodEnd) : '—',
                s.provider,
                s.canceledAt ? `${shortDate(s.canceledAt)} — ${s.cancelReason}` : '—',
              ])}
            />
          </Panel>

          <Panel
            title="Credit pack purchases"
            action={<ExportMenu dataset="purchases" label="Export" />}
          >
            <Table
              minWidth={720}
              empty="No credit packs sold yet."
              head={['Customer', 'Pack', 'Credits', 'Amount', 'Status', 'Provider', 'When']}
              rows={purchases.map(p => [
                <div key="c">
                  <span className="text-white font-semibold block">{p.userName || p.userId}</span>
                  <span className="text-[10px] text-zinc-400">{p.email}</span>
                </div>,
                p.packId,
                <span key="cr" className="font-mono">{num(p.credits)}</span>,
                <span key="a" className="font-mono">{usd(p.amountUSD)}</span>,
                <Badge
                  key="s"
                  label={p.status}
                  tone={
                    p.status === 'paid'
                      ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
                      : 'text-amber-300 bg-amber-500/10 border-amber-500/30'
                  }
                />,
                p.provider,
                dateTime(p.createdAt),
              ])}
            />
          </Panel>
        </>
      )}

      {/* ------------------------------------------------------------ audit */}
      {pane === 'audit' && !loading && (
        <Panel
          title={`Admin audit trail — ${audit.length} actions`}
          action={<ExportMenu dataset="audit" label="Export" />}
        >
          <p className="text-[11px] text-zinc-400 -mt-1">
            Every privileged action: plan changes, suspensions, credit grants, refunds, issue
            triage and data exports. Recorded whether taken from this panel or the API.
          </p>
          <Table
            minWidth={760}
            empty="No admin actions recorded yet."
            head={['When', 'Actor', 'Action', 'Target', 'Detail']}
            rows={audit.map(a => [
              <span key="w" className="whitespace-nowrap text-zinc-300" title={dateTime(a.createdAt)}>
                {timeAgo(a.createdAt)}
              </span>,
              <span key="a" className="font-semibold text-white">{a.actor}</span>,
              <span key="c" className="font-mono text-brand-300">{a.action}</span>,
              <span key="t" className="font-mono text-[11px] text-zinc-400">
                {a.targetType}{a.targetId ? ` · ${a.targetId}` : ''}
              </span>,
              <span key="d" className="text-zinc-300">{a.detail || '—'}</span>,
            ])}
          />
        </Panel>
      )}
    </div>
  );
}
