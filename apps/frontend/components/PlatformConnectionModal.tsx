'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AuthLevel } from '@/lib/types';
import { BrandIcon } from '@/lib/brandIcons';
import {
  fetchConnectionCatalog,
  saveConnection,
  startOAuth,
  startBrowserSession,
  completeBrowserSession,
  cancelBrowserSession,
  AuthMethod,
  BrowserSession,
  ConnectablePlatform,
  ConnectionCatalog,
} from '@/lib/api';
import { EmbeddedBrowserView } from './EmbeddedBrowserView';
import {
  X,
  ShieldCheck,
  Globe,
  Key,
  AlertTriangle,
  CheckCircle2,
  Lock,
  ArrowRight,
  ExternalLink,
  Loader2,
  Ban,
  LogIn,
  UserPlus,
} from 'lucide-react';

interface PlatformConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultPlatform?: string;
  onConnectionSuccess: (platform: string, authLevel: AuthLevel) => void;
}

type Step = 'select' | 'credentials' | 'browser' | 'connecting' | 'result';

/** Level 3 can either sign into an existing account or create a new one. */
type BrowserMode = 'login' | 'register';

const GROUP_LABELS: Record<string, string> = {
  social: 'Social platforms',
  publishing: 'Blogs & newsletters',
  launch: 'Launch platforms',
};

const LEVEL_ICON: Record<string, React.ReactNode> = {
  'level-1': <Key className="w-4 h-4 mt-0.5 text-emerald-400" />,
  'level-2': <ShieldCheck className="w-4 h-4 mt-0.5 text-blue-400" />,
  'level-3': <Globe className="w-4 h-4 mt-0.5 text-brand-400" />,
};

