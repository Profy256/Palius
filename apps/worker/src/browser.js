// ---------------------------------------------------------------------------
// Chromium lifecycle.
//
// One browser process is shared by every session; each session gets its own
// BrowserContext. That matters for correctness, not just memory: contexts are
// the isolation boundary for cookies and localStorage, so two users logging
// into the same platform at the same time cannot see each other's session.
//
// The launch flags are about looking like the browser the user would have used
// themselves. A login page that decides it is talking to automation sends the
// user through an extra verification loop — or refuses outright — and the
// account being connected is the user's own, so that friction buys nobody
// anything. We do not go further than presenting a normal Chromium: there is no
// fingerprint spoofing here, and platforms that ask for 2FA still get to.
// ---------------------------------------------------------------------------

import { chromium } from 'playwright';

const DEFAULT_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/131.0.0.0 Safari/537.36';

let browserPromise = null;

/** Launches (once) and returns the shared Chromium instance. */
export async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        headless: process.env.WORKER_HEADLESS !== 'false',
        args: [
          // Chromium advertises itself as automated by default; login pages
          // read that and escalate.
          '--disable-blink-features=AutomationControlled',
          // Required in most containers: /dev/shm is 64MB by default and
          // Chromium crashes on a media-heavy page without this.
          '--disable-dev-shm-usage',
          '--no-sandbox',
        ],
      })
      .catch((err) => {
        // Do not cache a failed launch — the next request should retry rather
        // than inherit a rejected promise forever.
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
}

/**
 * Creates an isolated context. `storageState` restores a previously captured
 * login; omit it to start signed out.
 */
export async function newContext({ storageState, viewport, locale, timezone } = {}) {
  const browser = await getBrowser();
  return browser.newContext({
    userAgent: process.env.WORKER_USER_AGENT || DEFAULT_UA,
    viewport: viewport ?? { width: 1280, height: 800 },
    locale: locale || process.env.WORKER_LOCALE || 'en-US',
    timezoneId: timezone || process.env.WORKER_TIMEZONE || 'UTC',
    deviceScaleFactor: 1,
    acceptDownloads: false,
    storageState: storageState || undefined,
  });
}

/** True when Chromium is up. Used by /health so the API can gate the UI. */
export async function browserHealthy() {
  try {
    const browser = await getBrowser();
    return browser.isConnected();
  } catch {
    return false;
  }
}

export async function closeBrowser() {
  if (!browserPromise) return;
  const browser = await browserPromise.catch(() => null);
  browserPromise = null;
  if (browser) await browser.close().catch(() => {});
}
