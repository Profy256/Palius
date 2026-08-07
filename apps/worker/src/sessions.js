// ---------------------------------------------------------------------------
// Login sessions.
//
// A session is one Chromium context opened at a platform's own login (or
// sign-up) page, streamed to the user's screen so they can type their password
// and clear 2FA themselves. Two properties are load-bearing:
//
//   1. The worker never sees a password as a value. Keystrokes are dispatched
//      into Chromium and the field belongs to the platform's own page. There is
//      no code path here that reads an input's value, and there must never be.
//   2. What we keep afterwards is the storage state — cookies, localStorage,
//      sessionStorage — which is exactly what "stay logged in" means. It goes
//      back to the API, which seals it with AES-256-GCM before it is stored.
//
// Streaming uses CDP Page.startScreencast rather than a screenshot loop.
// Screencast is event-driven: frames arrive when the page actually changes, so
// an idle login form costs nothing while typing stays responsive.
// ---------------------------------------------------------------------------

import crypto from 'node:crypto';
import { newContext } from './browser.js';

/** Sessions die on their own so an abandoned tab cannot pin a Chromium context. */
const SESSION_TTL_MS = Number(process.env.WORKER_SESSION_TTL_MS || 15 * 60 * 1000);
const MAX_SESSIONS = Number(process.env.WORKER_MAX_SESSIONS || 8);

/** @type {Map<string, Session>} */
const sessions = new Map();

class Session {
  constructor({ id, ticket, platform, mode, viewport, successUrlPattern, signedInSelector }) {
    this.id = id;
    this.ticket = ticket;
    this.platform = platform;
    this.mode = mode; // 'login' | 'register'
    this.viewport = viewport;
    this.successUrlPattern = successUrlPattern ? new RegExp(successUrlPattern) : null;
    this.signedInSelector = signedInSelector || '';

    this.status = 'starting'; // starting | open | signed-in | captured | closed
    this.createdAt = Date.now();
    this.context = null;
    this.page = null;
    this.cdp = null;
    this.viewer = null; // one WebSocket at a time; a second connection replaces it
    this.streaming = false;
    this.lastError = '';

    this.expiry = setTimeout(() => {
      this.close('expired').catch(() => {});
    }, SESSION_TTL_MS);
  }

  // -- lifecycle ------------------------------------------------------------

  async open(startUrl) {
    this.context = await newContext({ viewport: this.viewport });
    this.page = await this.context.newPage();

    // Popup logins ("Continue with Google") open a second tab. Follow it, or
    // the user ends up staring at a frozen opener while the real form is on a
    // page nobody is streaming.
    this.context.on('page', (p) => {
      this.adoptPage(p).catch(() => {});
    });

    this.page.on('framenavigated', (frame) => {
      if (frame === this.page.mainFrame()) this.onNavigated().catch(() => {});
    });

    await this.page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    this.status = 'open';
    await this.onNavigated();
    return this;
  }

  /** Switches the stream to a newly opened tab (OAuth popups, interstitials). */
  async adoptPage(page) {
    if (page === this.page || this.status === 'closed') return;
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    const previous = this.page;
    this.page = page;
    page.on('framenavigated', (frame) => {
      if (frame === this.page.mainFrame()) this.onNavigated().catch(() => {});
    });
    page.on('close', () => {
      // When the popup closes, fall back to the opener rather than going dark.
      if (this.page === page && previous && !previous.isClosed()) {
        this.page = previous;
        this.restartStream().catch(() => {});
      }
    });
    if (this.streaming) await this.restartStream();
    await this.onNavigated();
  }

  async close(reason = 'closed') {
    if (this.status === 'closed') return;
    this.status = 'closed';
    clearTimeout(this.expiry);
    await this.stopStream().catch(() => {});
    this.send({ t: 'closed', reason });
    try {
      this.viewer?.close();
    } catch {}
    this.viewer = null;
    await this.context?.close().catch(() => {});
    this.context = null;
    this.page = null;
    sessions.delete(this.id);
  }

  // -- state reporting ------------------------------------------------------

