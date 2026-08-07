// ---------------------------------------------------------------------------
// Palius browser worker.
//
// A separate service from the Go API because it needs a real Chromium, which
// rules out serverless hosts and a 512MB instance. It exposes two surfaces with
// different trust models, and keeping them apart is the whole security design:
//
//   PRIVATE (Bearer WORKER_TOKEN) — everything that creates a session, reads a
//     captured session, or publishes. Only the API calls these.
//
//   PUBLIC-ish (single-use ticket) — the streaming WebSocket, which the user's
//     browser connects to directly. Streaming frames through the Go API would
//     double the bandwidth for no benefit, so the browser talks to us; the
//     ticket is minted by the API, scoped to one session, and never grants
//     anything beyond that one session's stream.
//
// The worker holds no database and no long-lived secret of the user's. Captured
// sessions go straight back to the API, which encrypts them.
// ---------------------------------------------------------------------------

import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';

import { browserHealthy, closeBrowser } from './browser.js';
import {
  createSession,
  getSession,
  authorizeTicket,
  sessionCount,
  closeAllSessions,
} from './sessions.js';
import { verifySession, publishBlog } from './publish.js';

const PORT = Number(process.env.PORT || 8090);
const TOKEN = process.env.WORKER_TOKEN || '';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!TOKEN) {
  // Refusing outright would make local development annoying; running silently
  // unauthenticated in production would be far worse than annoying.
  console.warn(
    'WARNING: WORKER_TOKEN is unset — the private API is open. Set it before deploying.',
  );
}

// -- helpers ----------------------------------------------------------------

function timingSafeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function authorized(req) {
  if (!TOKEN) return true;
  const header = req.headers.authorization || '';
  return timingSafeEqual(header.replace(/^Bearer\s+/i, ''), TOKEN);
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

/** Reads a JSON body with a hard cap — storage states are the largest thing we accept. */
function readJson(req, limitBytes = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function originAllowed(origin) {
  if (!ALLOWED_ORIGINS.length) return true; // development
  return !!origin && ALLOWED_ORIGINS.includes(origin);
}

// -- HTTP -------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': originAllowed(req.headers.origin) ? req.headers.origin || '*' : '',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    });
    return res.end();
  }

  // Liveness. Deliberately unauthenticated and deliberately thin: the API polls
  // it to decide whether to offer browser login at all, and Render needs it for
  // health checks. It reveals nothing but "is Chromium up".
  if (path === '/health' && req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      service: 'palius-worker',
      chromium: await browserHealthy(),
      sessions: sessionCount(),
      authRequired: !!TOKEN,
    });
  }

  if (!authorized(req)) {
    return json(res, 401, { error: 'unauthorized' });
  }

  try {
    // ---- start a login/sign-up session -------------------------------------
    if (path === '/session' && req.method === 'POST') {
      const body = await readJson(req);
      const session = await createSession({
        platform: body.platform,
        mode: body.mode === 'register' ? 'register' : 'login',
        startUrl: body.startUrl,
        ticket: body.ticket,
        viewport: body.viewport,
        successUrlPattern: body.successUrlPattern,
        signedInSelector: body.signedInSelector,
      });
      return json(res, 200, {
        sessionId: session.id,
        streamPath: `/session/${session.id}/stream`,
        status: session.status,
        mode: session.mode,
        startUrl: body.startUrl,
      });
    }

    const sessionMatch = path.match(/^\/session\/([A-Za-z0-9-]+)(\/capture)?$/);
    if (sessionMatch) {
      const session = getSession(sessionMatch[1]);
      if (!session) return json(res, 404, { error: 'session not found or expired' });

      // ---- capture the login ----------------------------------------------
      //
      // Deliberately does NOT close the session. The API verifies the captured
      // state before it stores anything, and if that check says the login is
      // not actually finished the user must be able to carry on in the same
      // window rather than start over. The API closes the session once it has
      // stored the connection; the TTL catches the rest.
      if (sessionMatch[2] === '/capture' && req.method === 'POST') {
        return json(res, 200, await session.capture());
      }

      if (req.method === 'GET') {
        return json(res, 200, {
          sessionId: session.id,
          status: session.status,
          platform: session.platform,
          mode: session.mode,
          url: session.page?.url() ?? '',
        });
      }

      if (req.method === 'DELETE') {
        await session.close('cancelled by user');
        return json(res, 200, { ok: true });
      }
    }

    // ---- is a stored session still alive? ----------------------------------
    if (path === '/verify' && req.method === 'POST') {
      return json(res, 200, await verifySession(await readJson(req)));
    }

    // ---- drive a compose form ----------------------------------------------
    if (path === '/publish/blog' && req.method === 'POST') {
      return json(res, 200, await publishBlog(await readJson(req)));
    }

    return json(res, 404, { error: 'not found' });
  } catch (err) {
    console.error(`${req.method} ${path}:`, err?.message || err);
    return json(res, 400, { error: String(err?.message || err) });
  }
});

// -- WebSocket --------------------------------------------------------------

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const match = url.pathname.match(/^\/session\/([A-Za-z0-9-]+)\/stream$/);

  const reject = (code, message) => {
    socket.write(`HTTP/1.1 ${code} ${message}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
  };

  if (!match) return reject(404, 'Not Found');
  if (!originAllowed(req.headers.origin)) return reject(403, 'Forbidden');

  const session = getSession(match[1]);
  // Same response for "no such session" and "wrong ticket" — the distinction is
  // only useful to someone guessing session ids.
  if (!session || !authorizeTicket(session, url.searchParams.get('ticket'))) {
    return reject(401, 'Unauthorized');
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req, session);
  });
});

wss.on('connection', (ws, req, session) => {
  // Idle sockets behind a proxy get silently dropped; the ping keeps the
  // connection (and the user's half-finished login) alive.
  const keepalive = setInterval(() => {
    if (ws.readyState === 1) ws.ping();
  }, 25_000);

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.t === 'ping') return;
    try {
      await session.handleInput(msg);
    } catch (err) {
      // An input that fails (element vanished mid-click) must not kill the
      // session — the user should just be able to click again.
      session.send({ t: 'inputerror', message: String(err?.message || err) });
    }
  });

  ws.on('close', () => {
    clearInterval(keepalive);
    // The session outlives the socket on purpose: a refreshed tab reconnects
    // to the same half-finished login instead of starting over.
    if (session.viewer === ws) {
      session.viewer = null;
      session.stopStream().catch(() => {});
    }
  });

  ws.on('error', () => {});

  session.attachViewer(ws).catch((err) => {
    session.send({ t: 'status', status: 'error', message: String(err?.message || err) });
  });
});

// -- lifecycle --------------------------------------------------------------

server.listen(PORT, () => {
  console.log(`palius-worker listening on :${PORT} (auth ${TOKEN ? 'on' : 'OFF'})`);
});

let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} — closing sessions`);
    await closeAllSessions().catch(() => {});
    await closeBrowser().catch(() => {});
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
