'use client';

import React from 'react';
import { ConnectedAccount, CalendarPost, DirectMessageLead, NavTab } from '@/lib/types';
import { formatPostDay } from '@/lib/date';
import { 
  Users, 
  TrendingUp, 
  Eye, 
  Sparkles, 
  AlertTriangle, 
  ArrowUpRight, 
  CheckCircle2, 
  Share2, 
  Calendar, 
  Bot,
  Zap,
  Activity
} from 'lucide-react';

interface DashboardViewProps {
  posts: CalendarPost[];
  accounts: ConnectedAccount[];
  leads: DirectMessageLead[];
  onNavigate: (tab: NavTab) => void;
}

export function DashboardView({ posts, accounts, leads, onNavigate }: DashboardViewProps) {
  const connectedCount = accounts.filter(a => a.status === 'CONNECTED').length;
  const scheduledCount = posts.filter(p => p.status === 'SCHEDULED').length;
  const highIntentLeads = leads.filter(l => l.purchaseIntentScore >= 80).length;

  // The banner used to greet "Good morning" at any hour and quote counts that
  // disagreed with the cards right below it. Derive both.
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6">
      {/* Welcome banner & AI summary */}
      <div className="rounded-2xl bg-panel p-5 sm:p-6 border border-brand-500/30 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/30 text-brand-400 text-xs font-bold font-mono">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI EMPLOYEE EXECUTIVE SUMMARY</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight text-balance">
              {greeting}, Alex. Palius OS is operational.
            </h1>
            <p className="text-xs text-zinc-300 max-w-2xl leading-relaxed font-medium">
              Your cross-platform reach surged by <strong className="text-emerald-400 font-bold">+24.8%</strong> this week.{' '}
              <strong className="text-brand-400 font-bold">
                {scheduledCount} scheduled post{scheduledCount === 1 ? '' : 's'}
              </strong>{' '}
              {scheduledCount === 1 ? 'is' : 'are'} optimized and queued. The AI DM assistant qualified{' '}
              <strong className="text-emerald-400 font-bold">
                {highIntentLeads} high-intent purchase lead{highIntentLeads === 1 ? '' : 's'}
              </strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => onNavigate('content')}
              className="px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-ink font-bold text-xs flex items-center gap-2 shadow-md transition-all"
            >
              <Calendar className="w-4 h-4 stroke-[2.5]" />
              <span>Manage Content Calendar</span>
            </button>
            <button
              onClick={() => onNavigate('ai-hub')}
              className="px-4 py-2.5 rounded-xl bg-raised hover:bg-raised border border-line-strong text-zinc-200 font-semibold text-xs flex items-center gap-2 transition-all"
            >
              <Bot className="w-4 h-4 text-brand-400" />
              <span>Ask AI Advisor</span>
            </button>
          </div>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-panel border border-line space-y-3">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-semibold">Total Audience</span>
            <Users className="w-4 h-4 text-brand-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-white">2.34M</span>
            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-0.5">
              <ArrowUpRight className="w-3.5 h-3.5" />
              +18.4%
            </span>
          </div>
          <p className="text-[11px] text-zinc-400">
            Across {connectedCount} connected account{connectedCount === 1 ? '' : 's'}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-panel border border-line space-y-3">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-semibold">Monthly Impressions</span>
            <Eye className="w-4 h-4 text-brand-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-white">11.4M</span>
            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-0.5">
              <ArrowUpRight className="w-3.5 h-3.5" />
              +32.1%
            </span>
          </div>
          <p className="text-[11px] text-zinc-400">TikTok & IG leading velocity</p>
        </div>

        <div className="p-4 rounded-xl bg-panel border border-line space-y-3">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-semibold">Qualified Sales Leads</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-white">{leads.length}</span>
            <span className="text-xs font-semibold text-emerald-400 flex items-center gap-0.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              High Intent
            </span>
          </div>
          <p className="text-[11px] text-zinc-400">AI DM purchase detection active</p>
        </div>

        <div className="p-4 rounded-xl bg-panel border border-line space-y-3">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-xs font-semibold">AI Automation Cycle</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-white">98.4%</span>
            <span className="text-xs font-semibold text-cyan-400 font-mono">AUTONOMOUS</span>
          </div>
          <p className="text-[11px] text-zinc-400">Content & auto-reply looping</p>
        </div>
      </div>

      {/* Platform Action Cycle & AI Alerts Grid — `items-start` so neither
          column stretches to match the taller one and leaves dead space. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Continuous Platform Action Cycle */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-panel border border-line space-y-4">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-brand-400" />
                <span>Continuous Platform Action Cycle</span>
              </h3>
              <p className="text-xs text-zinc-400">7-step autonomous feedback loop improving marketing efficiency</p>
            </div>
            <span className="text-[11px] font-mono text-brand-400 px-2 py-0.5 rounded bg-brand-500/10 border border-brand-500/30 font-bold">
              CYCLE #428 ACTIVE
            </span>
          </div>

          {/* Seven steps used to carry seven unrelated hues, which read as a
              rainbow rather than a cycle. Colour now encodes *state* — done,
              running, waiting — so the eye can find the live step. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 pt-2">
            {[
              { step: '1. Plan', status: 'Done', state: 'done' },
              { step: '2. Create', status: 'Active', state: 'active' },
              { step: '3. Publish', status: 'Queued', state: 'idle' },
              { step: '4. Analyze', status: 'Running', state: 'running' },
              { step: '5. Engage', status: '24/7', state: 'running' },
              { step: '6. Learn', status: 'Updating', state: 'running' },
              { step: '7. Improve', status: 'Ready', state: 'idle' },
            ].map((s, idx) => {
              const tone =
                s.state === 'done'
                  ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
                  : s.state === 'active'
                  ? 'text-brand-300 border-brand-500/50 bg-brand-500/15'
                  : s.state === 'running'
                  ? 'text-cyan-300 border-cyan-500/25 bg-cyan-500/10'
                  : 'text-zinc-400 border-line bg-card';
              return (
                <div key={idx} className={`p-2.5 rounded-xl border text-center space-y-1 ${tone}`}>
                  <p className="text-xs font-bold">{s.step}</p>
                  <span className="inline-block text-[9px] font-mono uppercase font-semibold opacity-90">
                    {s.status}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Quick Account Connection Banner */}
          <div className="p-4 rounded-xl bg-card border border-line flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Share2 className="w-5 h-5 text-brand-400" />
              <div>
                <h4 className="text-xs font-bold text-white">Connected Platforms ({connectedCount})</h4>
                <p className="text-[11px] text-zinc-400 capitalize line-clamp-1">
                  {accounts.filter(a => a.status === 'CONNECTED').map(a => a.platform).join(', ') ||
                    'No accounts connected yet'}
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('social-hub')}
              className="px-3.5 py-1.5 rounded-xl bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 text-brand-300 text-xs font-bold transition-all"
            >
              Manage Accounts
            </button>
          </div>
        </div>

        {/* AI Real-time Alerts */}
        <div className="p-5 rounded-2xl bg-panel border border-line space-y-4">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-brand-400" />
              <span>AI System Alerts</span>
            </h3>
            <span className="text-xs text-zinc-400 font-mono">Live Monitor</span>
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-brand-500/10 border border-brand-500/30 space-y-1">
              <div className="flex items-center justify-between text-xs text-brand-300 font-bold">
                <span>Viral Content Spike</span>
                <span className="text-[10px] text-zinc-400 font-mono">10m ago</span>
              </div>
              <p className="text-[11px] text-zinc-300 leading-snug font-medium">
                TikTok Reel "Web3 Future & Decentralized Compute" passed 500k views.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-brand-500/10 border border-brand-500/30 space-y-1">
              <div className="flex items-center justify-between text-xs text-brand-300 font-bold">
                <span>Engagement Drop Alert</span>
                <span className="text-[10px] text-zinc-400 font-mono">1h ago</span>
              </div>
              <p className="text-[11px] text-zinc-300 leading-snug font-medium">
                LinkedIn ethics post retention dropped -14%. Recommendation: Apply high-contrast hook.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
              <div className="flex items-center justify-between text-xs text-emerald-300 font-bold">
                <span>Competitor Surge</span>
                <span className="text-[10px] text-zinc-400 font-mono">3h ago</span>
              </div>
              <p className="text-[11px] text-zinc-300 leading-snug font-medium">
                Vertex AI Labs posted 3D motion graphic reels gaining +8k followers.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming Scheduled Posts Preview */}
      <div className="p-5 rounded-2xl bg-panel border border-line space-y-4">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Calendar className="w-4 h-4 text-brand-400" />
            <span>Upcoming Scheduled Content ({scheduledCount})</span>
          </h3>
          <button
            onClick={() => onNavigate('content')}
            className="text-xs font-bold text-brand-400 hover:underline"
          >
            View Full Calendar &rarr;
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {posts.slice(0, 3).map(post => (
            <div key={post.id} className="p-3.5 rounded-xl bg-card border border-line space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-brand-500/10 border border-brand-500/30 text-brand-400 uppercase font-bold">
                  {post.platform}
                </span>
                <span className="text-xs text-zinc-400 font-mono">{formatPostDay(post.date)} • {post.time}</span>
              </div>
              <h4 className="text-xs font-bold text-white line-clamp-1">{post.title}</h4>
              <p className="text-[11px] text-zinc-400 line-clamp-2">{post.caption}</p>
              <div className="pt-1 flex items-center justify-between border-t border-line text-[10px]">
                <span className="text-emerald-400 font-bold">AI Score: {post.optimizationScore}/100</span>
                <span className="text-zinc-400 font-mono uppercase">{post.type}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
