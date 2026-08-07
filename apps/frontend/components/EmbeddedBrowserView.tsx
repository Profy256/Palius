'use client';

// ---------------------------------------------------------------------------
// The embedded browser.
//
// Frames arrive as JPEGs over a WebSocket straight from the Playwright worker
// and are drawn to a canvas; mouse and keyboard events go back the other way.
// What the user sees and types is the platform's real login page, served from
// the platform's own domain inside a browser Palius drives but does not read.
//
// Two details are deliberate:
//
//   Coordinates are normalised to 0..1 before they are sent, so the canvas can
//   be rendered at any size without this component and the worker having to
//   agree on a scale factor.
//
//   Printable characters are sent as text rather than as key codes. Key codes
//   assume a US layout, which silently produces the wrong character for anyone
//   typing a password on an AZERTY or Cyrillic keyboard.
// ---------------------------------------------------------------------------

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Lock,
  Loader2,
  WifiOff,
  CheckCircle2,
} from 'lucide-react';

interface EmbeddedBrowserViewProps {
  streamUrl: string;
  /** Fires when the worker recognises a completed login. */
  onSignedIn?: () => void;
  /** Fires when the session ends on the worker's side (expiry, crash, cancel). */
  onClosed?: (reason: string) => void;
}

type Connection = 'connecting' | 'live' | 'closed' | 'error';

