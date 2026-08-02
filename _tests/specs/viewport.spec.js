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
    // A page that sizes itself against the viewport but skips the module —
    // or reads the raw measurement — keeps the bug the module exists to fix.
    const games = path.join(__dirname, '..', '..', 'games');
    const wrong = [];
    for (const slug of fs.readdirSync(games)) {
      const file = path.join(games, slug, 'index.html');
      if (!fs.existsSync(file)) continue;
      const src = fs.readFileSync(file, 'utf8');
      if (!/app-height/.test(src)) continue;
      if (!src.includes('js/lib/viewport.js')) wrong.push(slug + ': no viewport.js');
      if (!src.includes('--app-height: min(var(--measured-height, 100dvh), 100dvh)')) {
        wrong.push(slug + ': uncapped --app-height');
      }
      // A bare 100dvh outside the token's own declaration is the old shape.
      const rest = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/--app-height: min\(var\(--measured-height, 100dvh\), 100dvh\);/g, '')
        .replace(/var\(--app-height, 100dvh\)/g, '');
      if (/100dvh/.test(rest)) wrong.push(slug + ': bare 100dvh');
    }
    expect(wrong).toEqual([]);
  });
});
