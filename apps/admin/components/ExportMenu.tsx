'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Download, Loader2, Check, AlertTriangle } from 'lucide-react';
import { ExportFormat, downloadExport } from '@/lib/api';

// ---------------------------------------------------------------------------
// Download control.
//
// The filters currently on screen are passed through to the server, so what
// lands in the spreadsheet is what the operator is looking at — an export that
// silently ignores the active filter is worse than no export at all.
// ---------------------------------------------------------------------------

const FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: 'xlsx', label: 'Excel (.xlsx)', hint: 'formatted workbook, frozen header' },
  { id: 'csv', label: 'CSV (.csv)', hint: 'opens anywhere' },
  { id: 'tsv', label: 'Tab-separated (.tsv)', hint: 'paste straight into Sheets' },
  { id: 'json', label: 'JSON (.json)', hint: 'for scripts and imports' },
];

export function ExportMenu({
  dataset,
  params = {},
  label = 'Export',
}: {
  dataset: string;
  params?: Record<string, string>;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const go = async (format: ExportFormat) => {
    setBusy(format);
    setResult(null);
    // Empty filter values would export "segment=" and match nothing.
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v));
    const res = await downloadExport(dataset, format, clean);
    setBusy(null);
    setOpen(false);
    setResult(res.ok ? { ok: true, text: res.filename } : { ok: false, text: res.error });
    setTimeout(() => setResult(null), 6000);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="px-3 py-2 rounded-xl bg-card hover:bg-raised border border-line text-xs font-semibold text-zinc-200 flex items-center gap-1.5"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        {label}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl bg-panel border border-line shadow-2xl z-30 overflow-hidden">
          <p className="px-3 py-2 text-[10px] font-mono uppercase font-bold text-zinc-500 border-b border-line">
            Download as
          </p>
          {FORMATS.map(f => (
            <button
              key={f.id}
              onClick={() => go(f.id)}
              className="w-full text-left px-3 py-2.5 hover:bg-raised transition-colors border-b border-line/50 last:border-0"
            >
              <span className="text-xs font-semibold text-white block">{f.label}</span>
              <span className="text-[10px] text-zinc-400">{f.hint}</span>
            </button>
          ))}
        </div>
      )}

      {result && (
        <div
          className={`absolute right-0 mt-2 w-72 rounded-xl border px-3 py-2 text-[11px] z-30 flex items-start gap-2 ${
            result.ok
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
              : 'bg-red-500/10 border-red-500/40 text-red-200'
          }`}
        >
          {result.ok ? <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
          <span className="break-all">{result.ok ? `Downloaded ${result.text}` : result.text}</span>
        </div>
      )}
    </div>
  );
}
