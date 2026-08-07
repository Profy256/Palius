'use client';

import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { adminActor, setAdminActor, setAdminToken, verifyAdminToken } from '@/lib/api';

// ---------------------------------------------------------------------------
// Admin unlock.
//
// The backend guards /admin/* with ADMIN_TOKEN. The operator pastes it here
// once; it is kept in this browser's localStorage and sent as X-Admin-Token.
// It is deliberately not a NEXT_PUBLIC_* build variable, because those end up
// readable inside the shipped JavaScript.
//
// The operator's name is captured at the same time — every privileged action
// is written to the audit trail, and "admin did it" is not an audit trail.
// ---------------------------------------------------------------------------

export function AdminUnlock({ onUnlocked }: { onUnlocked: () => void }) {
  const [token, setToken] = useState('');
  const [actor, setActor] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setActor(adminActor() === 'admin' ? '' : adminActor());
  }, []);

  const submit = async () => {
    if (!token.trim()) {
      setError('Paste the ADMIN_TOKEN value from your backend environment.');
      return;
    }
    setChecking(true);
    setError('');

    const ok = await verifyAdminToken(token.trim());
    setChecking(false);

    if (!ok) {
      setError(
        'The backend rejected that token. Check it matches ADMIN_TOKEN on the API exactly, and that the API is reachable.',
      );
      return;
    }
    setAdminToken(token.trim());
    if (actor.trim()) setAdminActor(actor.trim());
    onUnlocked();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-panel border border-line p-6 space-y-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-brand-400" />
            <h1 className="text-base font-bold text-white">Palius Admin</h1>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            This panel can read every customer&apos;s data and change their billing, so it needs
            the admin token before it will load anything.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-zinc-300">Admin token</label>
          <input
            type="password"
            value={token}
            onChange={e => setToken(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="Value of ADMIN_TOKEN on the backend"
            className="w-full bg-well border border-line rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-500 font-mono"
          />
          <p className="text-[10px] text-zinc-500 leading-relaxed">
            Stored in this browser only, never in the app bundle.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-zinc-300">
            Your name <span className="text-zinc-500 font-normal">(for the audit trail)</span>
          </label>
          <input
            value={actor}
            onChange={e => setActor(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="e.g. profy"
            className="w-full bg-well border border-line rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-500"
          />
          <p className="text-[10px] text-zinc-500 leading-relaxed">
            Recorded against every suspension, plan change, refund and export you make.
          </p>
        </div>

        {error && (
          <p className="text-[11px] text-red-300 flex items-start gap-1.5 leading-relaxed">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
          </p>
        )}

        <button
          onClick={submit}
          disabled={checking}
          className="w-full px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-ink text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
          {checking ? 'Checking…' : 'Unlock admin panel'}
        </button>

        <p className="text-[10px] text-zinc-500 leading-relaxed border-t border-line pt-3">
          No token set on your backend yet? Generate one with{' '}
          <code className="text-zinc-300">openssl rand -base64 32</code>, put it in the API&apos;s
          environment as <code className="text-zinc-300">ADMIN_TOKEN</code>, and restart it.
          While <code className="text-zinc-300">ADMIN_TOKEN</code> is unset the API only accepts
          admin calls in development.
        </p>
      </div>
    </div>
  );
}
