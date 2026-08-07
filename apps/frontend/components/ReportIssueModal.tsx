'use client';

import React, { useEffect, useState } from 'react';
import { X, LifeBuoy, Send, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { submitIssue, fetchIssueMeta } from '@/lib/api';

// ---------------------------------------------------------------------------
// Report an issue.
//
// The point of this form is that it reaches an operator who can see the
// reporter's account, spend and failed operations next to their words. So it
// asks for the least it can — what broke, how badly — and fills in the rest
// (which screen, which browser) from context rather than making the customer
// describe their own environment.
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  bug: 'Something is broken',
  billing: 'Billing or subscription',
  credits: 'Credits and balance',
  generation: 'Image or video generation',
  publishing: 'Publishing a post',
  connection: 'Connecting an account',
  account: 'My account',
  'feature-request': 'Feature request',
  other: 'Something else',
};

const SEVERITY_LABELS: Record<string, { label: string; hint: string }> = {
  critical: { label: 'Critical', hint: 'I cannot use the product at all' },
  high: { label: 'High', hint: 'A core feature is broken' },
  normal: { label: 'Normal', hint: 'Annoying, but I can work around it' },
  low: { label: 'Low', hint: 'Minor or cosmetic' },
};

export function ReportIssueModal({
  isOpen,
  onClose,
  currentPage,
  operationId,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentPage?: string;
  operationId?: string;
}) {
  const [categories, setCategories] = useState<string[]>(Object.keys(CATEGORY_LABELS));
  const [severities, setSeverities] = useState<string[]>(Object.keys(SEVERITY_LABELS));

  const [category, setCategory] = useState('bug');
  const [severity, setSeverity] = useState('normal');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [email, setEmail] = useState('');

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState('');

  // The option lists come from the backend so the two never drift apart; the
  // hardcoded ones above are only the offline fallback.
  useEffect(() => {
    if (!isOpen) return;
    fetchIssueMeta().then(meta => {
      if (meta?.categories?.length) setCategories(meta.categories);
      if (meta?.severities?.length) setSeverities(meta.severities);
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSent(null);
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const reset = () => {
    setSubject('');
    setBody('');
    setCategory('bug');
    setSeverity('normal');
  };

  const send = async () => {
    if (!subject.trim() || !body.trim()) {
      setError('Please give it a title and describe what happened.');
      return;
    }
    setSending(true);
    setError('');

    const res = await submitIssue({
      category,
      severity,
      subject: subject.trim(),
      body: body.trim(),
      page: currentPage,
      operationId,
      contactEmail: email.trim(),
    });

    setSending(false);
    if (!res) {
      setError('Could not reach support right now. Please try again in a moment.');
      return;
    }
    setSent(res.issue.id);
    reset();
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-panel border border-line shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 bg-surface border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LifeBuoy className="w-4 h-4 text-brand-400" />
            <h3 className="text-sm font-bold text-white">Report an issue</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-raised">
            <X className="w-4 h-4" />
          </button>
        </div>

        {sent ? (
          <div className="p-6 text-center space-y-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
            <h4 className="text-sm font-bold text-white">Report sent</h4>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Your report reached the team with your account and recent activity attached, so
              they can look into it without asking you to repeat yourself.
            </p>
            <p className="text-[11px] text-zinc-500 font-mono">{sent}</p>
            <p className="text-[11px] text-zinc-400">
              Track it under <span className="text-zinc-200 font-semibold">Settings → Support</span>.
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                onClick={() => setSent(null)}
                className="px-4 py-2 rounded-xl bg-card border border-line text-xs font-semibold text-zinc-200"
              >
                Report another
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-ink text-xs font-bold"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-300">What is this about?</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full bg-well border border-line rounded-xl px-3 py-2 text-xs text-white"
              >
                {categories.map(c => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-300">How much is it blocking you?</label>
              <div className="grid grid-cols-2 gap-2">
                {severities.map(s => {
                  const meta = SEVERITY_LABELS[s] ?? { label: s, hint: '' };
                  return (
                    <button
                      key={s}
                      onClick={() => setSeverity(s)}
                      className={`px-3 py-2 rounded-xl border text-left transition-colors ${
                        severity === s
                          ? 'bg-brand-500/15 border-brand-500/40'
                          : 'bg-card border-line hover:border-line-strong'
                      }`}
                    >
                      <span className={`text-xs font-bold block ${severity === s ? 'text-brand-300' : 'text-white'}`}>
                        {meta.label}
                      </span>
                      <span className="text-[10px] text-zinc-400 leading-tight block">{meta.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-300">Title</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                maxLength={200}
                placeholder="Video generation failed but credits were taken"
                className="w-full bg-well border border-line rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-300">What happened?</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={5}
                maxLength={8000}
                placeholder="What you were doing, what you expected, and what happened instead."
                className="w-full bg-well border border-line rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-500 leading-relaxed"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-300">
                Reply-to email <span className="text-zinc-500 font-normal">(optional)</span>
              </label>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                type="email"
                placeholder="Leave blank to use your account email"
                className="w-full bg-well border border-line rounded-xl px-3 py-2 text-xs text-white placeholder:text-zinc-500"
              />
            </div>

            {currentPage && (
              <p className="text-[10px] text-zinc-500">
                We&apos;ll attach the screen you were on ({currentPage}) and your recent activity.
              </p>
            )}

            {error && (
              <p className="text-[11px] text-red-300 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-card border border-line text-xs font-semibold text-zinc-300"
              >
                Cancel
              </button>
              <button
                onClick={send}
                disabled={sending}
                className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-ink text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {sending ? 'Sending…' : 'Send report'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
