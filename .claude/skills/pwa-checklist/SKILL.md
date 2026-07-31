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

## Automated check

Don't hand-roll a smoke test — the suite already covers this ground
(manifest, icons, offline reload of every page, install prompt on both
Chromium and emulated iOS, precache integrity, and the deploy surface):

```bash
cd _tests && npm ci && npm test
```

`npm ci` (not `npm install`), and never `npx playwright install` — the
runner is pinned to an already-provisioned browser. See `_tests/README.md`.

A green suite is the bar before merging to `gh-pages`.

## "My change isn't live"

The suite passes locally and the site still looks old. Check in this order —
it is ordered by how often each one is actually the cause:

1. **Did it merge?** `git log origin/gh-pages --oneline | head` — is the
   commit there? A pushed branch does not deploy; only `gh-pages` does. This
   has been the answer every time so far, so start here even when certain.
2. **Was `CACHE_VERSION` bumped?** An installed client serves its old
   precache until the version string changes. The home-page footer asks the
   controlling worker its version, so it reports what is genuinely loaded
   rather than what was deployed — compare it to `sw.js` on `gh-pages`. If
   the footer reads `<version> — reload to update`, a newer worker activated
   mid-session and the page is still running the old files; that is the
   update working, not failing.
3. **Has Pages finished building?** Normally under a minute.
4. **Cloudflare.** Bounded and small — `/sw.js` is edge-cached for 10
   minutes, `/` is not edge-cached at all. Past that window it is not the CDN.

Checking the live site directly (the deployed version, and whether the CDN
is holding anything):

```bash
curl -s https://games.payne.run/sw.js | grep "CACHE_VERSION = "
curl -sI https://games.payne.run/sw.js | grep -iE "cf-cache-status|age|cache-control"
```

Note that a client already running an old worker updates on its own
schedule; a hard reload or DevTools → Application → Unregister is the way
to force it, and is not evidence that the deploy failed.

## Updating a client that's stuck

An installed PWA holds its service worker until a new one takes over.
When testing an update by hand:

- DevTools → Application → Service Workers → "Update on reload" while
  iterating, or "Unregister" then reload for a clean slate.
- Bumping `CACHE_VERSION` is what makes a deployed update reach real users;
  everything above only helps the machine in front of you.
