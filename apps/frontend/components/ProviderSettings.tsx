'use client';

import React, { useEffect, useState } from 'react';
import { PROVIDERS } from '@/lib/providers';
import { getProviderConfig, setProviderConfig, isDesktop, type ProviderConfig } from '@/lib/userConfig';
import { KeyRound, Check, ShieldCheck, Globe, Save, Trash2, ExternalLink } from 'lucide-react';

export function ProviderSettings() {
  const [provider, setProvider] = useState<string>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [loaded, setLoaded] = useState(false);

  const selected = PROVIDERS.find((p) => p.id === provider);
  const isCustom = provider === 'openai-compatible';

  useEffect(() => {
    (async () => {
      const cfg = await getProviderConfig();
      if (cfg) {
        setProvider(cfg.provider);
        setApiKey(cfg.apiKey);
        setModel(cfg.model);
        setBaseUrl(cfg.baseUrl ?? '');
      }
      setLoaded(true);
    })();
  }, []);

  function onProviderChange(next: string) {
    setProvider(next);
    const def = PROVIDERS.find((p) => p.id === next);
    if (def) {
      setModel(def.defaultModel);
      setBaseUrl(def.baseUrl);
    }
  }

  async function handleSave() {
    if (!apiKey.trim()) {
      setStatus('error');
      setMessage('Enter an API key for the selected provider.');
      return;
    }
    const def = PROVIDERS.find((p) => p.id === provider);
    const cfg: ProviderConfig = {
      provider: provider as ProviderConfig['provider'],
      apiKey: apiKey.trim(),
      model: model.trim() || def?.defaultModel || '',
      baseUrl: isCustom ? baseUrl.trim() : undefined,
    };
    await setProviderConfig(cfg);
    setStatus('saved');
    setMessage(
      isDesktop()
        ? 'Saved — your key is encrypted on this device (Electron safeStorage).'
        : 'Saved to this browser (localStorage). For encrypted storage, use the desktop app.',
    );
  }

  async function handleClear() {
    await setProviderConfig(null);
    setApiKey('');
    setModel('');
    setBaseUrl('');
    setStatus('idle');
    setMessage('Provider config cleared.');
  }

  if (!loaded) {
    return <div className="p-4 text-zinc-400 text-xs">Loading provider settings…</div>;
  }

  return (
    <div className="p-5 rounded-2xl bg-panel border border-line space-y-4">
      <div className="flex items-center gap-2 border-b border-line pb-3">
        <KeyRound className="w-4 h-4 text-purple-400" />
        <h3 className="text-sm font-bold text-white">Bring Your Own AI Provider</h3>
      </div>
      <p className="text-[11px] text-zinc-400">
        Supply your own key for any provider. The desktop app calls the provider directly — your key is
        never sent to a Palius server.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            onClick={() => onProviderChange(p.id)}
            className={`px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
              provider === p.id
                ? 'border-purple-500 bg-purple-500/10 text-purple-200'
                : 'border-line bg-card text-zinc-300 hover:border-purple-500/40'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {selected?.docsUrl && (
        <a
          href={selected.docsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] text-purple-300 hover:text-purple-200"
        >
          <ExternalLink className="w-3 h-3" /> Get an API key for {selected.label}
        </a>
      )}

      <div className="space-y-1.5">
        <label className="text-[11px] uppercase tracking-wide text-zinc-400 font-mono">API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-... / AIza... / your key"
          className="w-full px-3 py-2.5 rounded-xl bg-card border border-line text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] uppercase tracking-wide text-zinc-400 font-mono">Model</label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={selected?.modelHint ?? 'model name'}
          className="w-full px-3 py-2.5 rounded-xl bg-card border border-line text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
        />
        {selected?.defaultModel && (
          <p className="text-[10px] text-zinc-500">
            Default: {selected.defaultModel}
            {selected.id === 'openrouter' && ' — auto-routes each prompt to a suitable model.'}
            {selected.freeformModel && ' Any model the provider supports also works.'}
          </p>
        )}
      </div>

      {isCustom && (
        <div className="space-y-1.5">
          <label className="text-[11px] uppercase tracking-wide text-zinc-400 font-mono">Base URL</label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://your-provider/v1"
            className="w-full px-3 py-2.5 rounded-xl bg-card border border-line text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
          />
        </div>
      )}

      <div className="flex items-center gap-2 text-[11px] text-zinc-400">
        {isDesktop() ? (
          <span className="inline-flex items-center gap-1.5 text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" /> Encrypted with Electron safeStorage
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5" /> Stored locally in this browser
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs flex items-center gap-2 transition-all"
        >
          <Save className="w-3.5 h-3.5" /> Save provider
        </button>
        <button
          onClick={handleClear}
          className="px-4 py-2.5 rounded-xl bg-card border border-line text-zinc-300 hover:text-white hover:border-red-500/40 text-xs flex items-center gap-2 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" /> Clear
        </button>
      </div>

      {status !== 'idle' && (
        <div
          className={`flex items-center gap-2 text-xs px-4 py-3 rounded-xl border ${
            status === 'saved'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
        >
          {status === 'saved' && <Check className="w-4 h-4" />}
          {message}
        </div>
      )}
    </div>
  );
}
