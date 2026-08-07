'use client';

import React, { useEffect, useState } from 'react';
import {
  BusinessOverview,
  ModelSpend,
  UserEconomics,
  Operation,
  MarginAlert,
  RateCardRow,
  PlanRow,
  fetchBusiness,
  fetchModelSpend,
  fetchUserEconomics,
  fetchOperations,
  fetchMarginAlerts,
  fetchRateCard,
  fetchAdminPlans,
} from '@/lib/api';
import { Panel, Stat, Row, CostBar, Chip, Table, usd, num, fmt } from '@/components/ui';

// ---------------------------------------------------------------------------
// The operator's screen. Every panel here answers a question the old panel
// could not: am I profitable, on whom am I losing money, what is generation
// costing, and is anything priced below cost right now.
// ---------------------------------------------------------------------------

type Tab = 'business' | 'models' | 'users' | 'operations' | 'pricing';

const TABS: { id: Tab; label: string }[] = [
  { id: 'business', label: 'Business Health' },
  { id: 'models', label: 'Model Spend' },
  { id: 'users', label: 'Customer Profitability' },
  { id: 'operations', label: 'Live Operations' },
  { id: 'pricing', label: 'Pricing & Rate Card' },
];

export function EconomicsDashboard() {
  const [tab, setTab] = useState<Tab>('business');
  const [biz, setBiz] = useState<BusinessOverview | null>(null);
  const [models, setModels] = useState<ModelSpend[]>([]);
  const [users, setUsers] = useState<UserEconomics[]>([]);
  const [ops, setOps] = useState<Operation[]>([]);
  const [alerts, setAlerts] = useState<MarginAlert[]>([]);
  const [rates, setRates] = useState<Awaited<ReturnType<typeof fetchRateCard>>>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [b, m, u, o, a, r, p] = await Promise.all([
        fetchBusiness(),
        fetchModelSpend(),
        fetchUserEconomics(),
        fetchOperations(100),
        fetchMarginAlerts(),
        fetchRateCard(),
        fetchAdminPlans(),
      ]);
      if (cancelled) return;
      if (b) setBiz(b);
      if (m) setModels(m.models ?? []);
      if (u) setUsers(u.users ?? []);
      if (o) setOps(o.operations ?? []);
      if (a) setAlerts(a.alerts ?? []);
      if (r) setRates(r);
      if (p) setPlans(p.plans ?? []);
      setLoading(false);
    };
    load();
    // Operations and margin drift are time-sensitive; refresh while open.
    const timer = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (loading) {
    return (
      <div className="p-8 text-sm text-zinc-400">Loading business metrics…</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Margin alerts are never buried behind a tab — they mean money is
          actively leaking. */}
      {alerts.length > 0 && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 space-y-2">
          <h3 className="text-sm font-bold text-red-300">
            {alerts.length} margin alert{alerts.length === 1 ? '' : 's'} — a model is priced at or below vendor cost
          </h3>
          <ul className="space-y-1">
            {alerts.slice(0, 4).map(a => (
              <li key={a.id} className="text-[11px] text-red-200 font-mono">
                {a.model}: {a.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2 border-b border-line pb-2 overflow-x-auto scrollbar-none">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === t.id
                ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                : 'text-zinc-400 hover:text-white border border-transparent'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'business' && biz && <BusinessTab biz={biz} />}
      {tab === 'models' && <ModelsTab models={models} />}
      {tab === 'users' && <UsersTab users={users} />}
      {tab === 'operations' && <OperationsTab ops={ops} />}
      {tab === 'pricing' && <PricingTab rates={rates} plans={plans} />}
    </div>
  );
}

// --------------------------------------------------------------- business ---

function BusinessTab({ biz }: { biz: BusinessOverview }) {
  const healthy = biz.health === 'healthy';
  return (
    <div className="space-y-5">
      <div
        className={`rounded-xl border p-4 ${
          healthy
            ? 'border-emerald-500/30 bg-emerald-500/10'
            : 'border-brand-500/40 bg-brand-500/10'
        }`}
      >
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-300">
          Status — period from {biz.periodStart}
        </span>
        <p className={`text-sm font-bold mt-1 ${healthy ? 'text-emerald-300' : 'text-brand-300'}`}>
          {biz.health}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="MRR" value={usd(biz.mrr)} accent="text-brand-300" />
        <Stat label="Total cost" value={usd(biz.totalCostUSD)} accent="text-zinc-200" />
        <Stat label="Gross profit" value={usd(biz.grossProfitUSD)} accent="text-emerald-400" />
        <Stat
          label="Gross margin"
          value={`${biz.grossMarginPct.toFixed(1)}%`}
          accent={biz.grossMarginPct >= 70 ? 'text-emerald-400' : 'text-brand-400'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Where the money goes">
          <CostBar
            label="Media generation (metered)"
            value={biz.mediaCostUSD}
            total={biz.totalCostUSD}
            color="bg-brand-500"
          />
          <CostBar
            label="Text — captions, blogs, analysis (subscription-covered)"
            value={biz.textCostUSD}
            total={biz.totalCostUSD}
            color="bg-cyan-500"
          />
          <CostBar
            label="Failed generations absorbed"
            value={biz.failureCostUSD}
            total={biz.totalCostUSD}
            color="bg-red-500"
          />
          <p className="text-[11px] text-zinc-400 pt-2 leading-relaxed">
            Text is never billed to customers — it is a fixed cost of the
            subscription. Only image and video consume credits.
          </p>
        </Panel>

        <Panel title="Credit flow">
          <Row label="Granted this period" value={num(biz.creditsGranted)} />
          <Row label="Purchased (top-ups)" value={num(biz.creditsPurchased)} />
          <Row label="Consumed" value={num(biz.creditsCharged)} />
          <Row label="Held by in-flight jobs" value={num(biz.creditsHeld)} />
          <div className="pt-2 mt-2 border-t border-line">
            <Row
              label="Outstanding liability"
              value={`${num(biz.creditLiability)} cr`}
              hint="Unspent credits customers can still redeem — real future cost"
              strong
            />
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Paid subscribers" value={String(biz.paidSubscribers)} />
        <Stat label="Free users" value={String(biz.freeUsers)} />
        <Stat
          label="Generation failure rate"
          value={`${biz.failureRatePct.toFixed(1)}%`}
          accent={biz.failureRatePct > 20 ? 'text-red-400' : 'text-zinc-200'}
        />
        <Stat
          label="Users over allowance"
          value={String(biz.usersOverAllowance)}
          accent={biz.usersOverAllowance > 0 ? 'text-brand-400' : 'text-zinc-200'}
        />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- models ---

function ModelsTab({ models }: { models: ModelSpend[] }) {
  const media = models.filter(m => m.modality !== 'text');
  const text = models.filter(m => m.modality === 'text');

  return (
    <div className="space-y-5">
      <Panel title="Metered generation — image & video">
        <Table
          head={['Model', 'Type', 'Ops', 'Units', 'Vendor cost', 'Billed', 'Margin']}
          rows={media.map(m => [
            <span key="m" className="font-semibold text-white">{m.model}</span>,
            m.modality,
            String(m.operations),
            `${fmt(m.units)} ${m.unitKind}`,
            usd(m.vendorCostUSD),
            usd(m.billableUSD),
            <span
              key="g"
              className={m.marginPct >= 60 ? 'text-emerald-400' : 'text-brand-400'}
            >
              {m.marginPct.toFixed(1)}%
            </span>,
          ])}
          empty="No generation yet this period."
        />
      </Panel>

      <Panel title="Subscription-covered text — cost only, never billed">
        <Table
          head={['Model', 'Calls', 'Tokens', 'Vendor cost']}
          rows={text.map(m => [
            <span key="m" className="font-semibold text-white">{m.model}</span>,
            String(m.operations),
            fmt(m.units),
            usd(m.vendorCostUSD),
          ])}
          empty="No text usage yet this period."
        />
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------------ users ---

function UsersTab({ users }: { users: UserEconomics[] }) {
  const unprofitable = users.filter(u => u.flag === 'unprofitable');

  return (
    <div className="space-y-4">
      {unprofitable.length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
          <p className="text-xs font-bold text-red-300">
            {unprofitable.length} customer{unprofitable.length === 1 ? '' : 's'} currently cost more than they pay
          </p>
        </div>
      )}

      <Panel title="Per-customer profitability this period">
        <Table
          head={['Customer', 'Plan', 'Revenue', 'Credits used', 'Media $', 'Text $', 'Profit', 'Margin']}
          rows={users.map(u => [
            <div key="n">
              <span className="font-semibold text-white">{u.name}</span>
              {u.flag && (
                <span
                  className={`ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                    u.flag === 'unprofitable'
                      ? 'bg-red-500/20 text-red-300'
                      : 'bg-brand-500/20 text-brand-300'
                  }`}
                >
                  {u.flag}
                </span>
              )}
              <span className="block text-[10px] text-zinc-400">
                {fmt(u.videoSeconds)}s video · {fmt(u.images)} images · {u.operations} ops
              </span>
            </div>,
            u.plan,
            usd(u.monthlyUSD),
            <span key="c">
              {num(u.creditsUsed)}
              <span className="text-zinc-400"> / {num(u.includedCredits)}</span>
              <span
                className={`block text-[10px] ${
                  u.utilizationPct > 90 ? 'text-brand-400' : 'text-zinc-400'
                }`}
              >
                {u.utilizationPct.toFixed(0)}% used
              </span>
            </span>,
            usd(u.mediaCostUSD),
            usd(u.textCostUSD),
            <span key="p" className={u.profitUSD >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {usd(u.profitUSD)}
            </span>,
            <span key="m" className={u.marginPct >= 60 ? 'text-emerald-400' : 'text-brand-400'}>
              {u.monthlyUSD > 0 ? `${u.marginPct.toFixed(0)}%` : '—'}
            </span>,
          ])}
          empty="No customers yet."
        />
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------- operations ---

function OperationsTab({ ops }: { ops: Operation[] }) {
  return (
    <Panel title="Generation operations — estimate vs actual">
      <p className="text-[11px] text-zinc-400 mb-3 leading-relaxed">
        Every job is priced twice: once to reserve credits, once against the units
        the provider actually returned. A gap between the two columns is the money
        a flat per-job charge would have lost.
      </p>
      <Table
        head={['When', 'Customer', 'Model', 'State', 'Est → actual', 'Charged', 'Vendor', 'Margin']}
        rows={ops.map(o => [
          <span key="t" className="font-mono text-[10px] text-zinc-400">
            {o.createdAt?.slice(5, 16)}
          </span>,
          <span key="u" className="font-mono text-[10px]">{o.userId}</span>,
          <div key="m">
            <span className="font-semibold text-white">{o.model}</span>
            <span className="block text-[10px] text-zinc-400">{o.modality}</span>
          </div>,
          <StateBadge key="s" state={o.state} />,
          <span key="e" className="font-mono text-[11px]">
            {fmt(o.estUnits)} → {fmt(o.actualUnits)} {o.unitKind}
            {o.actualUnits > o.estUnits && (
              <span className="block text-[10px] text-brand-400">
                +{fmt(o.actualUnits - o.estUnits)} over estimate
              </span>
            )}
          </span>,
          `${num(o.chargedCredits)} cr`,
          usd(o.actualVendorUSD),
          <span key="g" className={o.marginUSD >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            {usd(o.marginUSD)}
          </span>,
        ])}
        empty="No operations recorded yet."
      />
    </Panel>
  );
}

function StateBadge({ state }: { state: string }) {
  const tone =
    state === 'committed'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : state === 'reserved'
      ? 'bg-brand-500/15 text-brand-300 border-brand-500/30'
      : state === 'failed'
      ? 'bg-red-500/15 text-red-300 border-red-500/30'
      : 'bg-card text-zinc-400 border-line';
  return (
    <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${tone}`}>
      {state}
    </span>
  );
}

// ---------------------------------------------------------------- pricing ---

function PricingTab({
  rates,
  plans,
}: {
  rates: Awaited<ReturnType<typeof fetchRateCard>>;
  plans: PlanRow[];
}) {
  return (
    <div className="space-y-5">
      {rates && (
        <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 p-3">
          <p className="text-[11px] text-brand-200 leading-relaxed">{rates.warning}</p>
        </div>
      )}

      <Panel title="Plan economics — worst case is 100% allowance burn">
        <Table
          head={['Plan', 'Price', 'Subs', 'Credits', 'Max cost', 'Worst margin', 'What it buys']}
          rows={plans.map(p => [
            <span key="n" className="font-semibold text-white">{p.plan.name}</span>,
            usd(p.plan.monthlyUSD),
            String(p.subscribers),
            num(p.plan.includedCredits),
            usd(p.economics.maxTotalCostUSD),
            <span
              key="m"
              className={
                p.economics.worstCaseMarginPct >= 70
                  ? 'text-emerald-400'
                  : p.economics.worstCaseMarginPct > 0
                  ? 'text-brand-400'
                  : 'text-red-400'
              }
            >
              {p.plan.monthlyUSD > 0 ? `${p.economics.worstCaseMarginPct.toFixed(0)}%` : '—'}
            </span>,
            <span key="b" className="text-[10px] text-zinc-300">
              {p.economics.budgetClipsIncluded} budget clips ·{' '}
              {p.economics.premiumClipsIncluded} premium ·{' '}
              {p.economics.imagesIncluded} images
            </span>,
          ])}
          empty="No plans configured."
        />
      </Panel>

      {rates && (
        <Panel
          title={`Live rate card — ${rates.models.length} models · 1 credit = ${usd(
            rates.creditValueUSD
          )} retail · ${usd(rates.blendedCostPerCredit)} cost`}
        >
          <div className="flex flex-wrap gap-2 mb-3 text-[10px] font-mono">
            <Chip>image markup {rates.markups.image}x</Chip>
            <Chip>video markup {rates.markups.video}x</Chip>
            <Chip>failure allowance {(rates.markups.failureAllowance * 100).toFixed(0)}%</Chip>
            <Chip>floor {rates.minMarkup}x</Chip>
          </div>
          <Table
            head={['Model', 'Provider', 'Reference unit', 'Vendor', 'Credits', 'Margin', 'Verified']}
            rows={[...rates.models]
              .sort((a, b) => a.modality.localeCompare(b.modality) || b.vendorUSD - a.vendorUSD)
              .map(m => [
                <div key="m">
                  <span className="font-semibold text-white">{m.model}</span>
                  <span className="block text-[10px] text-zinc-400">{m.modality}</span>
                </div>,
                m.provider,
                <span key="u" className="text-[10px] text-zinc-400">{m.vendorUnit}</span>,
                usd(m.vendorUSD),
                m.modality === 'text' ? '—' : num(m.credits),
                m.modality === 'text' ? (
                  <span key="t" className="text-[10px] text-zinc-400">included</span>
                ) : (
                  <span key="g" className="text-emerald-400">{m.marginPct.toFixed(0)}%</span>
                ),
                <span key="v" className="text-[10px] font-mono text-zinc-400">{m.verifiedOn}</span>,
              ])}
            empty="Rate card unavailable."
          />
        </Panel>
      )}
    </div>
  );
}
