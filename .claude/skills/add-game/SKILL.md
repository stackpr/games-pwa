---
name: add-game
description: Scaffold a new game or tool in this PWA — creates the game folder, registers it on the home page, and wires up offline caching. Use when the user asks to add a new game, tool, or page to the site.
---

# Add a game

Add a new self-contained game/tool to the site. Ask nothing if the request
already names the game; pick a short kebab-case `<slug>`.

## Steps

1. **Create `games/<slug>/index.html`** and `games/<slug>/<slug>.js`.
   Copy the structure of `games/scorekeeper/` as the template:
   - Own `<style>` block or file (games don't share `css/app.css`)
   - Top bar with `<a href="../../">&larr; Games</a>`
   - `<link rel="manifest" href="../../manifest.webmanifest">` and the same
     icon/meta tags as the scorekeeper page
   - Register the service worker with `navigator.serviceWorker.register('../../sw.js')`
   - Mobile-first: big touch targets, `touch-action: manipulation`,
     `100dvh` layouts, safe-area insets
   - Any images the game needs are SVG (inline where simple) — PNG is
     reserved for the install icons in `icons/`; see Images in CLAUDE.md

2. **Register it** in `js/games.js`: add `{ name, description, emoji, path: 'games/<slug>/' }`
   to the `GAMES` array.

3. **Cache it** in `sw.js`: add the new files to `PRECACHE_URLS` **and bump
   `CACHE_VERSION`** (this is mandatory — stale caches otherwise).

4. **Persist state** (if the game has any) in `localStorage` under
   `games.<slug>.v1` as one JSON object. Validate on load (see
   `scorekeeper.js` `load()` for the pattern). Use IndexedDB only for
   large/structured data.

5. **Verify**: `python3 -m http.server 8080` from the repo root, load the
   home page, confirm the new tile appears and the game works, and confirm
   no requests leave the origin (no CDNs — hard constraint).