export function PlatformConnectionModal({
  isOpen,
  onClose,
  defaultPlatform = 'instagram',
  onConnectionSuccess,
}: PlatformConnectionModalProps) {
  const [catalog, setCatalog] = useState<ConnectionCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState(defaultPlatform);
  const [selectedLevel, setSelectedLevel] = useState<string>('');
  const [step, setStep] = useState<Step>('select');
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ status: string; detail: string } | null>(null);

  // Level 3 state.
  const [browserMode, setBrowserMode] = useState<BrowserMode>('login');
  const [browserSession, setBrowserSession] = useState<BrowserSession | null>(null);
  const [browserSignedIn, setBrowserSignedIn] = useState(false);
  const [savingSession, setSavingSession] = useState(false);

  useEffect(() => {
    if (!isOpen || catalog) return;
    setLoading(true);
    fetchConnectionCatalog()
      .then((c) => setCatalog(c))
      .finally(() => setLoading(false));
  }, [isOpen, catalog]);

  const platform: ConnectablePlatform | undefined = useMemo(
    () => catalog?.platforms.find((p) => p.id === selectedPlatform),
    [catalog, selectedPlatform],
  );

  const method: AuthMethod | undefined = useMemo(
    () => platform?.methods.find((m) => m.level === selectedLevel) ?? platform?.methods[0],
    [platform, selectedLevel],
  );

  const grouped = useMemo(() => {
    const out: Record<string, ConnectablePlatform[]> = {};
    (catalog?.platforms ?? []).forEach((p) => {
      (out[p.group] ??= []).push(p);
    });
    return out;
  }, [catalog]);

  if (!isOpen) return null;

  const reset = () => {
    setStep('select');
    setValues({});
    setError('');
    setResult(null);
    setBrowserSession(null);
    setBrowserSignedIn(false);
    setSavingSession(false);
  };

  // Abandoning a login must close the Chromium context behind it. The worker
  // expires sessions on its own timer too, but leaving a live logged-in browser
  // open until then is exactly the thing not to do.
  const handleClose = () => {
    if (browserSession) cancelBrowserSession(browserSession.sessionId);
    reset();
    onClose();
  };

  const choosePlatform = (p: ConnectablePlatform) => {
    setSelectedPlatform(p.id);
    // Prefer a method that actually works over the first one listed.
    setSelectedLevel((p.methods.find((m) => m.available) ?? p.methods[0]).level);
    setValues({});
    setError('');
  };

  const proceed = () => {
    if (!method) return;
    if (!method.available) {
      setError(method.unavailable ?? 'This method is not available.');
      return;
    }
    if (method.level === 'level-2') {
      handleOAuth();
      return;
    }
    if (method.level === 'level-3') {
      handleBrowserLogin(browserMode);
      return;
    }
    setError('');
    setStep('credentials');
  };

  // -------------------------------------------------- level 3: browser login
  //
  // Opens the platform's own login page inside the worker's Chromium and
  // streams it here. Nothing is stored until the user says they are through —
  // which is the only way to handle 2FA without guessing.

  const handleBrowserLogin = async (mode: BrowserMode) => {
    setError('');
    setBrowserSignedIn(false);
    setStep('connecting');

    const res = await startBrowserSession(selectedPlatform, mode);
    if (!res.ok) {
      setError(res.error);
      setStep('select');
      return;
    }
    setBrowserSession(res.session);
    setBrowserMode(mode);
    setStep('browser');
  };

  const saveBrowserSession = async () => {
    if (!browserSession) return;
    setSavingSession(true);
    setError('');

    const res = await completeBrowserSession(browserSession.sessionId);
    setSavingSession(false);
    if (!res.ok) {
      // Stay on the browser view: the usual cause is saving before the login
      // finished, and the user can simply carry on in the same window.
      setError(res.error);
      return;
    }

    // The worker closes the session once it has been captured, so there is
    // nothing left to cancel.
    setBrowserSession(null);
    setResult({ status: res.connection.status, detail: res.connection.detail });
    setStep('result');
    if (res.connection.status === 'verified') {
      onConnectionSuccess(selectedPlatform, 'level-3' as AuthLevel);
    }
  };

  const abandonBrowserSession = () => {
    if (browserSession) cancelBrowserSession(browserSession.sessionId);
    setBrowserSession(null);
    setBrowserSignedIn(false);
    setError('');
    setStep('select');
  };

  const handleOAuth = async () => {
    setStep('connecting');
    const res = await startOAuth(selectedPlatform);
    if (!res.ok) {
      setError(res.error);
      setStep('credentials');
      return;
    }
    // Open on the provider's own domain, in the user's own browser.
    window.open(res.authUrl, '_blank', 'noopener,noreferrer');
    setResult({
      status: 'pending',
      detail: 'Approve access in the tab that just opened. This window updates once the provider redirects back.',
    });
    setStep('result');
  };

  const submitCredentials = async () => {
    if (!method) return;
    const missing = (method.fields ?? [])
      .filter((f) => f.required && !values[f.key]?.trim())
      .map((f) => f.label);
    if (missing.length) {
      setError(`Fill in: ${missing.join(', ')}`);
      return;
    }

    setError('');
    setStep('connecting');
    const res = await saveConnection({
      platform: selectedPlatform,
      authLevel: method.level,
      fields: values,
    });

    if (!res.ok) {
      setError(res.error);
      setStep('credentials');
      return;
    }

    setResult({ status: res.connection.status, detail: res.connection.detail });
    setStep('result');
    if (res.connection.status === 'verified') {
      onConnectionSuccess(selectedPlatform, method.level as AuthLevel);
    }
  };

  const fields = method?.fields ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in overflow-y-auto">
      {/* Capped to the viewport so the body scrolls instead of the dialog
          overflowing off-screen and taking its action button with it. The
          browser step needs far more room — a login page squeezed into 32rem
          is unusable. */}
      <div
        className={`w-full max-h-[90vh] flex flex-col rounded-2xl bg-panel border border-line overflow-hidden shadow-2xl ${
          step === 'browser' ? 'max-w-5xl' : 'max-w-lg'
        }`}
      >
        {/* Header */}
        <div className="shrink-0 p-5 border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/30 flex items-center justify-center text-brand-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Connect Platform Account</h2>
              <p className="text-[11px] text-zinc-400">
                {step === 'browser' && platform
                  ? `${platform.name} — ${browserMode === 'register' ? 'create an account' : 'sign in'} on their own page`
                  : step === 'credentials' && platform
                    ? `${platform.name} — ${method?.name}`
                    : 'Choose a platform, then how Palius should authenticate'}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-raised">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body — scrolls; actions live in the pinned footer */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5">
          {loading && (
            <div className="flex items-center justify-center py-16 gap-2 text-xs text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin text-brand-400" /> Loading connection catalog…
            </div>
          )}

          {!loading && !catalog && (
            <div className="p-4 rounded-xl bg-brand-500/10 border border-brand-500/30 text-xs text-zinc-300">
              <p className="font-semibold text-brand-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Backend not reachable
              </p>
              <p className="mt-1.5 leading-relaxed">
                Connecting an account stores a credential on the server, so the API has to be running. Start it and reopen
                this dialog.
              </p>
            </div>
          )}

          {/* ------------------------------------------------ platform picker */}
          {!loading && catalog && step === 'select' && (
            <>
              {Object.entries(grouped).map(([group, list]) => (
                <div key={group} className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-300">{GROUP_LABELS[group] ?? group}</label>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {list.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => choosePlatform(p)}
                        className={`p-2.5 rounded-xl border text-center transition-all ${
                          selectedPlatform === p.id
                            ? 'bg-brand-500/20 border-brand-500 text-brand-300 shadow-sm'
                            : 'bg-card border-line text-zinc-300 hover:bg-raised'
                        }`}
                      >
                        <BrandIcon id={p.id} className="w-5 h-5 mx-auto mb-1.5" />
                        <span className="text-[11px] font-semibold block truncate">{p.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* Auth methods for the chosen platform */}
              {platform && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-300">How should Palius authenticate?</label>
                  <div className="space-y-2 text-xs">
                    {platform.methods.map((m) => {
                      const active = method?.level === m.level;
                      return (
                        <button
                          key={m.level}
                          onClick={() => setSelectedLevel(m.level)}
                          disabled={!m.available}
                          className={`w-full text-left flex items-start gap-3 p-3 rounded-xl border transition-all ${
                            !m.available
                              ? 'bg-card/50 border-line text-zinc-500 cursor-not-allowed'
                              : active
                                ? 'bg-brand-500/10 border-brand-500/50 text-brand-200'
                                : 'bg-card border-line text-zinc-300 hover:bg-raised'
                          }`}
                        >
                          {m.available ? LEVEL_ICON[m.level] : <Ban className="w-4 h-4 mt-0.5 text-zinc-500" />}
                          <div className="min-w-0">
                            <div className="font-bold flex items-center gap-2">
                              {m.name}
                              {!m.available && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-zinc-700/60 text-zinc-300">
                                  UNAVAILABLE
                                </span>
                              )}
                              {m.available && m.verifiable && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300">
                                  VERIFIED ON SAVE
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-zinc-400 leading-relaxed mt-0.5">{m.summary}</p>
                            {!m.available && m.unavailable && (
                              <p className="text-[11px] text-brand-300/80 leading-relaxed mt-1">{m.unavailable}</p>
                            )}
                            {m.docsUrl && (
                              <a
                                href={m.docsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 mt-1 text-[10px] text-cyan-400 hover:text-cyan-300"
                              >
                                Provider docs <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Level 3 works just as well for an account that does not
                      exist yet, so offer both rather than assuming the user
                      already has one on every platform. */}
                  {method?.level === 'level-3' && method.available && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {[
                        {
                          mode: 'login' as BrowserMode,
                          icon: LogIn,
                          label: 'I have an account',
                          hint: 'Opens the sign-in page',
                        },
                        {
                          mode: 'register' as BrowserMode,
                          icon: UserPlus,
                          label: 'Create an account',
                          hint: 'Opens the sign-up page',
                        },
                      ].map(({ mode, icon: Icon, label, hint }) => (
                        <button
                          key={mode}
                          onClick={() => setBrowserMode(mode)}
                          className={`flex items-start gap-2 p-2.5 rounded-xl border text-left transition-all ${
                            browserMode === mode
                              ? 'bg-brand-500/10 border-brand-500/50 text-brand-200'
                              : 'bg-card border-line text-zinc-300 hover:bg-raised'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-[11px] font-bold">{label}</div>
                            <div className="text-[10px] text-zinc-400">{hint}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {catalog && !catalog.encryptionAvailable && (
                <div className="p-3 rounded-xl bg-brand-500/10 border border-brand-500/30 text-[11px] text-brand-200 leading-relaxed">
                  <span className="font-bold">PALIUS_SECRET_KEY is not set.</span> The server will refuse to store
                  credentials rather than write them to the database in plaintext. Set it and restart the API.
                </div>
              )}
            </>
          )}

          {/* ------------------------------------------------- credential form */}
          {step === 'credentials' && method && platform && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-card border border-line flex items-start gap-3">
                <BrandIcon id={platform.id} className="w-6 h-6 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-white">{platform.name}</p>
                  <p className="text-[11px] text-zinc-400 leading-relaxed mt-0.5">{method.summary}</p>
                </div>
              </div>

              {fields.length === 0 && (
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Nothing to enter — this destination needs no credentials.
                </p>
              )}

              {fields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                    {f.label}
                    {f.required && <span className="text-[10px] text-brand-400">required</span>}
                    {f.secret && <Lock className="w-3 h-3 text-zinc-500" />}
                  </label>
                  <input
                    type={f.secret ? 'password' : 'text'}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={f.placeholder}
                    value={values[f.key] ?? ''}
                    onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full bg-well border border-line rounded-xl px-3 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500/50 font-mono"
                  />
                  {f.help && <p className="text-[10px] text-zinc-500 leading-relaxed">{f.help}</p>}
                </div>
              ))}

              <p className="text-[10px] text-zinc-500 leading-relaxed flex items-start gap-1.5">
                <Lock className="w-3 h-3 mt-0.5 shrink-0" />
                Secrets are sealed with AES-256-GCM before they touch the database and are never sent back to this screen.
              </p>
            </div>
          )}

          {/* ------------------------------------------------- embedded browser */}
          {step === 'browser' && browserSession && (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-brand-500/10 border border-brand-500/30">
                <Lock className="w-4 h-4 mt-0.5 shrink-0 text-brand-400" />
                <p className="text-[11px] text-brand-100 leading-relaxed">{browserSession.notice}</p>
              </div>

              <EmbeddedBrowserView
                streamUrl={browserSession.streamUrl}
                onSignedIn={() => setBrowserSignedIn(true)}
                onClosed={() => {
                  setError('The browser session ended before it was saved. Start the login again.');
                  setBrowserSession(null);
                  setStep('select');
                }}
              />

              <div
                className={`p-3 rounded-xl border text-[11px] leading-relaxed ${
                  browserSignedIn
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
                    : 'bg-card border-line text-zinc-400'
                }`}
              >
                {browserSignedIn ? (
                  <>
                    <span className="font-bold">You look signed in.</span> Save the session to finish. Palius keeps only
                    what keeps you logged in — encrypted with AES-256-GCM — and never your password.
                  </>
                ) : (
                  <>
                    Finish signing in above, including any two-factor step. Then press{' '}
                    <span className="font-bold text-zinc-200">Save session</span>. Palius cannot tell when you are done
                    on every platform, so it waits for you rather than guessing.
                  </>
                )}
              </div>
            </div>
          )}

          {step === 'connecting' && (
            <div className="py-10 text-center space-y-4">
              <div className="w-12 h-12 rounded-full border-4 border-brand-500/20 border-t-brand-500 animate-spin mx-auto" />
              {method?.level === 'level-3' ? (
                <>
                  <h3 className="text-sm font-bold text-white">
                    Starting a browser and opening {platform?.name}…
                  </h3>
                  <p className="text-xs text-zinc-400">Chromium takes a moment to launch the first time.</p>
                </>
              ) : (
                <>
                  <h3 className="text-sm font-bold text-white">Checking credentials with the provider…</h3>
                  <p className="text-xs text-zinc-400">
                    Palius asks the platform to confirm before calling this connected.
                  </p>
                </>
              )}
            </div>
          )}

          {/* ------------------------------------------------------- result */}
          {step === 'result' && result && (
            <div className="py-6 text-center space-y-3">
              {result.status === 'verified' ? (
                <>
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                  <h3 className="text-sm font-bold text-white">Connected and verified</h3>
                </>
              ) : result.status === 'failed' ? (
                <>
                  <AlertTriangle className="w-12 h-12 text-red-400 mx-auto" />
                  <h3 className="text-sm font-bold text-white">The platform rejected these credentials</h3>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-12 h-12 text-brand-400 mx-auto" />
                  <h3 className="text-sm font-bold text-white">Saved — not verified</h3>
                </>
              )}
              <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">{result.detail}</p>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/40 text-[11px] text-red-300 leading-relaxed">
              {error}
            </div>
          )}
        </div>

        {/* Pinned footer — the action stays reachable however tall the body gets */}
        {step === 'select' && catalog && (
          <div className="shrink-0 p-4 border-t border-line bg-surface">
            <button
              onClick={proceed}
              disabled={!method?.available}
              className="w-full py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:opacity-40 disabled:cursor-not-allowed text-ink font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-brand-500/20 transition-all"
            >
              <span>
                {method?.level === 'level-2'
                  ? `Continue to ${platform?.name}`
                  : method?.level === 'level-3'
                    ? browserMode === 'register'
                      ? `Create a ${platform?.name} account`
                      : `Sign in to ${platform?.name}`
                    : 'Enter credentials'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {step === 'browser' && (
          <div className="shrink-0 p-4 border-t border-line bg-surface flex gap-2">
            <button
              onClick={abandonBrowserSession}
              disabled={savingSession}
              className="w-1/3 py-2.5 rounded-xl bg-raised hover:bg-raised text-zinc-300 text-xs font-semibold disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={saveBrowserSession}
              disabled={savingSession}
              className="w-2/3 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:opacity-40 text-ink font-semibold text-xs flex items-center justify-center gap-2 transition-all"
            >
              {savingSession ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving &amp; verifying…</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Save session</span>
                </>
              )}
            </button>
          </div>
        )}

        {step === 'credentials' && (
          <div className="shrink-0 p-4 border-t border-line bg-surface flex gap-2">
            <button
              onClick={() => { setStep('select'); setError(''); }}
              className="w-1/3 py-2.5 rounded-xl bg-raised hover:bg-raised text-zinc-300 text-xs font-semibold"
            >
              Back
            </button>
            <button
              onClick={submitCredentials}
              className="w-2/3 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-ink font-semibold text-xs flex items-center justify-center gap-2 transition-all"
            >
              <Lock className="w-4 h-4" />
              <span>Save &amp; verify</span>
            </button>
          </div>
        )}

        {step === 'result' && (
          <div className="shrink-0 p-4 border-t border-line bg-surface flex gap-2">
            <button
              onClick={() => { setStep('select'); setResult(null); setError(''); }}
              className="w-1/3 py-2.5 rounded-xl bg-raised hover:bg-raised text-zinc-300 text-xs font-semibold"
            >
              Connect another
            </button>
            <button
              onClick={handleClose}
              className="w-2/3 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-ink font-semibold text-xs"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
