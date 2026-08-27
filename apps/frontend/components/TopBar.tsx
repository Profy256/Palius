'use client';

import React from 'react';
import { NavTab } from '@/lib/types';
import { USER_AVATAR } from '@/lib/mockData';
import { Search, Bell, Sparkles, ShieldCheck, Plus, Menu, LifeBuoy } from 'lucide-react';

interface TopBarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  unreadDmsCount?: number;
  onCreateContent?: () => void;
  onToggleSidebar?: () => void;
  onReportIssue?: () => void;
}

const TITLES: Record<NavTab, string> = {
  dashboard: 'Executive Command Center',
  content: 'Content Management & Visual Calendar',
  'social-hub': 'Social Account & Browser Connectors',
  engagement: 'Engagement Hub & Auto-Reply',
  dms: 'DM Assistant & Lead Qualification',
  analytics: 'Performance Coach & Competitor Tracker',
  'ai-hub': 'AI Executive Advisor & Studio',
  settings: 'Brand Intelligence & Encryption Settings',
};

export function TopBar({
  currentTab,
  onSelectTab,
  unreadDmsCount = 0,
  onCreateContent,
  onToggleSidebar,
  onReportIssue,
}: TopBarProps) {
  return (
    <header className="h-16 shrink-0 bg-surface/95 glass border-b border-line px-3 sm:px-6 flex items-center justify-between gap-3 sticky top-0 z-20">
      {/* Title & security badge */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onToggleSidebar}
          aria-label="Open navigation"
          className="p-2 -ml-1 rounded-xl text-zinc-300 hover:text-white hover:bg-raised transition-colors lg:hidden shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          <h2 className="text-[15px] font-extrabold text-white tracking-tight truncate leading-none">
            {TITLES[currentTab]}
          </h2>
          <p className="text-[11px] text-fg-muted mt-1 hidden sm:block">Palius Social Media OS</p>
        </div>

        <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold font-mono shrink-0">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>AES-256-GCM SECURED</span>
        </div>
      </div>

      {/* Right tools */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <div className="relative hidden md:block">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" />
          <input
            type="search"
            aria-label="Search posts, drafts and leads"
            placeholder="Search posts, drafts, leads..."
            className="w-44 lg:w-64 bg-well border border-line rounded-xl pl-9 pr-3 py-2 text-xs text-fg placeholder-fg-muted focus:outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/20 transition-all font-medium"
          />
        </div>

        <button
          aria-label={
            unreadDmsCount > 0 ? `Notifications, ${unreadDmsCount} unread` : 'Notifications'
          }
          className="relative p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-raised transition-colors"
        >
          <Bell className="w-5 h-5" />
          {unreadDmsCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-brand-500 text-ink text-[10px] font-bold flex items-center justify-center ring-2 ring-surface">
              {unreadDmsCount}
            </span>
          )}
        </button>

        {/* Primary create */}
        {onCreateContent && (
          <button
            onClick={onCreateContent}
            title="Create & publish everywhere"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-ink text-xs font-bold shadow-glow transition-all active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span className="hidden sm:inline">Compose</span>
          </button>
        )}

        <button
          onClick={() => onSelectTab('ai-hub')}
          className="hidden lg:flex items-center gap-2 px-3.5 py-2 rounded-xl bg-accent-500/10 hover:bg-accent-500/20 border border-accent-500/30 text-xs font-bold text-accent-300 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Ask AI</span>
        </button>

        {onReportIssue && (
          <button
            onClick={onReportIssue}
            title="Report an issue"
            aria-label="Report an issue"
            className="hidden sm:flex p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-raised transition-colors"
          >
            <LifeBuoy className="w-5 h-5" />
          </button>
        )}

        {/* User */}
        <div className="flex items-center gap-2.5 pl-2 sm:pl-3 border-l border-line">
          <div className="relative">
            <img
              src={USER_AVATAR}
              alt=""
              className="w-8 h-8 rounded-full object-cover border-2 border-accent-500/50"
            />
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-surface" />
          </div>
          <div className="hidden 2xl:block text-left">
            <p className="text-xs font-bold text-white leading-tight">Alex Morgan</p>
            <p className="text-[10px] text-fg-muted font-mono">Executive Admin</p>
          </div>
        </div>
      </div>
    </header>
  );
}
