'use client';

import React, { useState } from 'react';
import { CalendarPost, PlatformType } from '@/lib/types';
import { SOCIAL_PLATFORMS } from '@/lib/platforms';
import { optimizePost, OptimizeResponse } from '@/lib/api';
import { 
  X, 
  Sparkles, 
  Send, 
  Wand2, 
  Hash, 
  Split, 
  Share2, 
  Layers, 
  Bot,
  CheckCircle2
} from 'lucide-react';

interface ComposeContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddPost: (post: CalendarPost) => void;
}

export function ComposeContentModal({ isOpen, onClose, onAddPost }: ComposeContentModalProps) {
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [hook, setHook] = useState('');
  const [platform, setPlatform] = useState<PlatformType>('linkedin');
  const [contentType, setContentType] = useState<'video' | 'image' | 'carousel' | 'text' | 'reels'>('video');
  const [captionStyle, setCaptionStyle] = useState<string>('Professional');
  const [hashtags, setHashtags] = useState<string[]>(['#ExecutiveOS', '#AIAutomation']);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState<OptimizeResponse | null>(null);
  const [optimizeError, setOptimizeError] = useState('');
  const [showAbVariants, setShowAbVariants] = useState(false);

  if (!isOpen) return null;

  const captionStyles = [
    'Professional', 'Funny', 'Educational', 'Sales', 'Storytelling', 'Luxury', 'Friendly'
  ];

  const handleGenerateCaption = async () => {
    setIsOptimizing(true);
    setOptimizeError('');

    // Goes to the Go backend, so the rewrite uses the same provider — and is
    // metered by the same ledger — as every other AI feature.
    const data = await optimizePost({ caption, platform, hook, style: captionStyle });

    if (!data) {
      setOptimizeError(
        "Couldn't reach the AI service. Check the backend is running with an AI provider configured.",
      );
      setIsOptimizing(false);
      return;
    }

    setOptimizationResult(data);
    if (data.improvedCaption) setCaption(data.improvedCaption);
    if (data.hashtags?.length) setHashtags(data.hashtags);
    if (data.hooks?.length) setHook(data.hooks[0]);
    setIsOptimizing(false);
  };

  const handlePublish = (status: 'SCHEDULED' | 'AI DRAFT') => {
    const newPost: CalendarPost = {
      id: `post-${Date.now()}`,
      title: title || 'Untitled AI Executive Post',
      platform,
      date: '26',
      time: '04:00 PM',
      status,
      author: 'Alex Morgan',
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBoYomdX5SQ1KYxAo95AntiMHMeGQzLBS4GRzelhIIRoAvKXxXdVvZcmtS_TfNiXDQn-n-bxiWtgwStx2nJoixV2PW6fClpGe38Jb2xGAoUurKvZzOI1MY0PJt5g_hRN0ql4nRaZk4pheKFRIDWLnV-f0uClu6-UamxjGR5rJgXYJ9B2yKO1zkPGlFJBqWeC9hgs3wfmBkgCi5ivrUOJn5qmMeAlsMpqJ-2w0wtuOnDGsQJ8VogHgzeQaVkXETYA3BeW9LWhxTrpYo',
      type: contentType,
      optimizationScore: optimizationResult?.score || 86,
      caption,
      suggestedHooks: optimizationResult?.hooks || [hook || 'Why 80% of Fortune 500s are silently rebuilding AI...'],
      hashtags
    };

    onAddPost(newPost);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="w-full max-w-3xl h-[85vh] rounded-2xl bg-surface border border-line flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-line flex items-center justify-between bg-surface">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/30 flex items-center justify-center text-brand-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Multi-Platform Content Composer & Optimizer</h2>
              <p className="text-[11px] text-zinc-400">One upload adapts to every connected platform — and any site you add yourself</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-raised">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-5 bg-surface">
          {/* Title & Platform Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs font-semibold text-zinc-300">Content Title</label>
              <input
                type="text"
                placeholder="e.g. Q4 AI Executive Strategy Reel"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full bg-card border border-line rounded-xl px-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500/50"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-300">Target Platform</label>
              <select
                value={platform}
                onChange={e => setPlatform(e.target.value as PlatformType)}
                className="w-full bg-card border border-line rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500/50"
              >
                {SOCIAL_PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
                <option value="Bluesky Social">Bluesky (Unlisted Custom)</option>
              </select>
            </div>
          </div>

          {/* Caption Style Generator Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-zinc-300 flex items-center gap-1.5">
                <Wand2 className="w-3.5 h-3.5 text-brand-400" />
                AI Caption Persona / Style
              </label>
              <span className="text-[10px] text-zinc-400 font-mono">7 Tones Available</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {captionStyles.map(s => (
                <button
                  key={s}
                  onClick={() => setCaptionStyle(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    captionStyle === s
                      ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40 font-semibold'
                      : 'bg-card text-zinc-400 hover:text-zinc-200 border border-line'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Opening Hook Input */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-300">Primary Opening Hook (First 2 Seconds)</label>
            <input
              type="text"
              placeholder="e.g. Why 80% of Fortune 500s are silently rebuilding AI backend..."
              value={hook}
              onChange={e => setHook(e.target.value)}
              className="w-full bg-card border border-line rounded-xl px-3.5 py-2 text-xs text-brand-300 placeholder-zinc-500 focus:outline-none focus:border-brand-500/50"
            />
          </div>

          {/* Caption Textarea */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-zinc-300">Caption & Body Content</label>
              <button
                onClick={handleGenerateCaption}
                disabled={isOptimizing}
                className="text-brand-400 hover:underline flex items-center gap-1 font-semibold text-[11px]"
              >
                <Sparkles className="w-3 h-3" />
                {isOptimizing ? 'Optimizing AI Content...' : 'Generate & Enhance with AI'}
              </button>
            </div>
            <textarea
              rows={4}
              placeholder="Draft your main post copy here..."
              value={caption}
              onChange={e => setCaption(e.target.value)}
              className="w-full bg-card border border-line rounded-xl p-3.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-brand-500/50 leading-relaxed resize-none"
            />
            {optimizeError && (
              <p className="text-[11px] text-red-300 leading-relaxed">{optimizeError}</p>
            )}
            {optimizationResult?.critique && !optimizeError && (
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                <span className="font-semibold text-brand-300">Score {optimizationResult.score}/100.</span>{' '}
                {optimizationResult.critique}
              </p>
            )}
          </div>

          {/* Smart Hashtags & A/B Testing Toggle */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1">
                <Hash className="w-3.5 h-3.5 text-brand-400" /> Smart Generated Hashtags
              </label>
              <div className="flex flex-wrap gap-1.5 p-2.5 rounded-xl bg-card border border-line">
                {hashtags.map((h, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-brand-500/10 text-brand-300 border border-brand-500/20 text-[11px] font-mono">
                    {h}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1">
                <Split className="w-3.5 h-3.5 text-cyan-400" /> A/B Testing Variant Generator
              </label>
              <button
                onClick={() => setShowAbVariants(!showAbVariants)}
                className="w-full py-2.5 px-3 rounded-xl bg-card hover:bg-raised border border-line text-xs font-semibold text-cyan-300 flex items-center justify-between"
              >
                <span>{showAbVariants ? 'Hide A/B Variants' : 'Generate A/B Variations'}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-cyan-500/10 rounded">PREDICTIVE</span>
              </button>
            </div>
          </div>

          {/* A/B Variants Display */}
          {showAbVariants && (
            <div className="p-3.5 rounded-xl bg-card border border-cyan-500/30 space-y-2 text-xs">
              <div className="flex items-center justify-between font-bold text-cyan-300">
                <span>Variant B (High Controversy Hook)</span>
                <span className="text-[10px] font-mono text-emerald-400">+14.2% Estimated CTR</span>
              </div>
              <p className="text-zinc-300">"Stop wasting GPU compute: The executive guide to AI optimization."</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-line bg-surface flex items-center justify-between">
          <button
            onClick={() => handlePublish('AI DRAFT')}
            className="px-4 py-2 rounded-xl bg-raised hover:bg-raised text-zinc-300 text-xs font-semibold"
          >
            Save as Draft
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePublish('SCHEDULED')}
              className="px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-ink font-semibold text-xs flex items-center gap-2 shadow-lg shadow-brand-500/20 transition-all"
            >
              <Send className="w-4 h-4" />
              <span>Adapt & Schedule Across Platforms</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
