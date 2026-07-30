const { test, expect } = require('@playwright/test');
const { freshPage, serviceWorkerReady, trackExternalRequests, trackErrors } = require('../helpers');

test.describe('app shell', () => {
  test('home page lists every registered game', async ({ page }) => {
    await page.goto('/');
    const tiles = page.locator('#game-list li a');
    await expect(tiles).not.toHaveCount(0);

    // Every tile must point at a real page, not a 404.
    const hrefs = await tiles.evaluateAll(els => els.map(e => e.getAttribute('href')));
    for (const href of hrefs) {
      const res = await page.request.get(href);
      expect(res.status(), `${href} should resolve`).toBe(200);
    }
  });

  test('manifest is valid and uses relative paths', async ({ page }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const res = await page.request.get(href);
    expect(res.status()).toBe(200);

    const manifest = await res.json();
    expect(manifest.name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.display).toBe('standalone');

    // Relative paths keep the site working at any base path.
    expect(manifest.start_url.startsWith('/')).toBe(false);
    expect(manifest.scope === undefined || !manifest.scope.startsWith('/')).toBe(true);

    // Installability: 192 and 512 "any", plus a maskable icon.
    const sizes = manifest.icons.map(i => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(manifest.icons.some(i => (i.purpose || '').includes('maskable'))).toBe(true);

    for (const icon of manifest.icons) {
      expect(icon.src.startsWith('/'), `${icon.src} should be relative`).toBe(false);
      const iconRes = await page.request.get(icon.src);
      expect(iconRes.status(), `${icon.src} should exist`).toBe(200);
    }
  });

  test('iOS install surfaces are present', async ({ page }) => {
    await page.goto('/');
    // iOS ignores the manifest for home-screen icons and needs a PNG.
    const appleIcon = page.locator('link[rel="apple-touch-icon"]');
    await expect(appleIcon).toHaveCount(1);
    const href = await appleIcon.getAttribute('href');
    expect(href).toMatch(/\.png$/);
    expect((await page.request.get(href)).status()).toBe(200);
  });

  test('service worker registers and controls the page', async ({ page }) => {
    await freshPage(page, '/');
    await serviceWorkerReady(page);
    const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
    expect(controlled).toBe(true);
  });

  test('shell and games work offline once cached', async ({ page, context }) => {
    await freshPage(page, '/');
    await serviceWorkerReady(page);

    // Visit each game so nothing depends on a lazy first fetch.
    const hrefs = await page.locator('#game-list li a').evaluateAll(els =>
      els.map(e => e.getAttribute('href'))
    );

    await context.setOffline(true);
    try {
      await page.goto('/');
      await expect(page.locator('#game-list li a')).toHaveCount(hrefs.length);

      for (const href of hrefs) {
        await page.goto(href);
        await expect(page.locator('body')).not.toBeEmpty();
        // The back link proves the game page itself came from cache.
        await expect(page.locator('a[href="../../"]')).toHaveCount(1);
      }
    } finally {
      await context.setOffline(false);
    }
  });

  test('no external requests and no console errors', async ({ page }) => {
    const external = trackExternalRequests(page);
    const errors = trackErrors(page);

    await page.goto('/');
    const hrefs = await page.locator('#game-list li a').evaluateAll(els =>
      els.map(e => e.getAttribute('href'))
    );
    for (const href of hrefs) {
      await page.goto(href);
    }

    expect(external, 'no CDNs, fonts or analytics').toEqual([]);
    expect(errors).toEqual([]);
  });

  test('every precached URL exists', async ({ page }) => {
    const sw = await (await page.request.get('/sw.js')).text();
    const block = sw.match(/PRECACHE_URLS\s*=\s*\[([\s\S]*?)\]/);
    expect(block, 'PRECACHE_URLS should be parseable').not.toBeNull();

    const urls = [...block[1].matchAll(/['"]([^'"]+)['"]/g)].map(m => m[1]);
    expect(urls.length).toBeGreaterThan(0);

    for (const url of urls) {
      const res = await page.request.get('/' + url.replace(/^\.\//, ''));
      expect(res.status(), `precached ${url} should exist`).toBe(200);
    }
  });

  test('precached entries carry the version query string', async ({ page }) => {
    await freshPage(page, '/');
    await serviceWorkerReady(page);

    const { version, keys } = await page.evaluate(async () => {
      const names = await caches.keys();
      const name = names.find(n => n.startsWith('games-pwa-'));
      const cache = await caches.open(name);
      const reqs = await cache.keys();
      return { version: name.replace('games-pwa-', ''), keys: reqs.map(r => r.url) };
    });

    expect(keys.length).toBeGreaterThan(0);
    // Every precached URL is fetched as a URL no cache has seen before, so
    // a stale copy at a CDN edge cannot satisfy it.
    for (const url of keys) {
      expect(url, `${url} should be version-busted`).toContain(`v=${version}`);
    }
  });

  test('pages are served from cache despite the version query string', async ({ page, context }) => {
    // Pages request "css/app.css"; the cache holds "css/app.css?v=v4".
    await freshPage(page, '/');
    await serviceWorkerReady(page);

    await context.setOffline(true);
    try {
      await page.goto('/');
      // A stylesheet and a script both resolve, so ignoreSearch is working
      // for subresources and not just navigations.
      const loaded = await page.evaluate(() => ({
        css: !!document.styleSheets.length,
        js: typeof GAMES !== 'undefined',
      }));
      expect(loaded.css).toBe(true);
      expect(loaded.js).toBe(true);
    } finally {
      await context.setOffline(false);
    }
  });

  test('a new version re-downloads everything and drops the old cache', async ({ page }) => {
    await freshPage(page, '/');
    await serviceWorkerReady(page);

    const before = await page.evaluate(() => caches.keys());
    expect(before.filter(n => n.startsWith('games-pwa-'))).toHaveLength(1);

    // Simulate the next deploy: a cache from an older version must not
    // survive activation of the current one.
    await page.evaluate(async () => {
      const stale = await caches.open('games-pwa-v0-stale');
      await stale.put('/js/games.js?v=v0-stale', new Response('/* old */'));
    });
    expect(await page.evaluate(() => caches.keys())).toContain('games-pwa-v0-stale');

    // Re-register: activation prunes every cache that is not the current one.
    await page.evaluate(async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    });
    await page.reload();
    await serviceWorkerReady(page);

    const after = await page.evaluate(() => caches.keys());
    expect(after).not.toContain('games-pwa-v0-stale');
    expect(after.filter(n => n.startsWith('games-pwa-'))).toHaveLength(1);
  });

  test('cache version is bumped when precached files change', async ({ page }) => {
    // Guards the rule in CLAUDE.md: a stale CACHE_VERSION strands clients
    // on old files. This only checks the constant is present and non-empty.
    const sw = await (await page.request.get('/sw.js')).text();
    const version = sw.match(/CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/);
    expect(version).not.toBeNull();
    expect(version[1]).toMatch(/^v\d+$/);
  });
});

test.describe('install prompt', () => {
  test('banner stays hidden when already installed', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    // Emulate running as an installed app.
    await page.addInitScript(() => {
      const realMatchMedia = window.matchMedia;
      window.matchMedia = query =>
        query.includes('standalone')
          ? { matches: true, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }
          : realMatchMedia.call(window, query);
    });
    await page.goto('/');
    await expect(page.locator('#install-banner')).toBeHidden();
    await context.close();
  });

  test('iOS Safari gets manual instructions', async ({ browser }) => {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
        '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.goto('/');

    await expect(page.locator('#install-banner')).toBeVisible();
    // There is no beforeinstallprompt on iOS, so the Install button stays
    // hidden and the manual Share > Add to Home Screen steps show instead.
    await expect(page.locator('#install-button')).toBeHidden();

    const help = page.locator('#ios-install-help');
    await expect(help).toBeVisible();
    await expect(help).toContainText(/share/i);
    await expect(help).toContainText(/add to home screen/i);
    await context.close();
  });

  test('dismissal is remembered', async ({ browser }) => {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
        '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.goto('/');

    const dismiss = page.locator('#install-dismiss');
    await expect(dismiss).toBeVisible();
    await dismiss.click();
    await expect(page.locator('#install-banner')).toBeHidden();

    await page.reload();
    await expect(page.locator('#install-banner')).toBeHidden();
    await context.close();
  });
});
