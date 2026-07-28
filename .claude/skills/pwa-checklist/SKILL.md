---
name: pwa-checklist
description: Verify and debug the PWA install/offline behavior of this site — manifest validity, service worker caching, install prompts on Chromium/iOS. Use when installability breaks, offline mode fails, changes don't show up after deploy, or before merging to gh-pages.
---

# PWA checklist

Run through this before deploying, or when install/offline behavior breaks.

## Installability

- `manifest.webmanifest` parses as JSON and keeps **relative** `id`,
  `start_url`, and `scope` (`"./"`).
- Icons: 192 + 512 `purpose: any`, plus a 512 `purpose: maskable` whose
  artwork stays inside the center ~80% safe zone.
- `display: standalone`, `theme_color` matches the `<meta name="theme-color">`
  in every page.
- Every page links the manifest (nested pages use `../../manifest.webmanifest`)
  and the apple-touch-icon; iOS ignores the manifest for home-screen icons.
- HTTPS is required for install and service workers (GitHub Pages provides it;
  `localhost` is exempt for dev).

## Service worker

- Any change to a file listed in `PRECACHE_URLS` requires bumping
  `CACHE_VERSION` in `sw.js` — the #1 cause of "my change isn't showing up".
- New files must be added to `PRECACHE_URLS` or they won't work offline.
- Test offline: load the site once, then DevTools → Network → Offline, and
  reload every page including each game.
- The fetch handler only touches same-origin GETs — keep it that way.

## Install prompt (js/install.js)

- Everything is client-side; there is no server API for install state.
- Chromium: `beforeinstallprompt` only fires when installability criteria are
  met and the app isn't installed. Test in a fresh profile/incognito.
- iOS Safari: never fires `beforeinstallprompt`; the manual
  Share → Add to Home Screen instructions must show instead.
- Already-standalone sessions must show no prompt at all
  (`display-mode: standalone` / `navigator.standalone`).
- Dismissal (`games.installBanner.dismissedAt`) suppresses the banner for
  14 days — clear localStorage when testing.

## Quick automated smoke test

From the repo root:

```bash
python3 -m http.server 8080 &
# then with Playwright (Chromium at /opt/pw-browsers/chromium if pinned):
# load http://localhost:8080, assert #game-list has entries,
# click into the scorekeeper, tap both columns, reload, assert scores persisted.
```
