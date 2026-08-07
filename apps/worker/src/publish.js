// ---------------------------------------------------------------------------
// Using a captured session.
//
// Two jobs, both stateless: the API decrypts the stored session and passes it
// in, we spin up a context with it, do the work, and throw the context away.
// Nothing is retained between calls, which is what lets the worker be scaled
// horizontally or restarted without losing anyone's connection.
//
//   verifySession  — is this login still good?
//   publishBlog    — drive a compose form for a site with no API.
// ---------------------------------------------------------------------------

import { newContext } from './browser.js';

/**
 * Loads a stored session and checks it is still signed in. Sessions expire on
 * the platform's schedule, not ours, so this is what stops the UI from showing
 * a green "connected" badge months after the cookie died.
 */
export async function verifySession({ storageState, checkUrl, signedInSelector, signedOutSelector }) {
  if (!storageState) throw new Error('storageState is required');
  if (!checkUrl) throw new Error('checkUrl is required');

  const context = await newContext({ storageState });
  try {
    const page = await context.newPage();
    const res = await page.goto(checkUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    const finalUrl = page.url();
    const httpStatus = res?.status() ?? 0;

    // The load-bearing signal is whether we STAYED on the page we asked for.
    //
    // "The page loaded and did not obviously look like a login form" is not
    // good enough: most platforms serve their homepage happily to a signed-out
    // visitor, so that test passes with no session at all — which would mean
    // reporting a connection as verified when nothing was ever connected.
    //
    // checkUrl is therefore always a page that requires auth, and a redirect
    // away from it is what expiry actually looks like.
    const target = new URL(checkUrl);
    const landed = new URL(finalUrl);
    const stayedPut =
      landed.host === target.host &&
      landed.pathname.replace(/\/+$/, '').startsWith(target.pathname.replace(/\/+$/, ''));

    const bouncedToLogin = /\b(login|signin|sign-in|signup|sign-up|register|auth)\b/i.test(
      landed.pathname + landed.search,
    );

    let signedIn = stayedPut && !bouncedToLogin && httpStatus > 0 && httpStatus < 400;

    // Selectors, where we have them, are more precise than any URL rule —
    // but they are markup details that platforms change, so they refine the
    // decision rather than being the whole of it.
    if (signedIn && signedOutSelector && (await page.locator(signedOutSelector).count()) > 0) {
      signedIn = false;
    }
    if (signedInSelector) {
      signedIn = (await page.locator(signedInSelector).count()) > 0;
    }

    return {
      signedIn,
      url: finalUrl,
      httpStatus,
      stayedPut,
      detail: signedIn
        ? 'The stored session is still signed in.'
        : bouncedToLogin
          ? 'The platform redirected to its login page — the session is not signed in.'
          : !stayedPut
            ? `The platform redirected away from the signed-in page (to ${landed.pathname}) — the session is not signed in.`
            : 'The platform did not show a signed-in page.',
    };
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * Fills and submits a compose form described entirely by CSS selectors. This is
 * the escape hatch for blogs with no API — the mapping comes from the user's
 * destination config, so a new site can be added without shipping code.
 *
 * Contract matches publishViaBrowser in apps/backend/destinations.go.
 */
export async function publishBlog({
  composeUrl,
  storageState,
  selectors = {},
  title,
  body,
  tags = [],
  draft = false,
}) {
  if (!composeUrl) throw new Error('composeUrl is required');
  if (!storageState) throw new Error('no stored session — connect the site through the embedded browser first');
  if (!selectors.body) throw new Error('selectors.body is required — nothing to type into');

  const context = await newContext({ storageState });
  try {
    const page = await context.newPage();
    await page.goto(composeUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // If the compose URL bounced to a login page the session is dead. Say that
    // rather than typing an article into a sign-in form.
    if (/\/(login|signin|sign-in|auth)\b/i.test(page.url())) {
      throw new Error('the stored session has expired — reconnect the site through the embedded browser');
    }

    if (selectors.title && title) await fill(page, selectors.title, title);
    await fill(page, selectors.body, body ?? '');

    if (selectors.tags && tags.length) {
      // Tag widgets are almost always token inputs: type, press Enter, repeat.
      const el = page.locator(selectors.tags).first();
      await el.click({ timeout: 15_000 });
      for (const tag of tags) {
        await el.type(String(tag), { delay: 20 });
        await page.keyboard.press('Enter');
      }
    }

    const submitSelector = draft ? selectors.draftButton : selectors.publishButton;
    if (!submitSelector) {
      throw new Error(draft ? 'selectors.draftButton is not configured' : 'selectors.publishButton is not configured');
    }

    await page.locator(submitSelector).first().click({ timeout: 20_000 });
    // The post URL is whatever the site navigates to after submitting. Waiting
    // on networkidle rather than a fixed sleep keeps slow sites working.
    await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});

    return { url: page.url(), title: await page.title().catch(() => '') };
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * Types into an input, textarea, or rich-text editor. contenteditable editors
 * (which most modern blogs use) ignore fill(), so fall back to typing.
 */
async function fill(page, selector, value) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: 'visible', timeout: 20_000 });
  try {
    await el.fill(value, { timeout: 10_000 });
  } catch {
    await el.click();
    await page.keyboard.insertText(value);
  }
}
