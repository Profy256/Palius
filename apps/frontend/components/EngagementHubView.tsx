'use client';

import React, { useState } from 'react';
import { CommentItem, KnowledgeBaseRule } from '@/lib/types';
import { 
  MessageSquareText, 
  Bot, 
  CheckCircle2, 
  Sparkles, 
  BookOpen, 
  Send, 
  Filter, 
  ShieldAlert,
  HelpCircle,
  Heart,
  DollarSign
} from 'lucide-react';

interface EngagementHubViewProps {
  comments: CommentItem[];
  knowledgeBase: KnowledgeBaseRule[];
  onApproveCommentReply: (commentId: string) => void;
  onUpdateKnowledgeBase: (rules: KnowledgeBaseRule[]) => void;
  onNavigateToDms: () => void;
}

export function EngagementHubView({
  comments,
  knowledgeBase,
  onApproveCommentReply,
  onUpdateKnowledgeBase,
  onNavigateToDms
}: EngagementHubViewProps) {
  const [activeTab, setActiveTab] = useState<'comments' | 'kb'>('comments');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // This view used to copy `comments` into local state on mount, so replies
  // updated the card here but the sidebar badge kept counting them as pending.
  // The parent owns the list; render straight from the prop.
  const filteredComments = comments.filter(c => {
    if (categoryFilter !== 'all' && c.category !== categoryFilter) return false;
    return true;
  });

  return (
    <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <MessageSquareText className="w-5 h-5 text-brand-400" />
            <span>AI Comment Management & Auto-Reply Engine</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            AI reads every comment, categorizes intent, and auto-replies using configurable business knowledge.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onNavigateToDms}
            className="px-3.5 py-2 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 font-semibold text-xs transition-all"
          >
            Switch to DM Lead Assistant &rarr;
          </button>
        </div>
      </div>

      {/* Subnav Tabs */}
      <div className="flex items-center gap-2 border-b border-line pb-2 text-xs overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('comments')}
          className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-lg font-semibold transition-colors ${
            activeTab === 'comments' ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Live Categorized Comments ({comments.length})
        </button>
        <button
          onClick={() => setActiveTab('kb')}
          className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-lg font-semibold transition-colors ${
            activeTab === 'kb' ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Business Knowledge Base Rules ({knowledgeBase.length})
        </button>
      </div>

      {/* Live Comments View */}
      {activeTab === 'comments' && (
        <div className="space-y-4">
          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-zinc-400 font-semibold flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Intent:
            </span>
            {['all', 'Sales Inquiry', 'Question', 'Praise', 'Complaint', 'Spam', 'Refund Request'].map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-2.5 py-1 rounded-lg capitalize font-medium transition-all ${
                  categoryFilter === cat ? 'bg-brand-500 text-ink shadow-sm font-semibold' : 'bg-panel text-zinc-400 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Comment Cards List */}
          <div className="space-y-3">
            {filteredComments.map(comment => (
              <div key={comment.id} className="p-4 rounded-xl bg-panel border border-line space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <img src={comment.avatar} alt={comment.author} className="w-8 h-8 rounded-full object-cover" />
                    <div>
                      <h4 className="text-xs font-bold text-white">{comment.author}</h4>
                      <p className="text-[10px] text-zinc-400 font-mono">
                        {comment.platform.toUpperCase()} • {comment.time}
                      </p>
                    </div>
                  </div>

                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase ${
                    comment.category === 'Sales Inquiry' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                    comment.category === 'Spam' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                    'bg-brand-500/10 text-brand-400 border-brand-500/30'
                  }`}>
                    {comment.category}
                  </span>
                </div>

                <p className="text-xs text-zinc-200 bg-card p-3 rounded-xl border border-line">
                  "{comment.text}"
                </p>

                {/* AI Auto-Reply Preview */}
                <div className="p-3 rounded-xl bg-brand-500/10 border border-brand-500/20 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-brand-300 font-bold">
                    <span className="flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5" /> AI Knowledge Base Match
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono font-normal">AUTO GENERATED</span>
                  </div>
                  <p className="text-zinc-200 italic">{comment.aiSuggestedReply}</p>

                  <div className="pt-1 flex justify-end gap-2">
                    {comment.status === 'REPLIED' ? (
                      <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Auto-Replied & Published
                      </span>
                    ) : (
                      <button
                        onClick={() => onApproveCommentReply(comment.id)}
                        className="px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-400 text-ink text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
                      >
                        <Send className="w-3 h-3" /> Approve & Post Reply
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Knowledge Base Config View */}
      {activeTab === 'kb' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-panel border border-line space-y-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-brand-400" />
              <span>Business Knowledge Base Rules</span>
            </h3>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Define FAQs for pricing, shipping, refunds, and availability. The AI references these rules when auto-replying to comments.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {knowledgeBase.map(rule => (
              <div key={rule.id} className="p-4 rounded-xl bg-panel border border-line space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold text-white">
                  <span>{rule.category}</span>
                  <span className="text-emerald-400 font-mono text-[10px]">ENABLED</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {rule.keywords.map((kw, i) => (
                    <span key={i} className="px-2 py-0.5 rounded bg-raised text-zinc-300 border border-line font-mono text-[10px]">
                      #{kw}
                    </span>
                  ))}
                </div>
                <p className="text-zinc-300 bg-card p-3 rounded-lg border border-line italic">
                  "{rule.responseTemplate}"
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
