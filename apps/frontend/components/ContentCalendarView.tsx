'use client';

import React, { useMemo, useState } from 'react';
import { CalendarPost, PlatformType } from '@/lib/types';
import { PLATFORM_IDS, platformLabel } from '@/lib/platforms';
import { 
  CalendarDays, 
  Plus, 
  Sparkles, 
  Clock, 
  CheckCircle2, 
  FileText, 
  AlertTriangle, 
  Filter,
  Play,
  Image as ImageIcon,
  Share2,
  Video
} from 'lucide-react';

interface ContentCalendarViewProps {
  posts: CalendarPost[];
  onSelectPost: (post: CalendarPost) => void;
  onOpenCompose: () => void;
  selectedPlatform: PlatformType;
  onSelectPlatform: (platform: PlatformType) => void;
  onOpenRepurpose?: (post: CalendarPost) => void;
}

export function ContentCalendarView({
  posts,
  onSelectPost,
  onOpenCompose,
  selectedPlatform,
  onSelectPlatform,
  onOpenRepurpose
}: ContentCalendarViewProps) {
  const [activeTab, setActiveTab] = useState<'calendar' | 'drafts' | 'gaps'>('calendar');

  const filteredPosts = posts.filter(post => {
    if (selectedPlatform !== 'all' && post.platform !== selectedPlatform) return false;
    return true;
  });

  // The grid used to hardcode "Oct" and render days 13–27 under a Mon–Sun
  // header, so every cell sat in the wrong weekday column. Build the real
  // month instead and pad the leading blanks so the columns line up.
  const { monthLabel, cells } = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const dayCount = new Date(year, month + 1, 0).getDate();
    // getDay() is Sunday-indexed; this grid starts on Monday.
    const leadingBlanks = (new Date(year, month, 1).getDay() + 6) % 7;

    return {
      monthLabel: now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      cells: [
        ...Array.from({ length: leadingBlanks }, () => null),
        ...Array.from({ length: dayCount }, (_, i) => i + 1),
      ] as (number | null)[],
    };
  }, []);

  const todayDate = new Date().getDate();

  return (
    <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6">
      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <CalendarDays className="w-5 h-5 text-brand-400" />
          <h1 className="text-xl font-bold text-white">Visual Content Calendar & Drafts</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Platform Filter */}
          <div className="flex items-center gap-1.5 flex-wrap bg-panel border border-line p-1 rounded-xl text-xs">
            {['all', ...PLATFORM_IDS].map(plat => (
              <button
                key={plat}
                onClick={() => onSelectPlatform(plat)}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  selectedPlatform === plat ? 'bg-brand-500 text-ink shadow-sm' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {platformLabel(plat)}
              </button>
            ))}
          </div>

          <button
            onClick={onOpenCompose}
            className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-ink font-semibold text-xs flex items-center gap-2 shadow-lg shadow-brand-500/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Content</span>
          </button>
        </div>
      </div>

      {/* Mode Selector Tabs */}
      <div className="flex items-center gap-2 border-b border-line pb-2 text-xs overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('calendar')}
          className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-lg font-semibold transition-colors ${
            activeTab === 'calendar' ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Visual Schedule Grid
        </button>
        <button
          onClick={() => setActiveTab('drafts')}
          className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-lg font-semibold transition-colors ${
            activeTab === 'drafts' ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Draft Vault ({posts.filter(p => p.status === 'AI DRAFT' || p.status === 'OPTIMIZING').length})
        </button>
        <button
          onClick={() => setActiveTab('gaps')}
          className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-lg font-semibold transition-colors ${
            activeTab === 'gaps' ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30' : 'text-zinc-400 hover:text-white'
          }`}
        >
          AI Calendar Gap Recommendations
        </button>
      </div>

      {/* Visual Calendar Grid View */}
      {activeTab === 'calendar' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">{monthLabel}</h2>
            <span className="text-[11px] text-zinc-400 font-mono">
              {filteredPosts.length} post{filteredPosts.length === 1 ? '' : 's'} in view
            </span>
          </div>

          {/* The grid is dense; on narrow screens it scrolls as a unit rather
              than crushing seven columns into 40px each. */}
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <div className="min-w-[640px] space-y-2">
              <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-zinc-400 uppercase tracking-wider py-2 bg-panel rounded-xl border border-line">
                <div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div>
              </div>

              <div className="grid grid-cols-7 gap-2">
                {cells.map((day, idx) => {
                  if (day === null) {
                    return <div key={`blank-${idx}`} className="min-h-[120px] rounded-xl bg-ink/40" />;
                  }

                  const dayPosts = filteredPosts.filter(p => p.date === String(day));
                  const isToday = day === todayDate;
                  // A gap is a past day of the current month with nothing published.
                  const isMissed = dayPosts.length === 0 && day < todayDate;

                  return (
                    <div
                      key={day}
                      className={`min-h-[120px] p-2.5 rounded-xl border flex flex-col justify-between gap-1 transition-colors ${
                        dayPosts.length > 0
                          ? 'bg-panel border-brand-500/30 hover:border-brand-500/60'
                          : isMissed
                          ? 'bg-red-500/5 border-red-500/20'
                          : 'bg-surface border-line'
                      } ${isToday ? 'ring-1 ring-brand-500/60' : ''}`}
                    >
                      <div className="flex items-center justify-between text-xs gap-1">
                        <span className={`font-bold ${isToday ? 'text-brand-400' : 'text-zinc-300'}`}>
                          {day}
                        </span>
                        {isMissed && (
                          <span className="text-[9px] font-mono text-red-400 bg-red-500/10 px-1 rounded">
                            GAP
                          </span>
                        )}
                      </div>

                      <div className="space-y-1.5 flex-1">
                        {dayPosts.map(p => (
                          <button
                            key={p.id}
                            onClick={() => onSelectPost(p)}
                            className="w-full p-1.5 rounded-lg bg-card hover:bg-raised border border-line cursor-pointer text-left transition-colors space-y-1"
                          >
                            <div className="flex items-center justify-between text-[10px] gap-1">
                              <span className="font-mono text-brand-400 uppercase font-bold truncate">
                                {p.platform}
                              </span>
                              <span className="text-zinc-400 font-mono shrink-0">{p.time}</span>
                            </div>
                            <p className="text-[11px] font-bold text-white line-clamp-1">{p.title}</p>
                          </button>
                        ))}
                      </div>

                      {dayPosts.length === 0 && (
                        <button
                          onClick={onOpenCompose}
                          aria-label={`Schedule content for day ${day}`}
                          className="text-[10px] text-zinc-400 hover:text-brand-400 flex items-center justify-center gap-1 py-1 rounded bg-well hover:bg-raised border border-line transition-colors"
                        >
                          <Plus className="w-3 h-3" /> Fill
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Draft Vault View */}
      {activeTab === 'drafts' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {posts.filter(p => p.status === 'AI DRAFT' || p.status === 'OPTIMIZING').map(p => (
            <div key={p.id} className="p-4 rounded-xl bg-panel border border-line space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/30 uppercase font-bold">
                  {p.status}
                </span>
                <span className="text-xs text-zinc-400 font-mono">{p.platform}</span>
              </div>
              <h3 className="text-sm font-bold text-white">{p.title}</h3>
              <p className="text-xs text-zinc-300 line-clamp-2">{p.caption}</p>
              <div className="pt-2 flex items-center justify-between border-t border-line">
                <button
                  onClick={() => onSelectPost(p)}
                  className="text-xs font-semibold text-brand-400 hover:underline"
                >
                  Inspect & Optimize AI Score ({p.optimizationScore}/100) &rarr;
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI Gap Recommendations */}
      {activeTab === 'gaps' && (
        <div className="p-5 rounded-2xl bg-panel border border-brand-500/30 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand-400" />
            <h3 className="text-sm font-bold text-white">AI Content Gap Filler Engine</h3>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed">
            Palius AI detected 2 upcoming low-frequency publication windows where your engagement velocity risks dropping by ~14%.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-card border border-line space-y-2">
              <span className="text-[10px] font-mono text-brand-400 uppercase font-bold">Recommended Slot: Oct 17 @ 04:00 PM</span>
              <h4 className="text-xs font-bold text-white">AI Executive Carousel: "5 GPU Compute Bottlenecks"</h4>
              <p className="text-[11px] text-zinc-400">High engagement probability among tech CTOs on LinkedIn.</p>
              <button
                onClick={onOpenCompose}
                className="px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-400 text-ink text-xs font-semibold"
              >
                Auto-fill Slot
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-card border border-line space-y-2">
              <span className="text-[10px] font-mono text-brand-400 uppercase font-bold">Recommended Slot: Oct 22 @ 06:30 PM</span>
              <h4 className="text-xs font-bold text-white">TikTok Short Reel: "Agentic AI Vs Legacy SaaS"</h4>
              <p className="text-[11px] text-zinc-400">Predicted reach spike +22k views based on trending hashtags.</p>
              <button
                onClick={onOpenCompose}
                className="px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-400 text-ink text-xs font-semibold"
              >
                Auto-fill Slot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
