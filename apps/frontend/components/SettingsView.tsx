'use client';

import React, { useState } from 'react';
import { 
  Settings, 
  ShieldCheck, 
  BrainCircuit, 
  Lock, 
  CheckCircle2, 
  Save, 
  Key, 
  Sliders
} from 'lucide-react';
import { SupportSection } from '@/components/SupportSection';

export function SettingsView() {
  const [toneStyle, setToneStyle] = useState('Executive & Authoritative');
  const [emojiPreference, setEmojiPreference] = useState('Moderate / High Impact');
  const [brandPersona, setBrandPersona] = useState('Cutting-edge AI automation OS for founders and decision makers');

  return (
    <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6">
      <div className="border-b border-line pb-4">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-brand-400" />
          <span>Brand Intelligence Learning & Security Settings</span>
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Configure AI brand voice learning rules and inspect AES-256-GCM browser session encryption status.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Brand Learning Engine */}
        <div className="p-5 rounded-2xl bg-panel border border-line space-y-4">
          <div className="flex items-center gap-2 border-b border-line pb-3">
            <BrainCircuit className="w-4 h-4 text-brand-400" />
            <h3 className="text-sm font-bold text-white">Brand Learning Engine Configuration</h3>
          </div>

          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-zinc-300">Tone of Voice & Writing Style</label>
              <input
                type="text"
                value={toneStyle}
                onChange={e => setToneStyle(e.target.value)}
                className="w-full bg-card border border-line rounded-xl px-3.5 py-2 text-xs text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-zinc-300">Emoji Usage Density</label>
              <select
                value={emojiPreference}
                onChange={e => setEmojiPreference(e.target.value)}
                className="w-full bg-card border border-line rounded-xl px-3 py-2 text-xs text-white"
              >
                <option value="Minimal / Clean">Minimal / Clean (0-1 per post)</option>
                <option value="Moderate / High Impact">Moderate / High Impact (2-3 per post)</option>
                <option value="High Viral Energy">High Viral Energy (TikTok style)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-zinc-300">Brand Persona & Product Focus</label>
              <textarea
                rows={3}
                value={brandPersona}
                onChange={e => setBrandPersona(e.target.value)}
                className="w-full bg-card border border-line rounded-xl p-3 text-xs text-zinc-200 resize-none"
              />
            </div>

            <button className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-ink font-semibold text-xs flex items-center gap-1.5 transition-all shadow-md">
              <Save className="w-3.5 h-3.5" />
              <span>Update Brand Rules</span>
            </button>
          </div>
        </div>

        {/* Security Requirements & Encryption Audit Log */}
        <div className="p-5 rounded-2xl bg-panel border border-line space-y-4">
          <div className="flex items-center gap-2 border-b border-line pb-3">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Encryption & Security Compliance</h3>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
              <div className="flex items-center justify-between font-bold text-emerald-400">
                <span className="flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" /> AES-256-GCM Session Encryption
                </span>
                <span className="text-[10px] font-mono">ACTIVE</span>
              </div>
              <p className="text-[11px] text-zinc-300">
                All browser session cookies & tokens stored at rest are encrypted using AES-256-GCM.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-card border border-line space-y-1">
              <span className="text-[10px] text-zinc-400 font-mono">AUDIT LOG SUMMARY</span>
              <p className="text-zinc-300 font-mono text-[11px]">• Level 3 Embedded Playwright session re-authenticated</p>
              <p className="text-zinc-300 font-mono text-[11px]">• Role-based access control verified for Admin Alex Morgan</p>
            </div>
          </div>
        </div>
      </div>

      <SupportSection />
    </div>
  );
}
