'use client';

import React, { useState } from 'react';
import { CalendarPost } from '@/lib/types';
import { getProviderConfig } from '@/lib/userConfig';
import { KeyRound, AlertTriangle } from 'lucide-react';
import { 
  X, 
  Repeat, 
  Sparkles, 
  CheckCircle2, 
  Share2, 
  Video, 
  FileText, 
  Copy
} from 'lucide-react';

interface AiRepurposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: CalendarPost | null;
}

export function AiRepurposeModal({ isOpen, onClose, post }: AiRepurposeModalProps) {
  const [repurposedOutputs, setRepurposedOutputs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const [usingLive, setUsingLive] = useState(false);

  if (!isOpen || !post) return null;

  const handleRunRepurpose = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const cfg = await getProviderConfig();
      if (!cfg?.apiKey) {
        setNeedsKey(true);
        return;
      }
      const res = await fetch('/api/repurpose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: post.title,
          originalCaption: post.caption,
          originalPlatform: post.platform,
          provider: cfg.provider,
          apiKey: cfg.apiKey,
          model: cfg.model,
          baseUrl: cfg.baseUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to repurpose content');
        return;
      }
      setUsingLive(!!data.live);
      if (data.outputs) {
        setRepurposedOutputs(data.outputs);
      }
    } catch (e: any) {
      setError(e?.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-3xl rounded-2xl bg-surface border border-line flex flex-col overflow-hidden shadow-2xl space-y-0">
        {/* Header */}
        <div className="p-4 border-b border-line flex items-center justify-between bg-surface">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Repeat className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">AI Multi-Format Repurposing Studio</h2>
              <p className="text-[11px] text-zinc-400">Convert 1 long-form post into 4 short video clips & 2 platform text threads</p>
            </div>
          </div>

          <button onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-raised">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto bg-surface">
          <div className="p-3.5 rounded-xl bg-card border border-line flex items-center justify-between">
            <div>
              <span className="text-[10px] text-zinc-400 font-mono">SOURCE CONTENT</span>
              <h3 className="text-xs font-bold text-white">{post.title}</h3>
            </div>
            <button
              onClick={handleRunRepurpose}
              disabled={isLoading}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs flex items-center gap-2 transition-all shadow-lg disabled:opacity-60"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isLoading ? 'Repurposing Content...' : 'Run AI Repurpose'}</span>
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300">
              <AlertTriangle className="w-4 h-4" /> {error}
            </div>
          )}

          {needsKey && (
            <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <KeyRound className="w-4 h-4" /> Add your AI provider key
              </div>
              <p className="text-amber-100/90">
                No provider key is configured. Open <strong>Settings → Bring Your Own AI Provider</strong>,
                pick a provider (Gemini, OpenRouter, OpenAI, Anthropic or any OpenAI-compatible endpoint),
                paste your key, and save. Then run repurpose again.
              </p>
            </div>
          )}

          {usingLive && repurposedOutputs.length > 0 && (
            <div className="text-[10px] text-emerald-400 font-mono uppercase tracking-wide">
              Generated live via your configured provider
            </div>
          )}

          {/* Repurposed Formats List */}
          {repurposedOutputs.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-zinc-300">Generated Adapted Formats</h4>
              <div className="grid grid-cols-1 gap-3">
                {repurposedOutputs.map((item, idx) => (
                  <div key={idx} className="p-4 rounded-xl bg-card border border-line space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-purple-400 uppercase font-bold text-[10px] px-2 py-0.5 bg-purple-500/10 rounded">
                        {item.platform} • {item.format}
                      </span>
                      <button
                        onClick={() => navigator.clipboard.writeText(item.caption)}
                        className="text-zinc-400 hover:text-white flex items-center gap-1 text-[11px]"
                      >
                        <Copy className="w-3 h-3" /> Copy
                      </button>
                    </div>
                    <p className="font-bold text-brand-300">Hook: "{item.hook}"</p>
                    <p className="text-zinc-300 whitespace-pre-line leading-relaxed">{item.caption}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
