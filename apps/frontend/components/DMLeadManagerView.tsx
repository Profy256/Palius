'use client';

import React, { useMemo, useState } from 'react';
import { DirectMessageLead } from '@/lib/types';
import { platformLabel, SOCIAL_PLATFORMS } from '@/lib/platforms';
import { 
  Users, 
  MessageSquare, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  TrendingUp, 
  Send, 
  ExternalLink,
  ShieldCheck
} from 'lucide-react';

interface DMLeadManagerViewProps {
  leads: DirectMessageLead[];
  onApproveLeadReply: (leadId: string) => void;
}

// DMs arrive from every connected inbox, so the queue is grouped and filtered
// by platform — a WhatsApp enquiry and a TikTok reply are not the same thing.
const platformIcon = (id: string) => SOCIAL_PLATFORMS.find((p) => p.id === id)?.icon ?? '🌐';

export function DMLeadManagerView({ leads, onApproveLeadReply }: DMLeadManagerViewProps) {
  const [selectedLead, setSelectedLead] = useState<DirectMessageLead | null>(leads[0] || null);
  const [platformFilter, setPlatformFilter] = useState<string>('all');

  // Only inboxes that actually have DMs — no empty tabs.
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    leads.forEach((l) => map.set(l.platform, (map.get(l.platform) ?? 0) + 1));
    return map;
  }, [leads]);

  const activePlatforms = useMemo(
    () => SOCIAL_PLATFORMS.filter((p) => counts.has(p.id)).map((p) => p.id),
    [counts],
  );

  const visibleLeads = useMemo(
    () => (platformFilter === 'all' ? leads : leads.filter((l) => l.platform === platformFilter)),
    [leads, platformFilter],
  );

  const selectLead = (lead: DirectMessageLead) => setSelectedLead(lead);

  // Keep the inspector in sync when the filter hides the current selection.
  const inspected = selectedLead && visibleLeads.some((l) => l.id === selectedLead.id)
    ? selectedLead
    : visibleLeads[0] ?? null;

  return (
    <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6">
      <div className="border-b border-line pb-4">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Users className="w-5 h-5 text-emerald-400" />
          <span>AI DM Assistant & Purchase Lead Qualification Queue</span>
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Identifies purchase intent from DMs, qualifies leads, and recommends human escalation — across every connected inbox.
        </p>

        {/* Per-platform inbox filter */}
        <div className="flex items-center gap-1.5 flex-wrap mt-3">
          <button
            onClick={() => setPlatformFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
              platformFilter === 'all' ? 'bg-emerald-500 text-ink shadow-sm' : 'bg-panel text-zinc-400 hover:text-white border border-line'
            }`}
          >
            All inboxes <span className="font-mono text-[10px] opacity-70">{leads.length}</span>
          </button>
          {activePlatforms.map((id) => (
            <button
              key={id}
              onClick={() => setPlatformFilter(id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                platformFilter === id ? 'bg-emerald-500 text-ink shadow-sm' : 'bg-panel text-zinc-400 hover:text-white border border-line'
              }`}
            >
              <span className="mr-1">{platformIcon(id)}</span>
              {platformLabel(id)} <span className="font-mono text-[10px] opacity-70">{counts.get(id)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lead List */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
            Incoming DM Leads ({visibleLeads.length}
            {platformFilter !== 'all' && <span className="text-zinc-500 normal-case"> in {platformLabel(platformFilter)}</span>})
          </h3>
          <div className="space-y-2">
            {visibleLeads.map(lead => (
              <div
                key={lead.id}
                onClick={() => selectLead(lead)}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all space-y-2 ${
                  inspected?.id === lead.id
                    ? 'bg-emerald-500/15 border-emerald-500/50 shadow-md'
                    : 'bg-panel border-line hover:bg-card'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="relative shrink-0">
                      <img src={lead.avatar} alt={lead.name} className="w-7 h-7 rounded-full object-cover" />
                      {/* Which inbox this landed in */}
                      <span
                        title={platformLabel(lead.platform)}
                        className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-card border border-line flex items-center justify-center text-[9px] leading-none"
                      >
                        {platformIcon(lead.platform)}
                      </span>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">{lead.name}</h4>
                      <p className="text-[10px] text-zinc-400">{lead.handle}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    {lead.purchaseIntentScore}% INTENT
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-card border border-line text-zinc-400">
                    {platformLabel(lead.platform)}
                  </span>
                  <span className="text-[10px] text-zinc-500">{lead.time}</span>
                </div>
                <p className="text-xs text-zinc-300 line-clamp-2">"{lead.message}"</p>
              </div>
            ))}
            {visibleLeads.length === 0 && (
              <p className="p-4 text-center text-[11px] text-zinc-500 border border-line rounded-xl">
                No DMs in {platformLabel(platformFilter)} right now.
              </p>
            )}
          </div>
        </div>

        {/* Selected Lead Inspector */}
        {inspected ? (
          <div className="lg:col-span-2 p-6 rounded-2xl bg-panel border border-line space-y-5">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div className="flex items-center gap-3">
                <img src={inspected.avatar} alt={inspected.name} className="w-10 h-10 rounded-full object-cover border border-emerald-500/40" />
                <div>
                  <h3 className="text-sm font-bold text-white">{inspected.name}</h3>
                  <p className="text-xs text-zinc-400 flex items-center gap-1.5">
                    {inspected.handle} •
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-card border border-line text-[10px] font-semibold text-zinc-300">
                      {platformIcon(inspected.platform)} {platformLabel(inspected.platform)}
                    </span>
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs font-bold text-emerald-400 block font-mono">
                  INTENT SCORE: {inspected.purchaseIntentScore}/100
                </span>
                <span className="text-[10px] text-zinc-400 font-mono uppercase">HIGH VALUE DEAL</span>
              </div>
            </div>

            {/* Conversation Preview */}
            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-xl bg-card border border-line space-y-1">
                <span className="text-[10px] font-mono text-zinc-400 uppercase">Customer Message</span>
                <p className="text-zinc-200 leading-relaxed font-medium">"{inspected.message}"</p>
              </div>

              {/* AI Suggested Response */}
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                <div className="flex items-center justify-between font-bold text-emerald-300">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" /> AI Generated High-Converting Reply
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400">READY</span>
                </div>
                <p className="text-zinc-200 italic leading-relaxed">{inspected.aiSuggestedReply}</p>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    onClick={() => onApproveLeadReply(inspected.id)}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
                  >
                    <Send className="w-4 h-4" />
                    <span>Approve &amp; send on {platformLabel(inspected.platform)}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="lg:col-span-2 p-10 text-center text-zinc-400 border border-line rounded-2xl">
            Select a DM lead from the queue to inspect conversation intent.
          </div>
        )}
      </div>
    </div>
  );
}
