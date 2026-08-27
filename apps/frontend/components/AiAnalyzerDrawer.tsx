'use client';

import React from 'react';
import { CalendarPost } from '@/lib/types';
import { formatPostDay } from '@/lib/date';
import { 
  X, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Zap, 
  TrendingUp, 
  Share2, 
  Repeat,
  Layers
} from 'lucide-react';

interface AiAnalyzerDrawerProps {
  post: CalendarPost | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdatePost: (updatedPost: CalendarPost) => void;
  onOpenRepurpose?: (post: CalendarPost) => void;
}

export function AiAnalyzerDrawer({
  post,
  isOpen,
  onClose,
  onUpdatePost,
  onOpenRepurpose
}: AiAnalyzerDrawerProps) {
  if (!isOpen || !post) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-surface border-l border-line shadow-2xl flex flex-col overflow-hidden animate-slide-in">
      {/* Drawer Header */}
      <div className="p-4 border-b border-line flex items-center justify-between bg-surface">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white">AI Content Analyzer & Improver</h3>
            <p className="text-[10px] text-zinc-400 font-mono">POST ID: {post.id}</p>
          </div>
        </div>

        <button onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-raised">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Drawer Body */}
      <div className="flex-1 p-5 overflow-y-auto space-y-5">
        {/* Score Gauge Card */}
        <div className="p-4 rounded-xl bg-card border border-brand-500/30 space-y-2 text-center">
          <span className="text-[10px] uppercase font-mono tracking-wider text-brand-400 font-bold">
            Optimization Score
          </span>
          <div className="text-4xl font-extrabold text-white flex items-center justify-center gap-1">
            <span>{post.optimizationScore}</span>
            <span className="text-sm font-normal text-zinc-400">/100</span>
          </div>
          <p className="text-[11px] text-zinc-300">
            {post.optimizationScore >= 90 ? '🔥 High Viral Potential' : '⚡ Good, but hook retention can be boosted'}
          </p>
        </div>

        {/* Thumbnail & Meta */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-zinc-300">Content Details</h4>
          <div className="p-3 rounded-xl bg-card border border-line space-y-2 text-xs">
            <div className="flex justify-between text-zinc-400">
              <span>Platform:</span>
              <span className="font-bold text-brand-400 uppercase font-mono">{post.platform}</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Format Type:</span>
              <span className="font-bold text-white uppercase">{post.type}</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Schedule Window:</span>
              <span className="font-bold text-white font-mono">{formatPostDay(post.date)} @ {post.time}</span>
            </div>
          </div>
        </div>

        {/* Pacing & Audio Critique */}
        {post.critiqueText && (
          <div className="p-3.5 rounded-xl bg-brand-500/10 border border-brand-500/30 text-brand-200 text-xs space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-brand-300">
              <Zap className="w-3.5 h-3.5" /> AI Executive Critique
            </div>
            <p className="text-[11px] leading-relaxed opacity-90">{post.critiqueText}</p>
          </div>
        )}

        {/* Suggested Opening Hooks */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-zinc-300">AI Suggested High-Retention Hooks</h4>
          <div className="space-y-2">
            {post.suggestedHooks.map((hook, idx) => (
              <div
                key={idx}
                onClick={() => {
                  onUpdatePost({ ...post, caption: `${hook}\n\n${post.caption}` });
                }}
                className="p-3 rounded-xl bg-card hover:bg-raised border border-line text-xs text-brand-300 cursor-pointer transition-all space-y-1"
              >
                <div className="flex justify-between text-[10px] text-zinc-400 font-mono">
                  <span>HOOK #{idx + 1}</span>
                  <span className="text-emerald-400 font-bold">+18% Retention</span>
                </div>
                <p className="line-clamp-2">"{hook}"</p>
              </div>
            ))}
          </div>
        </div>

        {/* Repurpose Launcher Button */}
        {onOpenRepurpose && (
          <button
            onClick={() => onOpenRepurpose(post)}
            className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg transition-all"
          >
            <Repeat className="w-4 h-4" />
            <span>Repurpose into Shorts, Reels & X Thread</span>
          </button>
        )}
      </div>
    </div>
  );
}
