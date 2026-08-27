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
  Share2,
  Calendar,
  Bot,
  Zap,
  Activity,
} from 'lucide-react';

interface DashboardViewProps {
  posts: CalendarPost[];
  accounts: ConnectedAccount[];
  leads: DirectMessageLead[];
  onNavigate: (tab: NavTab) => void;
}

export function DashboardView({ posts, accounts, leads, onNavigate }: DashboardViewProps) {
  const connectedCount = accounts.filter((a) => a.status === 'CONNECTED').length;
  const scheduledCount = posts.filter((p) => p.status === 'SCHEDULED').length;
  const highIntentLeads = leads.filter((l) => l.purchaseIntentScore >= 80).length;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const metrics = [
    {
      label: 'Total Audience',
      value: '2.34M',
      trend: '+18.4%',
      icon: <Users className="w-5 h-5" />,
      tone: 'text-brand-400 bg-brand-500/10',
      sub: `Across ${connectedCount} connected account${connectedCount === 1 ? '' : 's'}`,
    },
    {
      label: 'Monthly Impressions',
      value: '11.4M',
      trend: '+32.1%',
      icon: <Eye className="w-5 h-5" />,
      tone: 'text-accent-300 bg-accent-500/10',
      sub: 'TikTok & IG leading velocity',
    },
    {
      label: 'Qualified Sales Leads',
      value: String(leads.length),
      trend: 'High intent',
      icon: <TrendingUp className="w-5 h-5" />,
      tone: 'text-emerald-400 bg-emerald-500/10',
      sub: 'AI DM purchase detection active',
    },
    {
      label: 'AI Automation Cycle',
      value: '98.4%',
      trend: 'Autonomous',
      icon: <Activity className="w-5 h-5" />,
      tone: 'text-cyan-300 bg-cyan-500/10',
      sub: 'Content & auto-reply looping',
    },
  ];

  return (
    <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6 animate-fade-in">
      {/* Welcome banner & AI summary */}
      <div className="rounded-3xl bg-panel p-5 sm:p-7 border border-line shadow-card space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/30 text-brand-300 text-[11px] font-bold font-mono">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI EMPLOYEE EXECUTIVE SUMMARY</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight text-balance">
              {greeting}, Alex. Palius OS is operational.
            </h1>
            <p className="text-sm text-fg-muted max-w-2xl leading-relaxed">
              Your cross-platform reach surged by <strong className="text-emerald-400 font-semibold">+24.8%</strong> this week.{' '}
              <strong className="text-brand-300 font-semibold">
                {scheduledCount} scheduled post{scheduledCount === 1 ? '' : 's'}
              </strong>{' '}
              {scheduledCount === 1 ? 'is' : 'are'} optimized and queued. The AI DM assistant qualified{' '}
              <strong className="text-emerald-400 font-semibold">
                {highIntentLeads} high-intent purchase lead{highIntentLeads === 1 ? '' : 's'}
              </strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => onNavigate('content')}
              className="px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-ink font-bold text-xs flex items-center gap-2 shadow-glow transition-all"
            >
              <Calendar className="w-4 h-4 stroke-[2.5]" />
              <span>Manage Content Calendar</span>
            </button>
            <button
              onClick={() => onNavigate('ai-hub')}
              className="px-4 py-2.5 rounded-xl bg-raised hover:bg-raised border border-line-strong text-fg font-semibold text-xs flex items-center gap-2 transition-all"
            >
              <Bot className="w-4 h-4 text-accent-300" />
              <span>Ask AI Advisor</span>
            </button>
          </div>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="p-5 rounded-2xl bg-panel border border-line shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all"
          >
            <div className="flex items-center justify-between">
              <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${m.tone}`}>
                {m.icon}
              </span>
              <span className="chip bg-emerald-500/10 text-emerald-400">{m.trend}</span>
            </div>
            <div className="mt-4 text-2xl font-extrabold text-white tracking-tight">{m.value}</div>
            <div className="mt-1 text-xs font-semibold text-fg-muted">{m.label}</div>
            <p className="mt-2 text-[11px] text-fg-muted/80">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Platform Action Cycle & AI Alerts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Continuous Platform Action Cycle */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-panel border border-line shadow-card space-y-4">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-brand-400" />
                <span>Continuous Platform Action Cycle</span>
              </h3>
              <p className="text-xs text-fg-muted">7-step autonomous feedback loop improving marketing efficiency</p>
            </div>
            <span className="text-[11px] font-mono text-brand-300 px-2 py-0.5 rounded bg-brand-500/10 border border-brand-500/30 font-bold">
              CYCLE #428 ACTIVE
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 pt-1">
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
                  : 'text-fg-muted border-line bg-card';
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
                <p className="text-[11px] text-fg-muted capitalize line-clamp-1">
                  {accounts.filter((a) => a.status === 'CONNECTED').map((a) => a.platform).join(', ') ||
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
        <div className="p-5 rounded-2xl bg-panel border border-line shadow-card space-y-4">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-brand-400" />
              <span>AI System Alerts</span>
            </h3>
            <span className="text-xs text-fg-muted font-mono">Live Monitor</span>
          </div>

          <div className="space-y-3">
            {[
              { c: 'text-brand-300 bg-brand-500/10 border-brand-500/30', title: 'Viral Content Spike', time: '10m ago', body: 'TikTok Reel "Web3 Future & Decentralized Compute" passed 500k views.' },
              { c: 'text-brand-300 bg-brand-500/10 border-brand-500/30', title: 'Engagement Drop Alert', time: '1h ago', body: 'LinkedIn ethics post retention dropped -14%. Apply high-contrast hook.' },
              { c: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30', title: 'Competitor Surge', time: '3h ago', body: 'Vertex AI Labs posted 3D motion graphic reels gaining +8k followers.' },
            ].map((a, i) => (
              <div key={i} className={`p-3 rounded-xl border space-y-1 ${a.c}`}>
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>{a.title}</span>
                  <span className="text-[10px] text-fg-muted font-mono">{a.time}</span>
                </div>
                <p className="text-[11px] text-fg-muted leading-snug">{a.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Upcoming Scheduled Posts Preview */}
      <div className="p-5 rounded-2xl bg-panel border border-line shadow-card space-y-4">
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
          {posts.slice(0, 3).map((post) => (
            <div key={post.id} className="p-4 rounded-xl bg-card border border-line hover:border-line-strong transition-colors space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-brand-500/10 border border-brand-500/30 text-brand-300 uppercase font-bold">
                  {post.platform}
                </span>
                <span className="text-xs text-fg-muted font-mono">{formatPostDay(post.date)} • {post.time}</span>
              </div>
              <h4 className="text-xs font-bold text-white line-clamp-1">{post.title}</h4>
              <p className="text-[11px] text-fg-muted line-clamp-2">{post.caption}</p>
              <div className="pt-2 flex items-center justify-between border-t border-line text-[10px]">
                <span className="text-emerald-400 font-bold">AI Score: {post.optimizationScore}/100</span>
                <span className="text-fg-muted font-mono uppercase">{post.type}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
