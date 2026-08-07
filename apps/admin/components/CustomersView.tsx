'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Search,
  Loader2,
  X,
  Ban,
  RotateCcw,
  CreditCard,
  Receipt,
  StickyNote,
  ExternalLink,
} from 'lucide-react';
import {
  Customer,
  CustomerDetail,
  SegmentCounts,
  fetchCustomers,
  fetchCustomerDetail,
  fetchSegments,
  suspendUser,
  reactivateUser,
  setSubscription,
  cancelSubscription,
  grantCreditPack,
  refundPurchase,
  setAdminNote,
} from '@/lib/api';
import { Panel, Stat, Table, Badge, usd, num, timeAgo, shortDate, dateTime } from '@/components/ui';
import { ExportMenu } from '@/components/ExportMenu';

// ---------------------------------------------------------------------------
// Customers.
//
// The segment strip at the top is the navigation: every number is a filter, so
// "who is paying me" is one click rather than a mental join across three tabs.
// Registered / active / paying are kept visually distinct because conflating
// them is how a dashboard flatters its owner.
// ---------------------------------------------------------------------------

const SEGMENTS: { id: string; label: string; hint: string }[] = [
  { id: 'all', label: 'All', hint: 'every registered account' },
  { id: 'active', label: 'Active', hint: 'seen in the last 30 days' },
  { id: 'active_today', label: 'Active today', hint: 'seen in the last 24 hours' },
  { id: 'paying', label: 'Paying', hint: 'subscription or credit pack' },
  { id: 'subscribers', label: 'Subscribers', hint: 'live recurring subscription' },
  { id: 'credit_buyers', label: 'Credit buyers', hint: 'bought at least one pack' },
  { id: 'free', label: 'Free', hint: 'never paid' },
  { id: 'trialing', label: 'Trialing', hint: 'in trial' },
  { id: 'past_due', label: 'Past due', hint: 'payment failed' },
  { id: 'churned', label: 'Churned', hint: 'cancelled, none live' },
  { id: 'dormant', label: 'Dormant', hint: 'no activity in 30 days' },
  { id: 'suspended', label: 'Suspended', hint: 'switched off by an operator' },
  { id: 'at_risk', label: 'At risk', hint: 'unprofitable or going quiet' },
];

const PLANS = ['free', 'solo', 'creator', 'business', 'agency'];
const PACKS = ['pack-1k', 'pack-5k', 'pack-15k'];

const FLAG_TONE: Record<string, string> = {
  unprofitable: 'text-red-300 bg-red-500/10 border-red-500/30',
  'at-risk': 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  watch: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30',
  suspended: 'text-zinc-300 bg-zinc-500/10 border-zinc-500/30',
};

const SEGMENT_TONE: Record<string, string> = {
  subscriber: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  credit_buyer: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30',
  trialing: 'text-brand-300 bg-brand-500/10 border-brand-500/30',
  past_due: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  churned: 'text-red-300 bg-red-500/10 border-red-500/30',
  suspended: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30',
  free: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30',
};

