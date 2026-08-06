'use client';

import React, { useState } from 'react';
import { ConnectedAccount, UnlistedPlatformScript } from '@/lib/types';
import { 
  Plus, 
  Share2, 
  ShieldCheck, 
  Globe, 
  Code, 
  CheckCircle2, 
  Key, 
  FileCode
} from 'lucide-react';

interface SocialHubViewProps {
  accounts: ConnectedAccount[];
  onOpenConnectModal: (platform?: string) => void;
  onOpenScriptEditor: (script?: UnlistedPlatformScript) => void;
}

export function SocialHubView({ accounts, onOpenConnectModal, onOpenScriptEditor }: SocialHubViewProps) {
  const [activeFilter, setActiveFilter] = useState<'all' | 'builtin' | 'unlisted'>('all');

  const filteredAccounts = accounts.filter(acc => {
    if (activeFilter === 'builtin') return !acc.isCustomUnlisted;
    if (activeFilter === 'unlisted') return acc.isCustomUnlisted;
    return true;
  });

  return (
    <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Share2 className="w-5 h-5 text-brand-400" />
            <span>Social Accounts & Secure Connection System</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Connect built-in platforms or create custom Playwright browser connector scripts for unlisted websites.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenScriptEditor()}
            className="px-3.5 py-2 rounded-xl bg-raised hover:bg-raised border border-line-strong text-zinc-200 font-semibold text-xs flex items-center gap-2 transition-all"
          >
            <Code className="w-4 h-4 text-brand-400" />
            <span>Custom Script Editor</span>
          </button>
          <button
            onClick={() => onOpenConnectModal()}
            className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-ink font-bold text-xs flex items-center gap-2 shadow-md transition-all"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Connect New Account</span>
          </button>
        </div>
      </div>

      {/* 3-Level Authentication Priority Explanation */}
      <div className="p-5 rounded-2xl bg-panel border border-line space-y-4">
        <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>3-Level Authentication Priority System</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-card border border-emerald-500/20 space-y-1.5">
            <div className="flex items-center justify-between font-bold text-emerald-400">
              <span className="flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5" />
                Level 1: Official API
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 font-mono">Direct</span>
            </div>
            <p className="text-[11px] text-zinc-300">
              Direct platform API integration (YouTube, LinkedIn, Telegram). Preferred when available.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-card border border-blue-500/20 space-y-1.5">
            <div className="flex items-center justify-between font-bold text-blue-400">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                Level 2: OAuth 2.0
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 font-mono">OAuth</span>
            </div>
            <p className="text-[11px] text-zinc-300">
              Standard OAuth authorization flow (Facebook, Instagram, TikTok). Token-based auth.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-card border border-brand-500/30 space-y-1.5">
            <div className="flex items-center justify-between font-bold text-brand-400">
              <span className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                Level 3: Embedded Browser
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 border border-brand-500/30 font-mono">Default</span>
            </div>
            <p className="text-[11px] text-zinc-300">
              User logs into embedded Playwright session. Cookies captured & AES-256 encrypted. Works on any web interface.
            </p>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-line pb-2 text-xs overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveFilter('all')}
          className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-xl font-bold transition-colors ${
            activeFilter === 'all' ? 'bg-brand-500 text-ink shadow-sm' : 'text-zinc-400 hover:text-white'
          }`}
        >
          All Connected Platforms ({accounts.length})
        </button>
        <button
          onClick={() => setActiveFilter('builtin')}
          className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-xl font-bold transition-colors ${
            activeFilter === 'builtin' ? 'bg-brand-500 text-ink shadow-sm' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Built-in Connectors ({accounts.filter(a => !a.isCustomUnlisted).length})
        </button>
        <button
          onClick={() => setActiveFilter('unlisted')}
          className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-xl font-bold transition-colors ${
            activeFilter === 'unlisted' ? 'bg-brand-500 text-ink shadow-sm' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Unlisted Custom Connectors ({accounts.filter(a => a.isCustomUnlisted).length})
        </button>
      </div>

      {/* Account Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredAccounts.map(account => (
          <div key={account.id} className="p-5 rounded-2xl bg-panel border border-line space-y-4 relative overflow-hidden group hover:border-brand-500/40 transition-all">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img
                    src={account.avatar}
                    alt={account.name}
                    className="w-10 h-10 rounded-xl object-cover border border-line-strong"
                  />
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-panel flex items-center justify-center">
                    <CheckCircle2 className="w-2.5 h-2.5 text-white" />
                  </span>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                    {account.name}
                    {account.isCustomUnlisted && (
                      <span className="px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/30 text-[9px] font-mono">
                        UNLISTED
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-zinc-400">{account.handle}</p>
                </div>
              </div>

              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase font-bold">
                {account.status}
              </span>
            </div>

            {/* Auth Priority Badge */}
            <div className="flex items-center justify-between text-[11px] p-2 rounded-xl bg-card border border-line">
              <span className="text-zinc-400 font-medium">Auth Method:</span>
              <span className="text-brand-400 font-bold font-mono">
                {account.authLevel === 'level-1' && 'Level 1 (API)'}
                {account.authLevel === 'level-2' && 'Level 2 (OAuth 2.0)'}
                {account.authLevel === 'level-3' && 'Level 3 (Embedded Browser)'}
              </span>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-line text-xs">
              <div>
                <p className="text-[10px] text-zinc-400">Followers</p>
                <p className="font-bold text-white">{account.followers}</p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-400">{account.metricLabel}</p>
                <p className="font-bold text-emerald-400">{account.metricValue}</p>
              </div>
            </div>

            {/* Unlisted Custom Script Action Button */}
            {account.isCustomUnlisted && account.customScript && (
              <button
                onClick={() => onOpenScriptEditor(account.customScript)}
                className="w-full py-2 px-3 rounded-xl bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 text-brand-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>Edit Selector Script</span>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
