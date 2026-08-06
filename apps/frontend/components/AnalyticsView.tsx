'use client';

import React, { useEffect, useState } from 'react';
import { CompetitorMetric } from '@/lib/types';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Sparkles, 
  HelpCircle, 
  CheckCircle2, 
  AlertTriangle, 
  Zap, 
  Eye, 
  Share2, 
  Target,
  ArrowUpRight,
  Eye as ViewsIcon,
  Bookmark,
  Clock,
  Loader2,
  MessageSquareText
} from 'lucide-react';
import { fetchPlatformAnalytics, localAnalytics, PlatformAnalytics } from '@/lib/api';
import { PLATFORM_IDS, platformLabel } from '@/lib/platforms';

interface AnalyticsViewProps {
  competitors: CompetitorMetric[];
}

const ANALYTICS_PLATFORMS = PLATFORM_IDS;

export function AnalyticsView({ competitors }: AnalyticsViewProps) {
  const [activeSubtab, setActiveSubtab] = useState<'analytics' | 'competitors' | 'coach' | 'predictor'>('analytics');
  const [activePlatform, setActivePlatform] = useState('tiktok');
  const [platformData, setPlatformData] = useState<PlatformAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchPlatformAnalytics(activePlatform)
      .then((data) => {
        if (!cancelled) setPlatformData(data ?? localAnalytics(activePlatform));
      })
      .catch(() => {
        if (!cancelled) setPlatformData(localAnalytics(activePlatform));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activePlatform]);

  return (
    <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-brand-400" />
            <span>Cross-Platform Analytics, Coach & Competitor Intelligence</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Deep performance diagnostics, competitor public benchmarks, and pre-publish viral prediction engine.
          </p>
        </div>
      </div>

      {/* Subtabs */}
      <div className="flex items-center gap-2 border-b border-line pb-2 text-xs overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveSubtab('analytics')}
          className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-lg font-semibold transition-colors ${
            activeSubtab === 'analytics' ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Analytics Dashboard
        </button>
        <button
          onClick={() => setActiveSubtab('competitors')}
          className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-lg font-semibold transition-colors ${
            activeSubtab === 'competitors' ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Competitor Tracker
        </button>
        <button
          onClick={() => setActiveSubtab('coach')}
          className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-lg font-semibold transition-colors ${
            activeSubtab === 'coach' ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Performance Coach
        </button>
        <button
          onClick={() => setActiveSubtab('predictor')}
          className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-lg font-semibold transition-colors ${
            activeSubtab === 'predictor' ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Viral Predictor
        </button>
      </div>

      {/* 1. Analytics Dashboard View */}
      {activeSubtab === 'analytics' && (
        <div className="space-y-5">
          {/* Platform selector */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-zinc-400 font-mono font-bold uppercase mr-1">Per-Platform Analytics</span>
            {ANALYTICS_PLATFORMS.map((p) => (
              <button
                key={p}
                onClick={() => setActivePlatform(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activePlatform === p ? 'bg-brand-500 text-ink shadow-sm' : 'bg-panel text-zinc-400 hover:text-white border border-line'
                }`}
              >
                {platformLabel(p)}
              </button>
            ))}
          </div>

          {isLoading || !platformData ? (
            <div className="flex items-center justify-center py-16 text-xs text-zinc-400 gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-brand-400" /> Loading {activePlatform} analytics...
            </div>
          ) : (
            <>
              {/* KPI grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard icon={<Users className="w-3.5 h-3.5" />} label="Followers" value={platformData.followers} accent="text-brand-400" />
                <KpiCard icon={<TrendingUp className="w-3.5 h-3.5" />} label="Reach" value={platformData.reach} accent="text-emerald-400" />
                <KpiCard icon={<Eye className="w-3.5 h-3.5" />} label="Impressions" value={platformData.impressions} accent="text-cyan-400" />
                <KpiCard icon={<Zap className="w-3.5 h-3.5" />} label="Engagement Rate" value={platformData.engagementRate} accent="text-brand-400" />
                <KpiCard icon={<ViewsIcon className="w-3.5 h-3.5" />} label="Views" value={platformData.views} accent="text-purple-400" />
                <KpiCard icon={<Bookmark className="w-3.5 h-3.5" />} label="Saves" value={platformData.saves} accent="text-pink-400" />
                <KpiCard icon={<Share2 className="w-3.5 h-3.5" />} label="Shares" value={platformData.shares} accent="text-blue-400" />
                <KpiCard icon={<Clock className="w-3.5 h-3.5" />} label="Best Posting Time" value={platformData.bestPostingTime} accent="text-lime-400" small />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Growth trend */}
                <div className="p-4 rounded-xl bg-panel border border-line">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> 60-Day Follower Growth
                    </h4>
                    <span className="text-[10px] text-zinc-400 font-mono">avg views {platformData.avgViews.toLocaleString()}</span>
                  </div>
                  {/* The bars are sized as a percentage, which only resolves
                      against a parent with a definite height. They previously
                      sat in an auto-height column and collapsed to nothing, so
                      the chart rendered as bare W1–W7 labels. The `flex-1`
                      track below gives them a real box to grow in. */}
                  <div className="flex items-stretch gap-1.5 h-32 mt-4">
                    {platformData.growthTrend.map((v, i) => {
                      const max = Math.max(...platformData.growthTrend, 1);
                      const h = Math.max(4, Math.round((v / max) * 100));
                      return (
                        <div key={i} className="flex-1 min-w-0 flex flex-col items-center gap-1 group">
                          <span className="text-[8px] text-zinc-300 font-mono opacity-0 group-hover:opacity-100 transition-opacity h-3 shrink-0">
                            {v}
                          </span>
                          <div className="flex-1 w-full flex items-end">
                            <div
                              className="w-full rounded-t-md bg-brand-500/70 group-hover:bg-brand-400 transition-colors"
                              style={{ height: `${h}%` }}
                              title={`Week ${i + 1}: ${v.toLocaleString()}`}
                            />
                          </div>
                          <span className="text-[8px] text-zinc-400 font-mono shrink-0">W{i + 1}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Summary + top content */}
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-panel border border-brand-500/30">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-brand-400" />
                      <h4 className="text-xs font-bold text-white">AI Summary for {activePlatform}</h4>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed mt-2">{platformData.summary}</p>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      <span className="px-2 py-1 rounded-lg bg-card border border-line text-[10px] text-zinc-300 font-mono">
                        optimal posting: <span className="text-emerald-400">{platformData.optimalPostCountPerWk}</span>
                      </span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-panel border border-line">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5 mb-2">
                      <MessageSquareText className="w-3.5 h-3.5 text-cyan-400" /> Top Performing Content
                    </h4>
                    <ul className="space-y-2">
                      {platformData.topContent.map((t, i) => (
                        <li key={i} className="text-[11px] text-zinc-300 leading-relaxed flex gap-2">
                          <span className="text-cyan-400 shrink-0">▸</span>
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* 2. Competitor Activity Tracker View */}
      {activeSubtab === 'competitors' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-panel border border-line">
            <h3 className="text-sm font-bold text-white mb-1">Competitor Benchmark Matrix</h3>
            <p className="text-xs text-zinc-400">Public activity monitoring across posting frequency, engagement & best format types.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {competitors.map(comp => (
              <div key={comp.id} className={`p-5 rounded-2xl border space-y-3 ${
                comp.isUser ? 'bg-brand-500/10 border-brand-500/40' : 'bg-panel border-line'
              }`}>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    {comp.brand}
                    {comp.isUser && <span className="px-1.5 py-0.5 rounded bg-brand-500 text-ink text-[9px] font-bold">YOU</span>}
                  </h4>
                  <span className="text-xs font-mono text-emerald-400 font-bold">{comp.engagementRate} ENGAGEMENT</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-line">
                  <div>
                    <span className="text-zinc-400 text-[10px]">Posting Speed</span>
                    <p className="font-bold text-white">{comp.postsPerDay} posts/day</p>
                  </div>
                  <div>
                    <span className="text-zinc-400 text-[10px]">Growth</span>
                    <p className="font-bold text-emerald-400">{comp.growth}</p>
                  </div>
                </div>

                <div className="pt-2 border-t border-line text-xs">
                  <span className="text-zinc-400 text-[10px] block mb-1">Top Performing Content Format</span>
                  <p className="font-bold text-brand-300">{comp.topFormat}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. AI Performance Coach View */}
      {activeSubtab === 'coach' && (
        <div className="p-5 rounded-2xl bg-panel border border-brand-500/30 space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-brand-400" />
            <h3 className="text-sm font-bold text-white">AI Performance Coach Diagnostics</h3>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed">
            Explains exact root causes behind reach spikes and drops.
          </p>

          <div className="space-y-3 text-xs">
            <div className="p-4 rounded-xl bg-card border border-emerald-500/30 space-y-1.5">
              <span className="text-[10px] font-mono text-emerald-400 uppercase font-bold">REASON FOR SURGE (+34.1% TikTok)</span>
              <h4 className="text-xs font-bold text-white">High contrast opening frame + real-time audio sync</h4>
              <p className="text-zinc-300 leading-relaxed">
                92% of viewers stayed past second 3.0. The algorithm pushed the reel into global For You feeds.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-card border border-brand-500/30 space-y-1.5">
              <span className="text-[10px] font-mono text-brand-400 uppercase font-bold">REASON FOR DROP (-14% LinkedIn)</span>
              <h4 className="text-xs font-bold text-white">External link in first comment block</h4>
              <p className="text-zinc-300 leading-relaxed">
                Algorithm suppressed distribution by 14%. Recommendation: Move external links to bio link.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 4. Pre-Publish Performance Predictor */}
      {activeSubtab === 'predictor' && (
        <div className="p-5 rounded-2xl bg-panel border border-line space-y-4">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Pre-Publish Viral Performance Predictor</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div className="p-4 rounded-xl bg-card border border-line">
              <span className="text-[10px] text-zinc-400 font-mono">PREDICTED REACH</span>
              <div className="text-xl font-bold text-white mt-1">450k – 620k</div>
            </div>
            <div className="p-4 rounded-xl bg-card border border-line">
              <span className="text-[10px] text-zinc-400 font-mono">VIRAL SCORE</span>
              <div className="text-xl font-bold text-emerald-400 mt-1">88 / 100</div>
            </div>
            <div className="p-4 rounded-xl bg-card border border-line">
              <span className="text-[10px] text-zinc-400 font-mono">OPTIMAL WINDOW</span>
              <div className="text-xl font-bold text-brand-300 mt-1">05:15 PM</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, accent, small }: { icon: React.ReactNode; label: string; value: string; accent: string; small?: boolean }) {
  return (
    <div className="p-4 rounded-xl bg-panel border border-line space-y-2 min-w-0">
      <span className="text-[10px] text-zinc-400 font-mono uppercase font-bold flex items-center gap-1.5">
        <span className={accent}>{icon}</span> {label}
      </span>
      <div className={`font-extrabold text-white truncate ${small ? 'text-sm' : 'text-xl'}`} title={value}>{value}</div>
    </div>
  );
}
