'use client';

import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  BarChart3,
  Users as UsersIcon,
  Activity,
  Coins,
  Zap,
  Loader2,
  Clock,
  Pencil,
  X,
  Check,
  AlertTriangle,
  Cpu,
  Flame,
  TrendingUp,
  Server,
  RefreshCw,
} from 'lucide-react';
import {
  fetchAdminOverview,
  fetchAdminUsers,
  fetchAdminUsage,
  fetchAdminUserUsage,
  updateAdminUser,
  AdminOverview,
  AdminUser,
  UsageEvent,
} from '@/lib/api';
import { EconomicsDashboard } from '@/components/EconomicsDashboard';

type SubTab = 'economics' | 'overview' | 'users' | 'usage';

const fmt = (n: number) => n.toLocaleString();

function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function timeAgo(ts: string) {
  if (!ts) return '—';
  const d = new Date(ts.replace(' ', 'T') + (ts.includes('Z') ? '' : 'Z'));
  const diff = Date.now() - d.getTime();
  if (isNaN(diff)) return ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const PLAN_COLORS: Record<string, string> = {
  free: 'text-zinc-300 bg-zinc-500/10 border-zinc-500/30',
  solo: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30',
  creator: 'text-brand-300 bg-brand-500/10 border-brand-500/30',
  business: 'text-purple-300 bg-purple-500/10 border-purple-500/30',
  agency: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
};

const PROVIDER_COLORS: Record<string, string> = {
  gemini: 'bg-blue-500',
  openai: 'bg-emerald-500',
  anthropic: 'bg-brand-500',
  deepseek: 'bg-indigo-500',
  openrouter: 'bg-cyan-500',
  ollama: 'bg-zinc-500',
};

export function AdminPanelView() {
  const [subtab, setSubtab] = useState<SubTab>('economics');
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userEvents, setUserEvents] = useState<UsageEvent[]>([]);
  const [userEventsLoading, setUserEventsLoading] = useState(false);

  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [saveMsg, setSaveMsg] = useState('');

  const loadAll = async () => {
    setLoading(true);
    const [ov, us, ev] = await Promise.all([
      fetchAdminOverview(),
      fetchAdminUsers(),
      fetchAdminUsage(200),
    ]);
    setOverview(ov);
    setUsers(us?.users ?? []);
    setEvents(ev?.events ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const openUserUsage = async (u: AdminUser) => {
    setSelectedUserId(u.id);
    setUserEventsLoading(true);
    const res = await fetchAdminUserUsage(u.id);
    setUserEvents(res?.events ?? []);
    setUserEventsLoading(false);
  };

  const saveUser = async () => {
    if (!editingUser) return;
    setSaveMsg('Saving...');
    const res = await updateAdminUser(editingUser.id, {
      tokenQuota: editingUser.tokenQuota,
      creditQuota: editingUser.creditQuota,
      plan: editingUser.plan,
      status: editingUser.status,
    });
    setSaveMsg(res ? 'Saved.' : 'Backend offline — saved locally only.');
    await loadAll();
    setTimeout(() => setSaveMsg(''), 2000);
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-brand-400" />
            <span>Admin Panel — Usage &amp; Billing Control</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Track every user's AI token usage, credits for image/video generation, quotas, and provider spend.
          </p>
        </div>
        <button
          onClick={loadAll}
          className="px-3 py-2 rounded-xl bg-card hover:bg-raised border border-line text-xs font-semibold text-zinc-300 flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Subtabs */}
      <div className="flex items-center gap-3 border-b border-line pb-2 text-xs">
        {([
          { id: 'economics', label: 'Business & Economics', icon: <Coins className="w-3.5 h-3.5" /> },
          { id: 'overview', label: 'Traffic Overview', icon: <BarChart3 className="w-3.5 h-3.5" /> },
          { id: 'users', label: 'Users & Quotas', icon: <UsersIcon className="w-3.5 h-3.5" /> },
          { id: 'usage', label: 'Usage Log', icon: <Activity className="w-3.5 h-3.5" /> },
        ] as { id: SubTab; label: string; icon: React.ReactNode }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setSubtab(t.id)}
            className={`px-3.5 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
              subtab === t.id ? 'bg-brand-500/15 text-brand-400 border border-brand-500/30' : 'text-zinc-400 hover:text-white'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
        <div className="flex-1" />
        {overview && (
          <span className="text-[10px] text-zinc-500 font-mono">provider: {overview.providers.length} · live ledger (SQLite)</span>
        )}
      </div>

      {loading && !overview && (
        <div className="flex items-center justify-center py-20 text-xs text-zinc-500 gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-brand-400" /> Loading admin data...
        </div>
      )}

      {!loading && !overview && (
        <div className="p-6 rounded-xl bg-panel border border-brand-500/30 text-xs text-zinc-300">
          <p className="flex items-center gap-2 font-semibold text-brand-300"><AlertTriangle className="w-4 h-4" /> Backend not reachable</p>
          <p className="mt-2 leading-relaxed">
            Start the Go backend (<code className="text-brand-300">cd backend &amp;&amp; go run .</code>) to see live usage tracking. The admin panel reads its data from the backend's SQLite ledger.
          </p>
        </div>
      )}

      {/* ============================================================ OVERVIEW */}
      {subtab === 'economics' && <EconomicsDashboard />}

      {subtab === 'overview' && overview && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <Kpi icon={<Coins className="w-3.5 h-3.5" />} label="Total Tokens" value={fmtTokens(overview.totalTokens)} sub={`${fmt(overview.totalTokens)} tokens`} accent="text-brand-400" />
            <Kpi icon={<Flame className="w-3.5 h-3.5" />} label="Credits (image/video)" value={String(overview.totalCredits)} sub="media generation" accent="text-pink-400" />
            <Kpi icon={<Activity className="w-3.5 h-3.5" />} label="Total AI Calls" value={fmt(overview.totalCalls)} sub="all time" accent="text-cyan-400" />
            <Kpi icon={<UsersIcon className="w-3.5 h-3.5" />} label="Active Users" value={String(overview.activeUsers)} sub="across plans" accent="text-emerald-400" />
            <Kpi icon={<Zap className="w-3.5 h-3.5" />} label="Today Tokens" value={fmtTokens(overview.todayTokens)} sub={`${fmt(overview.todayCalls)} calls today`} accent="text-brand-400" />
            <Kpi icon={<TrendingUp className="w-3.5 h-3.5" />} label="Avg/Day" value={fmtTokens(overview.daily.length ? Math.round(overview.totalTokens / overview.daily.length) : 0)} sub="over tracked days" accent="text-blue-400" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Daily usage chart */}
            <div className="p-4 rounded-xl bg-panel border border-line">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-brand-400" /> Daily Token Usage (14d)
                </h4>
                <span className="text-[10px] text-zinc-500 font-mono">tokens / calls per day</span>
              </div>
              <div className="flex items-end gap-1.5 h-32 mt-4">
                {overview.daily.map((d, i) => {
                  const max = Math.max(...overview.daily.map((x) => x.tokens), 1);
                  const h = Math.max(6, Math.round((d.tokens / max) * 100));
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                      <span className="text-[8px] text-zinc-400 font-mono opacity-0 group-hover:opacity-100">{fmtTokens(d.tokens)}</span>
                      <div
                        className="w-full rounded-t-md bg-gradient-to-t from-brand-500/40 to-brand-400/90 group-hover:to-brand-300"
                        style={{ height: `${h}%` }}
                        title={`${d.date}: ${fmt(d.tokens)} tokens · ${d.calls} calls`}
                      />
                      <span className="text-[8px] text-zinc-600 font-mono">{d.date.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Provider breakdown */}
            <div className="p-4 rounded-xl bg-panel border border-line">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-cyan-400" /> Spend by Provider
              </h4>
              <div className="space-y-3 mt-4">
                {overview.providers.map((p) => {
                  const max = Math.max(...overview.providers.map((x) => x.tokens), 1);
                  const pct = Math.round((p.tokens / max) * 100);
                  return (
                    <div key={p.provider}>
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-zinc-300 font-semibold flex items-center gap-1.5">
                          <Cpu className="w-3 h-3 text-zinc-500" /> {p.provider}
                        </span>
                        <span className="text-zinc-400 font-mono">{fmtTokens(p.tokens)} tokens · {p.calls} calls</span>
                      </div>
                      <div className="h-2 rounded-full bg-card overflow-hidden">
                        <div className={`h-full rounded-full ${PROVIDER_COLORS[p.provider] ?? 'bg-brand-500'}`} style={{ width: `${Math.max(4, pct)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ USERS */}
      {subtab === 'users' && (
        <div className="space-y-4">
          <div className="rounded-xl overflow-hidden border border-line bg-panel">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface border-b border-line text-left text-[10px] uppercase tracking-wider text-zinc-400">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Token usage / quota</th>
                  <th className="px-4 py-3">Credits</th>
                  <th className="px-4 py-3">Calls</th>
                  <th className="px-4 py-3">Last active</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const usedPct = u.tokenQuota > 0 ? Math.min(100, Math.round((u.tokensUsed / u.tokenQuota) * 100)) : 0;
                  const overQuota = u.tokensUsed > u.tokenQuota;
                  return (
                    <tr
                      key={u.id}
                      onClick={() => openUserUsage(u)}
                      className="border-b border-line hover:bg-card cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="font-bold text-white">{u.name}</p>
                        <p className="text-[10px] text-zinc-500 font-mono">{u.id}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${PLAN_COLORS[u.plan] ?? PLAN_COLORS.starter}`}>{u.plan}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`flex items-center gap-1.5 text-[10px] font-bold ${u.status === 'active' ? 'text-emerald-400' : 'text-red-400'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${u.status === 'active' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                          {u.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 w-56">
                        <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                          <span className={overQuota ? 'text-red-400' : 'text-zinc-300'}>{fmtTokens(u.tokensUsed)}</span>
                          <span className="text-zinc-500">/ {fmtTokens(u.tokenQuota)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-card overflow-hidden">
                          <div className={`h-full rounded-full ${overQuota ? 'bg-red-500' : usedPct > 70 ? 'bg-brand-500' : 'bg-emerald-500'}`} style={{ width: `${usedPct}%` }} />
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-zinc-300">{u.creditsUsed} / {u.creditQuota}</td>
                      <td className="px-4 py-3 font-mono text-zinc-300">{fmt(u.calls)}</td>
                      <td className="px-4 py-3 text-zinc-400">{timeAgo(u.lastActive)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingUser({ ...u }); }}
                          className="px-2.5 py-1.5 rounded-lg bg-card hover:bg-raised border border-line text-zinc-300 text-[10px] font-semibold flex items-center gap-1 ml-auto"
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Per-user drill-down */}
          {selectedUserId && (
            <div className="rounded-xl border border-cyan-500/30 bg-panel overflow-hidden">
              <div className="px-4 py-3 bg-surface border-b border-line flex items-center justify-between">
                <h4 className="text-xs font-bold text-white flex items-center gap-2">
                  <UsersIcon className="w-3.5 h-3.5 text-cyan-400" /> Usage for {users.find((u) => u.id === selectedUserId)?.name ?? selectedUserId}
                </h4>
                <button onClick={() => setSelectedUserId(null)} className="text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
              </div>
              {userEventsLoading ? (
                <div className="flex items-center justify-center py-10 text-xs text-zinc-500 gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-surface">
                      <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-400 border-b border-line">
                        <th className="px-4 py-2">Time</th>
                        <th className="px-4 py-2">Task</th>
                        <th className="px-4 py-2">Provider / Model</th>
                        <th className="px-4 py-2">In</th>
                        <th className="px-4 py-2">Out</th>
                        <th className="px-4 py-2">Credits</th>
                        <th className="px-4 py-2">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userEvents.map((e) => (
                        <tr key={e.id} className="border-b border-line text-zinc-300">
                          <td className="px-4 py-2 text-zinc-400">{timeAgo(e.createdAt)}</td>
                          <td className="px-4 py-2"><TaskBadge task={e.taskType} /></td>
                          <td className="px-4 py-2 font-mono text-[10px]">{e.provider} · {e.model}</td>
                          <td className="px-4 py-2 font-mono">{e.inputTokens}</td>
                          <td className="px-4 py-2 font-mono">{e.outputTokens}</td>
                          <td className="px-4 py-2 font-mono">{e.creditUnits || '—'}</td>
                          <td className="px-4 py-2 font-mono text-emerald-400">${e.costUSD.toFixed(4)}</td>
                        </tr>
                      ))}
                      {userEvents.length === 0 && (
                        <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-500">No usage events yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ============================================================ USAGE LOG */}
      {subtab === 'usage' && (
        <div className="rounded-xl overflow-hidden border border-line bg-panel">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-surface border-b border-line text-left text-[10px] uppercase tracking-wider text-zinc-400">
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Task</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">Input</th>
                <th className="px-4 py-3">Output</th>
                <th className="px-4 py-3">Credits</th>
                <th className="px-4 py-3 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-line hover:bg-card transition-colors">
                  <td className="px-4 py-2.5 text-zinc-400 whitespace-nowrap">
                    <span className="flex items-center gap-1.5"><Clock className="w-3 h-3" />{timeAgo(e.createdAt)}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-semibold text-white">{e.userName}</span>
                    <span className="text-[9px] text-zinc-500 font-mono ml-1">{e.userId}</span>
                  </td>
                  <td className="px-4 py-2.5"><TaskBadge task={e.taskType} /></td>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${PROVIDER_COLORS[e.provider] ?? 'bg-zinc-500'}`} />
                      <span className="font-mono text-[11px] text-zinc-200">{e.provider}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[10px] text-zinc-400">{e.model}</td>
                  <td className="px-4 py-2.5 font-mono">{fmt(e.inputTokens)}</td>
                  <td className="px-4 py-2.5 font-mono">{fmt(e.outputTokens)}</td>
                  <td className="px-4 py-2.5 font-mono text-pink-400">{e.creditUnits || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-emerald-400 text-right">${e.costUSD.toFixed(4)}</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-zinc-500">No usage events yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ============================================================ EDIT MODAL */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setEditingUser(null)}>
          <div className="w-full max-w-md rounded-2xl bg-surface border border-line p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Pencil className="w-4 h-4 text-brand-400" /> Edit {editingUser.name}
              </h3>
              <button onClick={() => setEditingUser(null)} className="text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-300">Token quota</label>
                <input
                  type="number"
                  value={editingUser.tokenQuota}
                  onChange={(e) => setEditingUser({ ...editingUser, tokenQuota: Number(e.target.value) })}
                  className="w-full bg-well border border-line rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500/50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-300">Credit quota (media)</label>
                <input
                  type="number"
                  value={editingUser.creditQuota}
                  onChange={(e) => setEditingUser({ ...editingUser, creditQuota: Number(e.target.value) })}
                  className="w-full bg-well border border-line rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-300">Plan</label>
                <select
                  value={editingUser.plan}
                  onChange={(e) => setEditingUser({ ...editingUser, plan: e.target.value })}
                  className="w-full bg-well border border-line rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500/50"
                >
                  <option value="starter">starter</option>
                  <option value="pro">pro</option>
                  <option value="enterprise">enterprise</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-300">Status</label>
                <select
                  value={editingUser.status}
                  onChange={(e) => setEditingUser({ ...editingUser, status: e.target.value })}
                  className="w-full bg-well border border-line rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500/50"
                >
                  <option value="active">active</option>
                  <option value="suspended">suspended</option>
                  <option value="trial">trial</option>
                </select>
              </div>
            </div>

            {saveMsg && <p className="text-[11px] text-emerald-400">{saveMsg}</p>}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={() => setEditingUser(null)} className="px-4 py-2 rounded-xl bg-raised hover:bg-raised text-zinc-300 text-xs font-semibold">Cancel</button>
              <button
                onClick={saveUser}
                className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-zinc-950 text-xs font-bold flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" /> Save quota
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="p-4 rounded-xl bg-panel border border-line space-y-1.5">
      <span className={`text-[10px] text-zinc-400 font-mono uppercase font-bold flex items-center gap-1.5`}>
        <span className={accent}>{icon}</span> {label}
      </span>
      <div className="text-2xl font-extrabold text-white">{value}</div>
      <p className="text-[10px] text-zinc-500">{sub}</p>
    </div>
  );
}

function TaskBadge({ task }: { task: string }) {
  const color = task === 'text' ? 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30'
    : task === 'image' ? 'text-pink-300 bg-pink-500/10 border-pink-500/30'
    : 'text-purple-300 bg-purple-500/10 border-purple-500/30';
  return <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${color}`}>{task}</span>;
}
