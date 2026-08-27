# Palius browser worker

Level 3 connectors: signing in to a platform through an embedded browser instead
of waiting weeks for an API to be approved.

The user logs in on the platform's **own login page**, streamed into the Palius
UI. What gets kept is the session that keeps them logged in — not the password.

## Why this is a separate service

It runs a real Chromium. That rules out Vercel functions, and a 512MB Render
`starter` instance will OOM partway through a login. Splitting it out also means
the Go API keeps its small footprint and the worker can be scaled or restarted
independently — it holds no database and no encryption key, so restarting it
loses nothing but in-flight logins.

That last property has a useful consequence: because the worker keeps nothing,
**it only has to exist at the moment of capture.** A worker on a laptop can
connect an account for a deployed API, as long as both talk to the same database
and share `PALIUS_SECRET_KEY` — which is how Level 3 works without paying to
host this service. See §2b of [DEPLOYMENT.md](../../DEPLOYMENT.md).

## The security shape

| | |
|---|---|
| **Passwords** | Never seen. Keystrokes are dispatched into a Chromium page on the platform's own domain. No code here reads an input's value, and none should be added. |
| **Sessions** | Handed straight back to the API, which seals them with AES-256-GCM under `PALIUS_SECRET_KEY` before they touch the database. The worker stores nothing. |
| **Private API** | Everything that creates or reads a session requires `Authorization: Bearer $WORKER_TOKEN`. Only the Go API calls these. |
| **Stream socket** | Opened by the user's browser directly, authorised by a single-use ticket the API mints and scopes to one session. The shared token never reaches a browser. |
| **Process** | Chromium runs as the image's unprivileged `pwuser`, not root. |

Streaming frames through the Go API instead would double the bandwidth for no
benefit, which is why the browser talks to the worker directly at all.

## Endpoints

Private — `Authorization: Bearer $WORKER_TOKEN`:

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/session` | Open a login or sign-up page. Returns a session id and stream path. |
| `GET` | `/session/:id` | Current status and URL. |
| `POST` | `/session/:id/capture` | Return the storage state, then close the session. |
| `DELETE` | `/session/:id` | Abandon a login. |
| `POST` | `/verify` | Load a stored session and report whether it is still signed in. |
| `POST` | `/publish/blog` | Drive a compose form with CSS selectors, for sites with no API. |

Unauthenticated:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness plus "did Chromium launch". The API polls this to decide whether to offer browser login at all. |

Ticket-authorised:

| | |
|---|---|
| `WS /session/:id/stream?ticket=…` | JPEG frames out, mouse and keyboard in. |

## Stream protocol

Server → client: `frame` (base64 JPEG), `url`, `signedin`, `status`,
`inputerror`, `closed`.

Client → server: `mouse` (`move`/`down`/`up`/`click`/`wheel`), `text`, `key`,
`nav` (`back`/`forward`/`reload`/`goto`).

Two decisions worth keeping:

- **Coordinates are normalised to 0..1.** The client renders the frame at
  whatever size it likes without the two ends agreeing on a scale factor.
- **Printable characters are sent as text, not key codes.** Key codes assume a
  US layout and silently produce the wrong character for anyone typing a
  password on an AZERTY or Cyrillic keyboard.

Frames use CDP `Page.startScreencast` rather than a screenshot loop: it is
event-driven, so an idle login form costs nothing while typing stays responsive.
Each frame is acked before the next is requested, which is the backpressure that
stops stale frames queueing on a slow connection.

## Running it

```bash
npm install          # also downloads Chromium
cp .env.example .env
npm start
```

Then point the backend at it:

```bash
PLAYWRIGHT_WORKER_URL=http://localhost:8090
PLAYWRIGHT_WORKER_TOKEN=<same value as WORKER_TOKEN>
PALIUS_SECRET_KEY=<openssl rand -base64 48>
```

Set `WORKER_HEADLESS=false` to watch a real window while debugging.

### The Playwright version is pinned on purpose

`Dockerfile` builds `FROM mcr.microsoft.com/playwright:vX.Y.Z-noble`, and that
image ships the browsers for **exactly** that version. The `playwright`
dependency is therefore pinned to an exact version rather than a caret range —
let the lockfile drift ahead of the image and `npm ci` installs a client whose
browsers are not in the image:

```
browserType.launch: Executable doesn't exist at /ms-playwright/chromium_headless_shell-…
```

That surfaces as `chromium: false` on `/health` and a greyed-out browser login
in the connect dialog, which is a long way from pointing at the real cause. When
upgrading, change both the `FROM` tag and the pinned version together.

## Limits worth stating plainly

A stored session is not an API grant:

- It expires on the platform's schedule, and a password change kills it. This is
  why `/verify` exists and why the UI re-checks rather than showing a permanent
  green badge.
- Some platforms' terms discourage automated access (`srs.md` §2.5). Level 1 and
  Level 2 remain the better option wherever an API is actually obtainable.
- `browserTargets` in `apps/backend/browser.go` hard-codes each platform's login
  URL and success pattern. Those change; when a login stops being recognised,
  that map is the first place to look.
- `composeMappings` in the same file holds the CSS selectors used to publish
  through a blog's editor. These are the most fragile thing in the feature —
  they describe third-party markup. A broken selector returns the draft as an
  export rather than losing it, and a user-defined destination can override the
  whole mapping with no deploy.
