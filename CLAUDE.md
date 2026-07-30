# games-pwa

A collection of small games and tools served as a single installable PWA at
https://games.payne.run (GitHub Pages, custom domain — do not delete `CNAME`).

## Hard constraints

- **100% static.** No build step, no bundler, no framework, no server-side
  code of any kind. Plain HTML/CSS/JS files served as-is by GitHub Pages.
- **No external network dependencies.** No CDNs, no analytics, no fonts or
  scripts fetched from other origins. Everything must work fully offline
  once the service worker has cached the shell.
- **Persistence is browser-only.** Use `localStorage` for small state
  (scores, settings) and IndexedDB if a game ever needs structured or large
  data. Never assume a backend exists.
- **Relative paths everywhere.** All URLs in HTML, the manifest, and the
  service worker are relative so the site works at the domain root and at
  any other base path.

## Layout

```
index.html                  Home: install prompt + list of games
manifest.webmanifest        PWA manifest (relative start_url/scope)
sw.js                       Service worker (precache app shell, cache-first)
css/app.css                 Shared styles for the home page
js/games.js                 Game registry + home-page list rendering
js/install.js               "Install this app" prompt logic
icons/                      App icons (see Images below)
games/<slug>/index.html     One folder per game; each page is self-contained
```

## Adding a game or tool

Use the `add-game` skill, or by hand:

1. Create `games/<slug>/index.html` (+ its JS). Keep each game
   self-contained; link back to `../../` in a top bar.
2. Add an entry to `GAMES` in `js/games.js`.
3. Add the new files to `PRECACHE_URLS` in `sw.js`.
4. **Bump `CACHE_VERSION` in `sw.js`** — required for any change to a
   precached file, or clients keep the stale copy.
5. Namespace persisted state: `localStorage` keys look like
   `games.<slug>.v1` and store a single JSON object.

## Images

- **SVG is the default format** for every image in the site: game art, UI
  graphics, favicon (`icons/favicon.svg`). One scalable, themeable file —
  no density variants. Prefer inline SVG or CSS over image files at all
  when the graphic is simple.
- **PNG is allowed only for install surfaces**, where SVG is not reliably
  supported: `icons/apple-touch-icon.png` (180px — iOS requires PNG and
  ignores SVG here) and the manifest icons `icon-192.png`, `icon-512.png`,
  `icon-maskable-512.png` (Android/Chromium install + splash screens).
  Do not add raster images anywhere else.
- The PNGs are script-generated with Pillow from the same two-column
  scoreboard mark as the SVG. If the mark or palette changes, change the
  SVG first, then regenerate the PNGs by scripting Pillow again — never
  hand-edit them.

## Install-prompt strategy (js/install.js)

All client-side; no server APIs:

- Hidden entirely when already running standalone
  (`display-mode: standalone` media query or `navigator.standalone` on iOS).
- Chromium: capture `beforeinstallprompt`, show our own banner, call
  `prompt()` from the Install button click.
- iOS Safari: no `beforeinstallprompt`, so show manual
  Share → Add to Home Screen instructions.
- Dismissal stored in `localStorage`, respected for 14 days;
  `appinstalled` hides the banner permanently.

## Local dev & testing

```
python3 -m http.server 8080     # from repo root; SW requires http(s), file:// won't work
```

Service workers cache aggressively — when testing changes, use DevTools →
Application → "Update on reload", or bump `CACHE_VERSION`.

## Deploying

GitHub Pages serves the `gh-pages` branch. Feature work happens on
`claude/*` branches; merging to `gh-pages` deploys. Keep `CNAME`
(`games.payne.run`) at the repo root on the deployed branch.
