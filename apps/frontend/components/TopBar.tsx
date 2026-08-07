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
    <header className="h-14 shrink-0 bg-surface border-b border-line px-3 sm:px-6 flex items-center justify-between gap-3">
      {/* Title & security badge */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onToggleSidebar}
          aria-label="Open navigation"
          className="p-2 -ml-1 rounded-xl text-zinc-300 hover:text-white hover:bg-raised transition-colors lg:hidden shrink-0"
        >
          <Menu className="w-4 h-4" />
        </button>

        <h2 className="text-sm font-extrabold text-white tracking-wide truncate">
          {TITLES[currentTab]}
        </h2>

        <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-semibold font-mono shrink-0">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>AES-256-GCM SECURED</span>
        </div>
      </div>

      {/* Right tools */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <div className="relative hidden md:block">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
          <input
            type="search"
            aria-label="Search posts, drafts and leads"
            placeholder="Search posts, drafts, leads..."
            className="w-40 lg:w-56 bg-well border border-line rounded-xl pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-brand-500/60 transition-colors font-medium"
          />
        </div>

        <button
          aria-label={
            unreadDmsCount > 0 ? `Notifications, ${unreadDmsCount} unread` : 'Notifications'
          }
          className="relative p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-raised transition-colors"
        >
          <Bell className="w-4 h-4" />
          {unreadDmsCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-brand-500 rounded-full" />
          )}
        </button>

        {/* TikTok-style Add button */}
        {onCreateContent && (
          <button
            onClick={onCreateContent}
            title="Create & publish everywhere"
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-ink text-xs font-bold shadow-lg shadow-brand-500/20 transition-colors active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span className="hidden sm:inline">Add</span>
          </button>
        )}

        <button
          onClick={() => onSelectTab('ai-hub')}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 text-xs font-bold text-brand-300 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Ask AI Assistant</span>
        </button>

        {/* Reachable from every screen: a problem you can only report from one
            page is a problem that mostly goes unreported. */}
        {onReportIssue && (
          <button
            onClick={onReportIssue}
            title="Report an issue"
            aria-label="Report an issue"
            className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-raised transition-colors"
          >
            <LifeBuoy className="w-4 h-4" />
          </button>
        )}

        {/* User */}
        <div className="flex items-center gap-2.5 pl-2 sm:pl-3 border-l border-line">
          <img
            src={USER_AVATAR}
            alt=""
            className="w-7 h-7 rounded-full object-cover border border-brand-500/40"
          />
          <div className="hidden 2xl:block text-left">
            <p className="text-xs font-bold text-white leading-tight">Alex Morgan</p>
            <p className="text-[10px] text-zinc-400 font-mono">Executive Admin</p>
          </div>
        </div>
      </div>
    </header>
  );
}
