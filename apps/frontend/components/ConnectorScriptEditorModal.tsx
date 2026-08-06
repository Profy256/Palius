'use client';

import React, { useState } from 'react';
import { UnlistedPlatformScript } from '@/lib/types';
import { 
  X, 
  Code, 
  Play, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  Download, 
  Upload, 
  Sparkles,
  Globe
} from 'lucide-react';

interface ConnectorScriptEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  script?: UnlistedPlatformScript;
  onSaveScript: (newScript: UnlistedPlatformScript) => void;
}

export function ConnectorScriptEditorModal({
  isOpen,
  onClose,
  script,
  onSaveScript
}: ConnectorScriptEditorModalProps) {
  const defaultScriptJson = JSON.stringify(script || {
    id: `script-${Date.now()}`,
    name: "Custom Web Forum Connector",
    loginUrl: "https://example-community.com/login",
    selectors: {
      usernameField: "input[name='user']",
      passwordField: "input[name='pass']",
      submitButton: "button[type='submit']",
      publishContainer: "form#new-post-form",
      postInput: "textarea#post-content",
      postButton: "button#submit-post"
    },
    actionsPermitted: ["publish", "comment", "read_dms"],
    version: "1.0.0"
  }, null, 2);

  const [jsonText, setJsonText] = useState(defaultScriptJson);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  if (!isOpen) return null;

  const handleTestScript = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/connector', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptJson: jsonText })
      });
      const data = await res.json();
      if (data.valid) {
        setTestResult({ success: true, message: data.message });
      } else {
        setTestResult({ success: false, message: data.error || 'Validation failed.' });
      }
    } catch (e: any) {
      setTestResult({ success: false, message: e.message || 'Failed to reach validation endpoint.' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    try {
      const parsed = JSON.parse(jsonText);
      onSaveScript(parsed);
      onClose();
    } catch (e) {
      setTestResult({ success: false, message: 'Fix JSON syntax before saving.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-4xl h-[85vh] rounded-2xl bg-surface border border-line flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-line flex items-center justify-between bg-panel">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/30 flex items-center justify-center text-brand-400">
              <Code className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Unlisted Platform Connector Script Studio</span>
                <span className="px-2 py-0.5 rounded bg-brand-500/10 text-brand-400 border border-brand-500/20 text-[10px] font-mono">
                  HOT-RELOAD PREVIEW
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400">
                Write CSS selector maps for Playwright browser automation without server restarts or deploys.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-raised">
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* Studio Workspace Grid */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-line overflow-hidden">
          {/* JSON Code Editor */}
          <div className="flex flex-col p-4 space-y-3 bg-well">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span className="font-mono text-brand-400 font-semibold flex items-center gap-1.5">
                <Code className="w-3.5 h-3.5" />
                connector_spec.json
              </span>
              <div className="flex items-center gap-2 text-[11px]">
                <button 
                  onClick={() => navigator.clipboard.writeText(jsonText)} 
                  className="hover:text-white flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" /> Copy
                </button>
              </div>
            </div>

            <textarea
              value={jsonText}
              onChange={e => setJsonText(e.target.value)}
              className="flex-1 w-full bg-ink border border-line rounded-xl p-3.5 font-mono text-xs text-brand-300/90 leading-relaxed focus:outline-none focus:border-brand-500/40 resize-none scrollbar-thin"
              spellCheck={false}
            />

            <div className="flex items-center justify-between pt-1">
              <button
                onClick={handleTestScript}
                disabled={isTesting}
                className="px-4 py-2 rounded-xl bg-brand-500/20 hover:bg-brand-500/30 border border-brand-500/40 text-brand-300 text-xs font-semibold flex items-center gap-2 transition-all"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{isTesting ? 'Testing Selectors...' : 'Test Script Rules'}</span>
              </button>

              <button
                onClick={handleSave}
                className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-ink text-xs font-semibold flex items-center gap-1.5 transition-all shadow-lg shadow-brand-500/20"
              >
                <span>Save Connector</span>
              </button>
            </div>
          </div>

          {/* Selector Mapping & Playwright Virtual Simulation */}
          <div className="p-5 flex flex-col space-y-4 bg-surface overflow-y-auto">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2 border-b border-line pb-2">
              <Globe className="w-4 h-4 text-brand-400" />
              <span>Live Playwright Virtual Browser Simulation</span>
            </h3>

            {testResult && (
              <div className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                testResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-300'
              }`}>
                {testResult.success ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-400" /> : <AlertCircle className="w-4 h-4 mt-0.5 text-red-400" />}
                <p className="leading-relaxed">{testResult.message}</p>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-card border border-line space-y-1">
                <span className="text-[10px] text-zinc-400 font-mono">AUTOMATION WORKFLOW</span>
                <p className="text-zinc-300 font-semibold">1. Session Storage & AES Cookie Injection</p>
                <p className="text-[11px] text-zinc-400">Playwright loads target URL and injects encrypted session payload.</p>
              </div>

              <div className="p-3 rounded-xl bg-card border border-line space-y-1">
                <span className="text-[10px] text-zinc-400 font-mono">DOM SELECTOR BINDING</span>
                <p className="text-zinc-300 font-semibold">2. Target Element Query Matching</p>
                <p className="text-[11px] text-zinc-400">Evaluates input fields, post textareas, and publish buttons live.</p>
              </div>

              <div className="p-3 rounded-xl bg-card border border-line space-y-1">
                <span className="text-[10px] text-zinc-400 font-mono">COMMUNITY SCRIPT REPOSITORY</span>
                <p className="text-zinc-300 font-semibold">3. Export & Community Sharing</p>
                <p className="text-[11px] text-zinc-400">Share JSON connector scripts with other Palius OS users without code deploys.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
