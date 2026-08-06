'use client';

import React, { useState } from 'react';
import { ChatMessage, StudioArtifact } from '@/lib/types';
import { 
  Bot, 
  Send, 
  Sparkles, 
  Palette, 
  Image as ImageIcon, 
  CheckCircle2, 
  Plus, 
  Layers, 
  Wand2,
  TrendingUp,
  Search,
  Flame,
  Loader2,
  Clock3,
  Zap
} from 'lucide-react';
import { researchViral, localViral, ViralResearchResponse } from '@/lib/api';
import { PLATFORM_IDS } from '@/lib/platforms';

interface AiHubViewProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  artifacts: StudioArtifact[];
  onGenerateArtifact: (prompt: string) => void;
}

export function AiHubView({
  messages,
  onSendMessage,
  artifacts,
  onGenerateArtifact
}: AiHubViewProps) {
  const [inputText, setInputText] = useState('');
  const [promptText, setPromptText] = useState('');

  // Viral research state
  const [viralTopic, setViralTopic] = useState('');
  const [viralResult, setViralResult] = useState<ViralResearchResponse | null>(null);
  const [isResearching, setIsResearching] = useState(false);

  const quickPrompts = [
    "Create next week's content plan.",
    "Generate an advert for my new product.",
    "Why did sales drop this month?",
    "Reply to customer questions automatically.",
    "Show today's business summary."
  ];

  const handleResearchViral = async (topicOverride?: string) => {
    const topic = (topicOverride ?? viralTopic).trim();
    if (!topic) return;
    setIsResearching(true);
    const req = { topic, industry: '', platforms: PLATFORM_IDS, count: 6 };
    try {
      const res = (await researchViral(req)) ?? localViral(req);
      setViralResult(res);
    } finally {
      setIsResearching(false);
    }
  };

  const handleSend = () => {
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
  };

  const handleStudioSubmit = () => {
    if (!promptText.trim()) return;
    onGenerateArtifact(promptText);
    setPromptText('');
  };

  return (
    <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-6">
      {/* Header */}
      <div className="border-b border-line pb-4">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Bot className="w-5 h-5 text-brand-400" />
          <span>AI Executive Assistant & Palius Studio Alpha</span>
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Coordinates all Palius applications, plans marketing campaigns, generates graphics & responds to natural language queries.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Viral Research Panel */}
        <div className="lg:col-span-3 rounded-2xl bg-panel border border-brand-500/25 overflow-hidden">
          <div className="p-3 border-b border-line bg-surface flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs font-bold text-brand-400">
              <Flame className="w-4 h-4" /> Viral Content Research
            </span>
            <span className="text-[10px] text-zinc-400 font-mono">SEARCHES SOCIAL & INTERNET FOR IDEAS + POSTING STYLES THAT GO VIRAL</span>
            <div className="flex-1" />
            <div className="flex items-center gap-1.5 w-full sm:w-96">
              {/* The icon needs a positioned wrapper — without one it anchored
                  to the viewport and floated over unrelated content. */}
              <div className="relative flex-1 min-w-0">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  aria-label="Topic to research"
                  placeholder="e.g. AI tools for solo developers, fintech SaaS..."
                  value={viralTopic}
                  onChange={(e) => setViralTopic(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleResearchViral()}
                  className="w-full bg-well border border-line rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500/50 transition-colors"
                />
              </div>
              <button
                onClick={() => handleResearchViral()}
                disabled={isResearching || !viralTopic.trim()}
                className="shrink-0 px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-ink font-bold text-xs flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isResearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Research
              </button>
            </div>
          </div>

          {viralResult ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
              <ResearchCard icon={<TrendingUp className="w-3.5 h-3.5" />} title="Trending Themes" items={viralResult.trends} accent="text-brand-400" />
              <ResearchCard icon={<Sparkles className="w-3.5 h-3.5" />} title="Content Ideas" items={viralResult.contentIdeas} accent="text-brand-300" />
              <ResearchCard icon={<Clock3 className="w-3.5 h-3.5" />} title="Posting Styles" items={viralResult.postingStyles} accent="text-cyan-300" />
              <ResearchCard icon={<Zap className="w-3.5 h-3.5" />} title="Virality Tactics" items={viralResult.tactics} accent="text-emerald-400" />
              <div className="md:col-span-2 xl:col-span-2 space-y-3">
                <div className="p-3.5 rounded-xl bg-card border border-line">
                  <span className="text-[10px] font-mono text-brand-400 font-bold uppercase">Strategic Summary</span>
                  <p className="text-xs text-zinc-200 leading-relaxed mt-1.5">{viralResult.summary}</p>
                </div>
                <div className="p-3.5 rounded-xl bg-card border border-line">
                  <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase">Where these findings come from</span>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {viralResult.sources.map((s, i) => (
                      <span key={i} className="px-2 py-1 rounded-lg bg-well border border-line text-[10px] text-zinc-300 font-mono">{s}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 text-[11px] text-zinc-400">
              Enter a topic above and the AI will research what's winning on each platform — ideas, formats, posting styles and distribution tactics.
            </div>
          )}
        </div>

        {/* Natural Language Assistant Chat (2 cols) */}
        <div className="lg:col-span-2 rounded-2xl bg-panel border border-line flex flex-col h-[min(650px,70vh)] overflow-hidden">
          {/* Quick prompts */}
          <div className="p-3 border-b border-line bg-surface flex items-center gap-1.5 overflow-x-auto scrollbar-none text-xs">
            <span className="text-zinc-400 font-semibold flex items-center gap-1 min-w-max text-[11px]">
              <Sparkles className="w-3.5 h-3.5 text-brand-400" /> Quick Query:
            </span>
            {quickPrompts.map((qp, i) => (
              <button
                key={i}
                onClick={() => onSendMessage(qp)}
                className="px-2.5 py-1 rounded-lg bg-raised hover:bg-raised text-zinc-300 hover:text-white border border-line text-[11px] font-medium min-w-max transition-all"
              >
                {qp}
              </button>
            ))}
          </div>

          {/* Chat Messages Tray */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex gap-3 text-xs ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'ai' && (
                  <div className="w-7 h-7 rounded-lg bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-400">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div className={`max-w-[80%] p-3.5 rounded-2xl space-y-2 leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-brand-500 text-white font-medium rounded-tr-none'
                    : 'bg-card border border-line text-zinc-200 rounded-tl-none'
                }`}>
                  <p className="whitespace-pre-line">{renderInlineBold(msg.text)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Chat Input Bar */}
          <div className="p-3 border-t border-line bg-surface flex items-center gap-2">
            <input
              type="text"
              placeholder="Ask Palius AI Executive anything (e.g. 'Recommend best posting time')..."
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              className="flex-1 bg-well border border-line rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500/50"
            />
            <button
              onClick={handleSend}
              className="p-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-ink font-semibold text-xs flex items-center justify-center transition-all shadow-md shadow-brand-500/20"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Palius Studio Generator & Artifacts Gallery */}
        <div className="rounded-2xl bg-panel border border-line p-4 flex flex-col space-y-4">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <h3 className="text-xs font-bold text-white flex items-center gap-2">
              <Palette className="w-4 h-4 text-brand-400" />
              <span>Palius Studio Generation</span>
            </h3>
            <span className="text-[10px] font-mono text-brand-400">ALPHA</span>
          </div>

          {/* Studio Prompt Box */}
          <div className="space-y-2">
            <textarea
              rows={3}
              placeholder="Describe graphic or video asset to generate (e.g. Luxury fragrance bottle concept)..."
              value={promptText}
              onChange={e => setPromptText(e.target.value)}
              className="w-full bg-well border border-line rounded-xl p-3 text-xs text-brand-300 placeholder-zinc-500 focus:outline-none focus:border-brand-500/50 leading-relaxed resize-none"
            />
            <button
              onClick={handleStudioSubmit}
              className="w-full py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-ink font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-md"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Generate Studio Asset</span>
            </button>
          </div>

          {/* Artifacts Gallery */}
          <div className="space-y-2 pt-2 border-t border-line flex-1 overflow-y-auto">
            <h4 className="text-xs font-bold text-zinc-300">Generated Studio Artifacts</h4>
            <div className="grid grid-cols-1 gap-2">
              {artifacts.map(art => (
                <div key={art.id} className="p-2.5 rounded-xl bg-card border border-line flex items-center gap-3">
                  <img src={art.url} alt={art.title} className="w-12 h-12 rounded-lg object-cover border border-line-strong" />
                  <div className="flex-1 overflow-hidden">
                    <p className="text-xs font-bold text-white truncate">{art.title}</p>
                    <p className="text-[10px] text-zinc-400">{art.timestamp}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The assistant answers in light markdown, so bubbles used to show literal
 * `**asterisks**`. Handle the one construct the model actually emits — bold —
 * rather than pulling in a markdown renderer for it.
 */
function renderInlineBold(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i} className="font-bold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}

// ----------------------------------------------------------- Research card ---
function ResearchCard({ icon, title, items, accent }: { icon: React.ReactNode; title: string; items: string[]; accent: string }) {
  return (
    <div className="p-3.5 rounded-xl bg-card border border-line">
      <span className={`text-[10px] font-mono font-bold uppercase flex items-center gap-1.5 ${accent}`}>
        {icon} {title}
      </span>
      <ul className="space-y-2 mt-2">
        {items.slice(0, 6).map((item, i) => (
          <li key={i} className="text-[11px] text-zinc-300 leading-relaxed flex gap-2">
            <span className={`${accent} shrink-0`}>▸</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