  async onNavigated() {
    if (!this.page || this.page.isClosed()) return;
    let url = '';
    let title = '';
    try {
      url = this.page.url();
      title = await this.page.title();
    } catch {
      return;
    }
    this.send({ t: 'url', url, title });

    if (await this.looksSignedIn(url)) {
      if (this.status !== 'signed-in') {
        this.status = 'signed-in';
        this.send({ t: 'signedin', url });
      }
    }
  }

  /**
   * Best-effort signal that login finished, used only to light up the "Save
   * session" button early. It is never the sole basis for calling a connection
   * live — capture() re-checks, and the API verifies against the platform.
   */
  async looksSignedIn(url) {
    if (this.successUrlPattern && this.successUrlPattern.test(url)) return true;
    if (this.signedInSelector && this.page) {
      try {
        return (await this.page.locator(this.signedInSelector).count()) > 0;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Hands back everything that keeps the user logged in. Called once the user
   * says they are through the login — including 2FA, which is why this is a
   * deliberate action and not something we try to detect and race.
   */
  async capture() {
    if (!this.context) throw new Error('session is not open');
    const storageState = await this.context.storageState();
    let url = '';
    let title = '';
    try {
      url = this.page?.url() ?? '';
      title = (await this.page?.title()) ?? '';
    } catch {}

    const cookieCount = storageState.cookies?.length ?? 0;
    if (cookieCount === 0) {
      throw new Error('no cookies were set — the login did not complete');
    }

    this.status = 'captured';
    return {
      storageState,
      url,
      title,
      cookieCount,
      signedIn: await this.looksSignedIn(url),
      handle: await this.guessHandle(),
    };
  }

  /**
   * Reads a display name from the page so the connection is not listed as an
   * anonymous row. Purely cosmetic — failure is not an error.
   */
  async guessHandle() {
    if (!this.page) return '';
    const selectors = [
      'meta[property="og:title"]',
      '[data-testid="UserName"]',
      '[data-e2e="profile-username"]',
    ];
    for (const sel of selectors) {
      try {
        const el = this.page.locator(sel).first();
        if ((await el.count()) === 0) continue;
        const value =
          (await el.getAttribute('content').catch(() => null)) ??
          (await el.innerText().catch(() => ''));
        if (value && value.trim()) return value.trim().slice(0, 80);
      } catch {}
    }
    return '';
  }

  // -- streaming ------------------------------------------------------------

  attachViewer(ws) {
    // One viewer at a time. A reconnect (tab refresh) should take over the
    // stream, not open a second one against the same context.
    if (this.viewer && this.viewer !== ws) {
      try {
        this.viewer.close(4000, 'replaced by a newer connection');
      } catch {}
    }
    this.viewer = ws;
    this.send({ t: 'status', status: this.status, mode: this.mode, platform: this.platform });
    this.onNavigated().catch(() => {});
    return this.startStream();
  }

  send(msg) {
    // readyState 1 === OPEN. Checked rather than assumed: frames keep arriving
    // for a moment after a viewer drops.
    if (this.viewer && this.viewer.readyState === 1) {
      try {
        this.viewer.send(JSON.stringify(msg));
      } catch {}
    }
  }

  async startStream() {
    if (this.streaming || !this.page || this.status === 'closed') return;
    this.cdp = await this.context.newCDPSession(this.page);
    this.cdp.on('Page.screencastFrame', async ({ data, sessionId, metadata }) => {
      // Ack first: Chromium will not emit the next frame until this returns,
      // which is the backpressure that keeps us from queueing stale frames.
      this.cdp?.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
      this.send({
        t: 'frame',
        data,
        w: metadata?.deviceWidth ?? this.viewport.width,
        h: metadata?.deviceHeight ?? this.viewport.height,
      });
    });
    await this.cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: Number(process.env.WORKER_FRAME_QUALITY || 70),
      maxWidth: this.viewport.width,
      maxHeight: this.viewport.height,
      everyNthFrame: 1,
    });
    this.streaming = true;
  }

  async stopStream() {
    if (!this.streaming) return;
    this.streaming = false;
    try {
      await this.cdp?.send('Page.stopScreencast');
      await this.cdp?.detach();
    } catch {}
    this.cdp = null;
  }

  async restartStream() {
    await this.stopStream();
    await this.startStream();
  }

  // -- input ----------------------------------------------------------------

  /**
   * Applies one input event from the viewer. Coordinates arrive normalised
   * (0..1) so the client can render the frame at any size without the two ends
   * having to agree on a scale factor.
   */
  async handleInput(msg) {
    if (!this.page || this.page.isClosed() || this.status === 'closed') return;
    const px = (x) => Math.max(0, Math.min(this.viewport.width, x * this.viewport.width));
    const py = (y) => Math.max(0, Math.min(this.viewport.height, y * this.viewport.height));

    switch (msg.t) {
      case 'mouse': {
        const x = px(msg.x ?? 0);
        const y = py(msg.y ?? 0);
        const button = msg.button === 2 ? 'right' : msg.button === 1 ? 'middle' : 'left';
        if (msg.action === 'move') return this.page.mouse.move(x, y);
        if (msg.action === 'down') return this.page.mouse.down({ button });
        if (msg.action === 'up') return this.page.mouse.up({ button });
        if (msg.action === 'click') {
          await this.page.mouse.move(x, y);
          return this.page.mouse.click(x, y, { button, clickCount: msg.clickCount || 1 });
        }
        if (msg.action === 'wheel') {
          await this.page.mouse.move(x, y);
          return this.page.mouse.wheel(msg.deltaX || 0, msg.deltaY || 0);
        }
        return;
      }

      // Printable characters go in as text. insertText is layout-independent,
      // so a user on an AZERTY or Cyrillic keyboard gets the character they
      // actually pressed instead of whatever a US-layout keycode maps to.
      case 'text':
        if (typeof msg.text === 'string' && msg.text.length) {
          return this.page.keyboard.insertText(msg.text);
        }
        return;

      case 'key': {
        if (!msg.key) return;
        if (msg.action === 'down') return this.page.keyboard.down(msg.key);
        if (msg.action === 'up') return this.page.keyboard.up(msg.key);
        return this.page.keyboard.press(msg.key);
      }

      case 'nav': {
        if (msg.action === 'back') return this.page.goBack().catch(() => {});
        if (msg.action === 'forward') return this.page.goForward().catch(() => {});
        if (msg.action === 'reload') return this.page.reload().catch(() => {});
        if (msg.action === 'goto' && msg.url) {
          return this.page
            .goto(msg.url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
            .catch(() => {});
        }
        return;
      }

      default:
        return;
    }
  }
}

// -- registry ---------------------------------------------------------------

export async function createSession({
  platform,
  mode = 'login',
  startUrl,
  ticket,
  viewport,
  successUrlPattern,
  signedInSelector,
}) {
  if (!startUrl) throw new Error('startUrl is required');
  if (sessions.size >= MAX_SESSIONS) {
    throw new Error(`worker is at capacity (${MAX_SESSIONS} concurrent sessions)`);
  }

  const session = new Session({
    id: 'bs-' + crypto.randomBytes(12).toString('hex'),
    ticket: ticket || crypto.randomBytes(24).toString('base64url'),
    platform: platform || 'unknown',
    mode,
    viewport: viewport ?? { width: 1280, height: 800 },
    successUrlPattern,
    signedInSelector,
  });
  sessions.set(session.id, session);

  try {
    await session.open(startUrl);
  } catch (err) {
    await session.close('failed to open');
    throw err;
  }
  return session;
}

export function getSession(id) {
  return sessions.get(id);
}

/**
 * Ticket check for the streaming socket. The ticket is minted by the API and
 * handed to the worker over the private channel, so the browser can open a
 * WebSocket without ever holding the worker's shared token. Compared in
 * constant time because it is a bearer credential for someone's live login.
 */
export function authorizeTicket(session, ticket) {
  if (!session || !ticket) return false;
  const a = Buffer.from(String(session.ticket));
  const b = Buffer.from(String(ticket));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function sessionCount() {
  return sessions.size;
}

export async function closeAllSessions() {
  await Promise.all([...sessions.values()].map((s) => s.close('worker shutting down')));
}