export function CustomersView() {
  const [segments, setSegments] = useState<SegmentCounts | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [segment, setSegment] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [seg, list] = await Promise.all([fetchSegments(), fetchCustomers(segment, query, sort)]);
    setSegments(seg);
    setCustomers(list?.customers ?? []);
    setLoading(false);
  }, [segment, query, sort]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5">
      {/* Segment KPIs — each one is a filter */}
      {segments && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
            <Stat
              label="Registered"
              value={num(segments.registered)}
              sub={`+${segments.newThisWeek} this week`}
              accent="text-white"
              active={segment === 'all'}
              onClick={() => setSegment('all')}
            />
            <Stat
              label="Active (30d)"
              value={num(segments.active30d)}
              sub={`${segments.activeToday} today · ${segments.active7d} this week`}
              accent="text-cyan-400"
              active={segment === 'active'}
              onClick={() => setSegment('active')}
            />
            <Stat
              label="Paying"
              value={num(segments.paying)}
              sub={`${segments.paidConversionPct}% of registered`}
              accent="text-emerald-400"
              active={segment === 'paying'}
              onClick={() => setSegment('paying')}
            />
            <Stat
              label="Subscribers"
              value={num(segments.subscribers)}
              sub={`${usd(segments.mrr)} MRR`}
              accent="text-brand-400"
              active={segment === 'subscribers'}
              onClick={() => setSegment('subscribers')}
            />
            <Stat
              label="Credit buyers"
              value={num(segments.creditBuyers)}
              sub={`${usd(segments.packRevenueMTD)} packs this month`}
              accent="text-purple-400"
              active={segment === 'credit_buyers'}
              onClick={() => setSegment('credit_buyers')}
            />
            <Stat
              label="Churned"
              value={num(segments.churned)}
              sub={`${segments.churnPct}% churn · ${segments.dormant} dormant`}
              accent="text-red-400"
              active={segment === 'churned'}
              onClick={() => setSegment('churned')}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="MRR" value={usd(segments.mrr)} sub={`${usd(segments.mrr * 12)} ARR`} accent="text-emerald-400" />
            <Stat label="ARPU" value={usd(segments.arpu)} sub="per paying customer" accent="text-white" />
            <Stat
              label="Credit pack revenue"
              value={usd(segments.packRevenueMTD)}
              sub={`${usd(segments.lifetimePackRevenueUSD)} lifetime`}
              accent="text-purple-400"
            />
            <Stat
              label="Free users"
              value={num(segments.freeUsers)}
              sub={`${segments.trialing} trialing · ${segments.pastDue} past due`}
              accent="text-zinc-300"
            />
          </div>
        </>
      )}

      {/* Filters */}
      <div className="rounded-2xl bg-panel border border-line p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {SEGMENTS.map(s => (
            <button
              key={s.id}
              title={s.hint}
              onClick={() => setSegment(s.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                segment === s.id
                  ? 'bg-brand-500/15 text-brand-300 border border-brand-500/40'
                  : 'bg-card border border-line text-zinc-400 hover:text-white'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search name, email, company, country, plan…"
              className="w-full bg-well border border-line rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-zinc-500"
            />
          </div>
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="bg-well border border-line rounded-xl px-3 py-2 text-xs text-white"
          >
            <option value="">Sort: last seen</option>
            <option value="registered">Sort: newest signup</option>
            <option value="spend">Sort: highest spend</option>
            <option value="cost">Sort: highest vendor cost</option>
            <option value="profit">Sort: least profitable</option>
            <option value="issues">Sort: most open issues</option>
          </select>
          <ExportMenu dataset="customers" params={{ segment, q: query }} label="Export customers" />
        </div>
      </div>

      {/* Table */}
      <Panel title={`${customers.length} ${customers.length === 1 ? 'customer' : 'customers'}`}>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-zinc-400 py-6">
            <Loader2 className="w-4 h-4 animate-spin text-brand-400" /> Loading customers…
          </div>
        ) : (
          <Table
            minWidth={1180}
            empty="No customers in this segment."
            head={[
              'Customer', 'Registered', 'Last seen', 'Segment', 'Plan', 'Pays',
              'Lifetime', 'Credits used', 'Balance', 'Vendor cost', 'Profit',
              'Ops', 'Issues', 'Flag',
            ]}
            onRowClick={i => setSelected(customers[i].id)}
            rows={customers.map(c => [
              <div key="c" className="min-w-[180px]">
                <span className="font-semibold text-white block">{c.name}</span>
                <span className="text-[10px] text-zinc-400 block">{c.email || c.id}</span>
                {c.company && <span className="text-[10px] text-zinc-500 block">{c.company}{c.country ? ` · ${c.country}` : ''}</span>}
              </div>,
              <span key="r" className="text-zinc-300 whitespace-nowrap">{shortDate(c.registeredAt)}</span>,
              <span key="s" className={`whitespace-nowrap ${c.activeToday ? 'text-emerald-300' : c.isActive ? 'text-zinc-300' : 'text-zinc-500'}`}>
                {timeAgo(c.lastSeenAt)}
              </span>,
              <Badge key="g" label={c.segment.replace('_', ' ')} tone={SEGMENT_TONE[c.segment] ?? SEGMENT_TONE.free} />,
              <span key="p" className="font-mono text-zinc-300">{c.plan}</span>,
              <span key="m" className={`font-mono ${c.isPaying ? 'text-emerald-300' : 'text-zinc-500'}`}>
                {c.monthlyUSD > 0 ? `${usd(c.monthlyUSD)}/mo` : c.purchaseCount > 0 ? 'packs only' : '—'}
              </span>,
              <span key="l" className="font-mono text-zinc-200">{usd(c.lifetimeUSD)}</span>,
              <span key="u" className="font-mono text-zinc-300">
                {num(c.creditsUsedThisPeriod)}
                <span className="text-zinc-500"> / {num(c.includedCredits)}</span>
              </span>,
              <span key="b" className="font-mono text-zinc-300">{num(c.creditBalance)}</span>,
              <span key="v" className="font-mono text-amber-300">{usd(c.vendorCostUSD)}</span>,
              <span key="pr" className={`font-mono ${c.profitUSD < 0 ? 'text-red-400' : 'text-emerald-300'}`}>
                {usd(c.profitUSD)}
              </span>,
              <span key="o" className="font-mono text-zinc-300">
                {c.operations}
                {c.failedOperations > 0 && <span className="text-red-400"> ({c.failedOperations}✗)</span>}
              </span>,
              <span key="i" className={`font-mono ${c.openIssues > 0 ? 'text-amber-300' : 'text-zinc-500'}`}>
                {c.openIssues > 0 ? `${c.openIssues} open` : '—'}
              </span>,
              c.flag ? <Badge key="f" label={c.flag} tone={FLAG_TONE[c.flag] ?? FLAG_TONE.watch} /> : <span key="f" className="text-zinc-600">—</span>,
            ])}
          />
        )}
      </Panel>

      {selected && (
        <CustomerDrawer
          id={selected}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One customer, everything known about them, plus every operator action.
// ---------------------------------------------------------------------------

function CustomerDrawer({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [plan, setPlan] = useState('creator');
  const [pack, setPack] = useState('pack-1k');

  const load = useCallback(async () => {
    setLoading(true);
    const d = await fetchCustomerDetail(id);
    setDetail(d);
    setNote(d?.adminNotes ?? '');
    if (d?.customer.plan) setPlan(d.customer.plan);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // run wraps every privileged action so the drawer and the list behind it both
  // refresh from the server rather than guessing at the new state.
  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    const res = await fn();
    setBusy('');
    if (res === null) {
      window.alert(`${label} failed — the backend rejected the request.`);
      return;
    }
    await load();
    onChanged();
  };

  const c = detail?.customer;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-3xl h-full bg-ink border-l border-line overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface border-b border-line px-5 py-4 flex items-start justify-between gap-4 z-10">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white truncate">{c?.name ?? id}</h2>
            <p className="text-[11px] text-zinc-400 truncate">
              {c?.email || '—'} · {c?.id} · registered {shortDate(c?.registeredAt ?? '')}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-raised text-zinc-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-xs text-zinc-400 p-6">
            <Loader2 className="w-4 h-4 animate-spin text-brand-400" /> Loading account…
          </div>
        )}

        {!loading && !detail && (
          <p className="p-6 text-xs text-zinc-400">Account not found.</p>
        )}

        {detail && c && (
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Lifetime value" value={usd(c.lifetimeUSD)} accent="text-emerald-400" />
              <Stat label="Vendor cost" value={usd(c.vendorCostUSD)} accent="text-amber-400" />
              <Stat label="Profit" value={usd(c.profitUSD)} accent={c.profitUSD < 0 ? 'text-red-400' : 'text-emerald-400'} />
              <Stat label="Credit balance" value={num(c.creditBalance)} sub={`${num(detail.balance?.held ?? 0)} held`} accent="text-brand-400" />
            </div>

            {/* Operator actions */}
            <Panel title="Operator actions">
              <div className="flex flex-wrap items-center gap-2">
                {c.status === 'suspended' ? (
                  <button
                    disabled={!!busy}
                    onClick={() => run('Reactivate', () => reactivateUser(c.id))}
                    className="px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Reactivate account
                  </button>
                ) : (
                  <button
                    disabled={!!busy}
                    onClick={() => {
                      const reason = window.prompt('Reason for suspending this account?');
                      if (reason === null) return;
                      run('Suspend', () => suspendUser(c.id, reason));
                    }}
                    className="px-3 py-2 rounded-xl bg-red-500/15 border border-red-500/40 text-red-300 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Ban className="w-3.5 h-3.5" /> Suspend account
                  </button>
                )}

                <div className="flex items-center gap-1.5">
                  <select
                    value={plan}
                    onChange={e => setPlan(e.target.value)}
                    className="bg-well border border-line rounded-xl px-3 py-2 text-xs text-white"
                  >
                    {PLANS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <button
                    disabled={!!busy}
                    onClick={() => run('Change plan', () => setSubscription(c.id, plan))}
                    className="px-3 py-2 rounded-xl bg-card border border-line text-zinc-200 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <CreditCard className="w-3.5 h-3.5" /> Set subscription
                  </button>
                </div>

                {c.subscriptionState && (
                  <button
                    disabled={!!busy}
                    onClick={() => {
                      const reason = window.prompt('Cancellation reason?', 'canceled by operator');
                      if (reason === null) return;
                      run('Cancel subscription', () => cancelSubscription(c.id, reason));
                    }}
                    className="px-3 py-2 rounded-xl bg-card border border-line text-zinc-300 text-xs font-semibold disabled:opacity-50"
                  >
                    Cancel subscription
                  </button>
                )}

                <div className="flex items-center gap-1.5">
                  <select
                    value={pack}
                    onChange={e => setPack(e.target.value)}
                    className="bg-well border border-line rounded-xl px-3 py-2 text-xs text-white"
                  >
                    {PACKS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <button
                    disabled={!!busy}
                    onClick={() => run('Grant credits', () => grantCreditPack(c.id, pack))}
                    className="px-3 py-2 rounded-xl bg-card border border-line text-zinc-200 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Receipt className="w-3.5 h-3.5" /> Grant pack
                  </button>
                </div>
              </div>

              <div className="pt-2 space-y-2">
                <label className="text-[10px] font-mono uppercase font-bold text-zinc-400 flex items-center gap-1.5">
                  <StickyNote className="w-3 h-3" /> Internal note
                </label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={2}
                  placeholder="Anything the next operator should know about this account…"
                  className="w-full bg-well border border-line rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-500"
                />
                <button
                  disabled={!!busy}
                  onClick={() => run('Save note', () => setAdminNote(c.id, note))}
                  className="px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-400 text-ink text-xs font-bold disabled:opacity-50"
                >
                  Save note
                </button>
              </div>

              {busy && (
                <p className="text-[11px] text-brand-300 flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" /> {busy}…
                </p>
              )}
            </Panel>

            <Panel title="Account">
              <Table
                minWidth={420}
                empty=""
                head={['Field', 'Value']}
                rows={[
                  ['Status', <span key="v" className={c.status === 'active' ? 'text-emerald-300' : 'text-red-300'}>{c.status}</span>],
                  ['Segment', c.segment.replace('_', ' ')],
                  ['Plan', c.plan],
                  ['Subscription', c.subscriptionState ? `${c.subscriptionState} since ${shortDate(c.subscribedSince)}` : 'none'],
                  ['Registered', `${shortDate(c.registeredAt)} (${timeAgo(c.registeredAt)})`],
                  ['Last seen', `${dateTime(c.lastSeenAt)} (${timeAgo(c.lastSeenAt)})`],
                  ['Signup source', c.signupSource || '—'],
                  ['Company / country', [c.company, c.country].filter(Boolean).join(' · ') || '—'],
                  ['Credits used this period', `${num(c.creditsUsedThisPeriod)} of ${num(c.includedCredits)} (${c.utilizationPct}%)`],
                  ['AI calls', num(c.aiCalls)],
                ]}
              />
            </Panel>

            <Panel title={`Subscriptions (${detail.subscriptions.length})`}>
              <Table
                minWidth={620}
                empty="This account has never had a subscription."
                head={['Plan', 'Status', 'Monthly', 'Started', 'Period end', 'Provider', 'Cancelled']}
                rows={detail.subscriptions.map(s => [
                  s.plan,
                  <span key="s" className={s.status === 'active' ? 'text-emerald-300' : 'text-zinc-400'}>{s.status}</span>,
                  usd(s.monthlyUSD),
                  shortDate(s.startedAt),
                  shortDate(s.periodEnd),
                  s.provider,
                  s.canceledAt ? `${shortDate(s.canceledAt)} — ${s.cancelReason}` : '—',
                ])}
              />
            </Panel>

            <Panel title={`Credit purchases (${detail.purchases.length})`}>
              <Table
                minWidth={620}
                empty="No credit packs bought."
                head={['Pack', 'Credits', 'Amount', 'Status', 'When', '']}
                rows={detail.purchases.map(p => [
                  p.packId,
                  num(p.credits),
                  usd(p.amountUSD),
                  <span key="s" className={p.status === 'paid' ? 'text-emerald-300' : 'text-amber-300'}>{p.status}</span>,
                  dateTime(p.createdAt),
                  p.status === 'paid' ? (
                    <button
                      key="r"
                      disabled={!!busy}
                      onClick={() => {
                        if (!window.confirm(`Refund ${p.packId} (${usd(p.amountUSD)})? The credits are clawed back from their balance.`)) return;
                        run('Refund', () => refundPurchase(p.id));
                      }}
                      className="text-[11px] text-red-300 hover:text-red-200 font-semibold disabled:opacity-50"
                    >
                      Refund
                    </button>
                  ) : (
                    <span key="r" className="text-zinc-600">—</span>
                  ),
                ])}
              />
            </Panel>

            <Panel title={`Reported issues (${detail.issues.length})`}>
              <Table
                minWidth={620}
                empty="This customer has never reported a problem."
                head={['Severity', 'Subject', 'Category', 'Status', 'When']}
                rows={detail.issues.map(i => [
                  <span key="s" className={i.severity === 'critical' || i.severity === 'high' ? 'text-red-300' : 'text-zinc-300'}>{i.severity}</span>,
                  <span key="j" className="text-white">{i.subject}</span>,
                  i.category,
                  i.status.replace('_', ' '),
                  timeAgo(i.createdAt),
                ])}
              />
            </Panel>

            <Panel title="Credit ledger">
              <Table
                minWidth={620}
                empty="No credit movements."
                head={['When', 'Kind', 'Delta', 'Reason']}
                rows={detail.ledger.slice(0, 25).map(l => [
                  dateTime(l.createdAt),
                  l.kind,
                  <span key="d" className={l.delta < 0 ? 'text-red-300' : 'text-emerald-300'}>
                    {l.delta > 0 ? '+' : ''}{num(l.delta)}
                  </span>,
                  <span key="r" className="text-zinc-400">{l.reason}</span>,
                ])}
              />
            </Panel>

            <Panel title="Recent generation operations">
              <Table
                minWidth={720}
                empty="No image or video generation yet."
                head={['When', 'State', 'Modality', 'Model', 'Credits', 'Vendor cost', 'Margin']}
                rows={detail.operations.slice(0, 20).map(o => [
                  dateTime(o.createdAt),
                  <span key="s" className={o.state === 'failed' ? 'text-red-300' : 'text-zinc-300'}>{o.state}</span>,
                  o.modality,
                  <span key="m" className="font-mono text-[11px]">{o.model}</span>,
                  num(o.chargedCredits),
                  usd(o.actualVendorUSD),
                  <span key="g" className={o.marginUSD < 0 ? 'text-red-300' : 'text-emerald-300'}>{usd(o.marginUSD)}</span>,
                ])}
              />
            </Panel>

            <p className="text-[10px] text-zinc-500 flex items-center gap-1.5">
              <ExternalLink className="w-3 h-3" />
              Every action taken here is written to the admin audit trail.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