/** Keys worth forwarding as key events rather than as text. */
const CONTROL_KEYS = new Set([
  'Enter',
  'Tab',
  'Backspace',
  'Delete',
  'Escape',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

export function EmbeddedBrowserView({ streamUrl, onSignedIn, onClosed }: EmbeddedBrowserViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Dimensions of the frames currently arriving. Seeded with the viewport the
  // API asks the worker for, so the box is the right shape before frame one.
  const [frameSize, setFrameSize] = useState({ w: 1280, h: 800 });
  const wsRef = useRef<WebSocket | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  const [connection, setConnection] = useState<Connection>('connecting');
  const [url, setUrl] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [message, setMessage] = useState('');

  // Callbacks live in refs so the socket effect depends only on streamUrl. A
  // parent re-render must not tear down a login that is halfway through.
  const signedInCb = useRef(onSignedIn);
  const closedCb = useRef(onClosed);
  useEffect(() => {
    signedInCb.current = onSignedIn;
    closedCb.current = onClosed;
  });

  const send = useCallback((msg: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  // -- socket ---------------------------------------------------------------

  useEffect(() => {
    if (!streamUrl) return;

    const ws = new WebSocket(streamUrl);
    wsRef.current = ws;
    let disposed = false;

    // Decoding on the main thread with an Image element is fast enough for
    // screencast frames and avoids a worker just to paint a login form.
    const image = new Image();
    let pending: string | null = null;
    let decoding = false;

    const paint = () => {
      if (!pending || decoding) return;
      decoding = true;
      const next = pending;
      pending = null;
      image.onload = () => {
        decoding = false;
        const canvas = canvasRef.current;
        if (canvas && !disposed) {
          if (canvas.width !== image.naturalWidth || canvas.height !== image.naturalHeight) {
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            // The displayed box has to follow the frame, not a fixed guess.
            // An OAuth popup ("Continue with Google") is its own window with
            // its own viewport, and the worker switches the stream to it — so
            // a hardcoded ratio squashed a tall 500x600 popup into a 16:10
            // box and the page came out stretched.
            setFrameSize({ w: image.naturalWidth, h: image.naturalHeight });
          }
          canvas.getContext('2d')?.drawImage(image, 0, 0);
        }
        paint(); // a newer frame may have arrived while this one decoded
      };
      image.onerror = () => {
        decoding = false;
        paint();
      };
      image.src = next;
    };

    ws.onopen = () => setConnection('live');

    ws.onmessage = (event) => {
      let msg: any;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      switch (msg.t) {
        case 'frame':
          // Dropping stale frames rather than queueing them is what keeps
          // typing feeling immediate on a slow connection.
          pending = `data:image/jpeg;base64,${msg.data}`;
          paint();
          break;
        case 'url':
          setUrl(msg.url ?? '');
          break;
        case 'signedin':
          setSignedIn(true);
          signedInCb.current?.();
          break;
        case 'status':
          if (msg.status === 'signed-in') setSignedIn(true);
          if (msg.message) setMessage(msg.message);
          break;
        case 'inputerror':
          // Transient by nature (an element moved mid-click); not worth
          // interrupting the user over.
          break;
        case 'closed':
          setConnection('closed');
          closedCb.current?.(msg.reason ?? 'closed');
          break;
      }
    };

    ws.onerror = () => setConnection('error');
    ws.onclose = () => {
      if (!disposed) setConnection((c) => (c === 'closed' ? c : 'error'));
    };

    return () => {
      disposed = true;
      image.onload = null;
      image.onerror = null;
      wsRef.current = null;
      ws.close();
    };
  }, [streamUrl]);

  // -- input ----------------------------------------------------------------

  /** Canvas-relative pixel position expressed as 0..1 of the viewport. */
  const normalise = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  const handleMouse = (action: 'move' | 'down' | 'up' | 'click') => (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (connection !== 'live') return;
    if (action === 'click') {
      // Focus the surface so the very next keystroke reaches the page rather
      // than the app behind it.
      surfaceRef.current?.focus();
      e.preventDefault();
    }
    const { x, y } = normalise(e);
    send({ t: 'mouse', action, x, y, button: e.button, clickCount: e.detail || 1 });
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (connection !== 'live') return;
    const rect = e.currentTarget.getBoundingClientRect();
    send({
      t: 'mouse',
      action: 'wheel',
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
      deltaX: e.deltaX,
      deltaY: e.deltaY,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (connection !== 'live') return;

    // Leave the browser's own shortcuts alone, except paste, which people
    // reasonably expect to work when filling in a password.
    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === 'v') return;
      e.preventDefault();
      send({ t: 'key', action: 'press', key: e.key });
      return;
    }

    if (CONTROL_KEYS.has(e.key)) {
      e.preventDefault();
      send({ t: 'key', action: 'press', key: e.key });
      return;
    }

    if (e.key.length === 1) {
      e.preventDefault();
      send({ t: 'text', text: e.key });
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (connection !== 'live') return;
    const text = e.clipboardData.getData('text');
    if (text) {
      e.preventDefault();
      send({ t: 'text', text });
    }
  };

  const navigate = (action: 'back' | 'forward' | 'reload') => () => send({ t: 'nav', action });

  // -- render ---------------------------------------------------------------

  return (
    <div className="rounded-xl border border-line overflow-hidden bg-well">
      {/* Chrome — the real URL is shown at all times so the user can confirm
          for themselves which domain they are typing a password into. */}
      <div className="flex items-center gap-2 px-2.5 py-2 bg-card border-b border-line">
        <div className="flex items-center gap-1">
          {[
            { icon: ArrowLeft, action: 'back' as const, label: 'Back' },
            { icon: ArrowRight, action: 'forward' as const, label: 'Forward' },
            { icon: RotateCw, action: 'reload' as const, label: 'Reload' },
          ].map(({ icon: Icon, action, label }) => (
            <button
              key={action}
              onClick={navigate(action)}
              disabled={connection !== 'live'}
              aria-label={label}
              className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-raised disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1 rounded-md bg-well border border-line">
          <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
          <span className="text-[11px] text-zinc-300 font-mono truncate" title={url}>
            {url || 'about:blank'}
          </span>
        </div>

        <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1">
          {connection === 'connecting' && (
            <span className="text-zinc-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Connecting
            </span>
          )}
          {connection === 'live' &&
            (signedIn ? (
              <span className="text-emerald-300 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Signed in
              </span>
            ) : (
              <span className="text-brand-300">Live</span>
            ))}
          {(connection === 'error' || connection === 'closed') && (
            <span className="text-red-300 flex items-center gap-1">
              <WifiOff className="w-3 h-3" /> Disconnected
            </span>
          )}
        </span>
      </div>

      {/* Viewport. tabIndex makes the surface focusable so keystrokes have
          somewhere to go; the canvas itself cannot take focus.

          items-center is load-bearing: a flex parent defaults to
          align-items:stretch, which forces the canvas to the container's
          height and squashes the picture no matter what aspect-ratio says. */}
      <div
        ref={surfaceRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        className="relative outline-none focus:ring-1 focus:ring-brand-500/50 flex justify-center items-center bg-well"
      >
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouse('move')}
          onMouseDown={handleMouse('down')}
          onMouseUp={handleMouse('up')}
          onClick={handleMouse('click')}
          onContextMenu={(e) => e.preventDefault()}
          onWheel={handleWheel}
          className="block bg-white cursor-default max-w-full"
          style={{
            // Follow the real frame so nothing is ever distorted. Both axes
            // stay auto on purpose: pinning width to 100% while capping height
            // would clamp one axis and stretch the picture — the exact bug
            // this replaces. The canvas's own bitmap size drives the ratio and
            // the max- rules only ever scale it down.
            aspectRatio: `${frameSize.w} / ${frameSize.h}`,
            width: 'auto',
            height: 'auto',
            maxWidth: '100%',
            maxHeight: '62vh',
          }}
        />

        {connection === 'connecting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-well/90">
            <Loader2 className="w-6 h-6 animate-spin text-brand-400" />
            <p className="text-xs text-zinc-400">Opening the login page…</p>
          </div>
        )}

        {(connection === 'error' || connection === 'closed') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-well/95 px-6 text-center">
            <WifiOff className="w-6 h-6 text-red-400" />
            <p className="text-xs font-semibold text-white">The browser session ended</p>
            <p className="text-[11px] text-zinc-400 leading-relaxed max-w-xs">
              {message || 'Nothing was saved. Close this and start the login again.'}
            </p>
          </div>
        )}
      </div>

      <p className="px-3 py-2 text-[10px] text-zinc-500 leading-relaxed border-t border-line bg-card">
        Click the page once, then type as usual. You are on {url ? new URL(url).hostname : 'the platform'}&apos;s own
        login page — Palius forwards your keystrokes to it and never reads what you type.
      </p>
    </div>
  );
}
