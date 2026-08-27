'use client';

import React, { useEffect } from 'react';
import Image from 'next/image';
import { NavTab } from '@/lib/types';
import {
  LayoutDashboard,
  CalendarDays,
  Share2,
  MessageSquareText,
  Inbox,
  BarChart3,
  Bot,
  Settings,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenQuickPost: () => void;
  unreadLeadsCount?: number;
  pendingCommentsCount?: number;
  /** Drawer state — only consulted below the `lg` breakpoint. */
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({
  currentTab,
  onSelectTab,
  onOpenQuickPost,
  unreadLeadsCount = 0,
  pendingCommentsCount = 0,
  isOpen = false,
  onClose,
}: SidebarProps) {
  const navItems: { id: NavTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'dashboard', label: 'Executive Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'content', label: 'Content Calendar', icon: <CalendarDays className="w-4 h-4" /> },
    { id: 'social-hub', label: 'Social Accounts', icon: <Share2 className="w-4 h-4" /> },
    {
      id: 'engagement',
      label: 'Engagement Hub',
      icon: <MessageSquareText className="w-4 h-4" />,
      badge: pendingCommentsCount,
    },
    {
      id: 'dms',
      label: 'DM Leads',
      icon: <Inbox className="w-4 h-4" />,
      badge: unreadLeadsCount,
    },
    { id: 'analytics', label: 'Analytics & Coach', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'ai-hub', label: 'AI Advisor & Studio', icon: <Bot className="w-4 h-4" /> },
    { id: 'settings', label: 'Brand & Security', icon: <Settings className="w-4 h-4" /> },
  ];

  // Escape closes the drawer — standard for anything that overlays content.
  useEffect(() => {
    if (!isOpen || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  return (
    <>
      {/* Scrim — drawer mode only */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden animate-fade-in"
          aria-hidden="true"
        />
      )}

      <aside
        className={`w-64 shrink-0 bg-surface border-r border-line flex flex-col h-full z-40
          fixed inset-y-0 left-0 transition-transform duration-200 ease-out
          lg:static lg:translate-x-0 lg:transition-none
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-line flex items-center justify-between gap-2 select-none">
          {/* `wordmark-color-light.svg` is a full lockup — it already contains
              the amber tile *and* the name. Pairing it with the standalone
              icon printed the mark twice and squeezed the name to ~9px. Use
              the icon plus real text, so the name sets in the app's own font. */}
          <div className="flex items-center gap-3 min-w-0">
            <Image
              src="/palius-logo/svg/icon-color.svg"
              alt=""
              width={40}
              height={40}
              className="w-10 h-10 rounded-xl shadow-md shrink-0"
              priority
            />
            <div className="min-w-0">
              <p className="text-base font-extrabold text-white tracking-tight leading-none">
                Palius
              </p>
              <p className="text-[10px] text-zinc-400 tracking-wider uppercase font-semibold mt-1.5">
                AI Executive Assistant
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close navigation"
            className="p-1.5 -mr-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-raised transition-colors lg:hidden shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Primary action */}
        <div className="p-4">
          <button
            onClick={onOpenQuickPost}
            className="w-full py-2.5 px-4 rounded-xl bg-brand-500 hover:bg-brand-400 text-ink font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-colors active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Compose &amp; Adapt</span>
            <Sparkles className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto" aria-label="Primary">
          <div className="px-3 py-2 text-[10px] font-bold text-fg-muted uppercase tracking-widest select-none">
            Core Operations
          </div>
          {navItems.map(item => {
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`group w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all relative ${
                  isActive
                    ? 'bg-brand-500/10 text-brand-200 border border-brand-500/30 shadow-card'
                    : 'text-zinc-300 hover:text-white hover:bg-raised border border-transparent'
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-brand-500" />
                )}
                <span className="flex items-center gap-3 min-w-0">
                   <span className={isActive ? 'text-brand-400' : 'text-zinc-400'}>{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-500 text-ink shrink-0">
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* AI status */}
        <div className="p-4 m-3 rounded-xl bg-card border border-line space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-zinc-200 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              AI Employee
            </span>
            <span className="text-[10px] font-mono text-emerald-400 font-semibold">ONLINE</span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed font-medium">
            Autonomously analyzing comments, scheduling posts, and learning brand voice.
          </p>
        </div>
      </aside>
    </>
  );
}
