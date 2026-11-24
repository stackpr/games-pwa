const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// js/lib/viewport.js exists because an installed PWA on Android could lay a
// full-height page out taller than the space the navigation bar leaves, so
// the bottom row of controls sat under the system buttons. See CLAUDE.md.
const URL = '/games/counter/';

const measured = page => page.evaluate(() =>
  document.documentElement.style.getPropertyValue('--measured-height'));

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
});

test.describe('the viewport height', () => {
  test('is measured as soon as the page loads', async ({ page }) => {
    const value = await measured(page);
    expect(value).toMatch(/^\d+(\.\d+)?px$/);
    const inner = await page.evaluate(() => window.innerHeight);
    expect(parseFloat(value)).toBeCloseTo(inner, 0);
  });

  test('sizes the page rather than being merely declared', async ({ page }) => {
    const m = await page.evaluate(() => ({
      body: document.body.getBoundingClientRect().height,
      inner: window.innerHeight,
    }));
    expect(m.body).toBeCloseTo(m.inner, 0);
  });

  test('follows a resize', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 500 });
    await expect.poll(() => measured(page)).toBe('500px');
    await page.setViewportSize({ width: 500, height: 390 });
    await expect.poll(() => measured(page)).toBe('390px');
  });

  test('re-measures again a second after load', async ({ page }) => {
    // The late beat is the fix: on the Android case the first measurement is
    // the stale one, so a wrong value has to be corrected with no event
    // arriving to prompt it.
    await page.evaluate(() =>
      document.documentElement.style.setProperty('--measured-height', '1px'));
    await expect.poll(() => measured(page), { timeout: 3000 }).not.toBe('1px');
  });

  test('can only ever make the page shorter, never taller', async ({ page }) => {
    // A measurement always trails a resize by a frame, so without the cap
    // the page would briefly be taller than the window — which is the very
    // bug this module exists to fix.
    await page.evaluate(() =>
      document.documentElement.style.setProperty('--measured-height', '4000px'));
    const m = await page.evaluate(() => ({
      body: document.body.getBoundingClientRect().height,
      overflow: document.documentElement.scrollHeight - window.innerHeight,
      inner: window.innerHeight,
    }));
    expect(m.body).toBeCloseTo(m.inner, 0);
    expect(m.overflow).toBeLessThanOrEqual(0);
  });

  test('shortens the page when the measurement is smaller', async ({ page }) => {
    await page.evaluate(() =>
      document.documentElement.style.setProperty('--measured-height', '300px'));
    const body = await page.evaluate(() =>
      document.body.getBoundingClientRect().height);
    expect(body).toBeCloseTo(300, 0);
  });

  test('every full-height page carries it, and caps it', async () => {
    /*
     * A page that sizes itself against the viewport but skips the module —
     * or reads the raw measurement — keeps the bug the module exists to fix.
     *
     * This used to start at `if (!/app-height/.test(src)) continue`, which
     * only policed pages that had already opted in: a page that never heard
     * of the module was not a failure, it was skipped. Six of them were,
     * and Somewhere Between lost its Lock in button under the Android
     * navigation bar as a result. It also read each game's index.html
     * alone, while the `height: 100dvh` that actually did the damage was in
     * css/party.css, shared by all six.
     *
     * So the question is asked the other way round now, and of the CSS the
     * page really has: does this page pin itself to the viewport height? If
     * it does, it needs the module, whichever file the height came from.
     */
    const root = path.join(__dirname, '..', '..');
    const games = path.join(root, 'games');
    const wrong = [];

    /** A page's own CSS plus every local stylesheet it links. */
    function styles(src, file) {
      let css = (src.match(/<style>([\s\S]*?)<\/style>/g) || []).join('\n');
      for (const m of src.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)) {
        const sheet = path.resolve(path.dirname(file), m[1]);
        if (sheet.startsWith(root) && fs.existsSync(sheet)) {
          css += '\n' + fs.readFileSync(sheet, 'utf8');
        }
      }
      return css.replace(/\/\*[\s\S]*?\*\//g, '');
    }

    for (const slug of fs.readdirSync(games)) {
      const file = path.join(games, slug, 'index.html');
      if (!fs.existsSync(file)) continue;
      const src = fs.readFileSync(file, 'utf8');
      const css = styles(src, file);

      /*
       * `height` pinned to the viewport is the shape that loses content:
       * the page cannot grow and cannot scroll, so whatever the system bar
       * covers is simply gone. `min-height: 100dvh` is safe — the page just
       * scrolls — which is why the home page needs none of this.
       */
      const pinned = /(^|[^-])height:[^;]*\b\d*\.?\d+dvh/m.test(css);
      if (!pinned) continue;

      if (!src.includes('js/lib/viewport.js')) wrong.push(slug + ': no viewport.js');
      if (!css.includes('--app-height: min(var(--measured-height, 100dvh), 100dvh)')) {
        wrong.push(slug + ': uncapped --app-height');
      }
      // A bare 100dvh outside the token's own declaration is the old shape.
      const rest = css
        .replace(/--app-height: min\(var\(--measured-height, 100dvh\), 100dvh\);/g, '')
        .replace(/var\(--app-height, 100dvh\)/g, '');
      if (/100dvh/.test(rest)) wrong.push(slug + ': bare 100dvh');
    }
    expect(wrong).toEqual([]);
  });
});
