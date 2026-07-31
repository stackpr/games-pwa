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
   - If the game has **sides**, link `../../css/players.css` and use
     `var(--player-1)` / `var(--player-2)` — never fresh hex values — and
     copy the turn indicator from `games/tic-tac-toe/`: `Next: <piece>`
     while playing, `<piece> Wins!` once won, with the full sentence kept
     in a visually-hidden label for screen readers. Player 1 moves first.
     Reserve the board's space with a `--chrome` token so the indicator
     cannot push it off-screen. See Player colors in CLAUDE.md
   - If it can be **won**, mark the winning pieces the shared way: a
     `data-win` attribute, an inset `box-shadow` ring in `--player-ink`,
     and a brightness pulse. The ring has to read without the animation.
     See Marking the winning line in CLAUDE.md

2. **Document it** in `games/<slug>/_README.md` (required). Cover the use
   case, the rules and edge cases, layout decisions, and the shape of the
   persisted state. The leading underscore keeps it off the published site.
   Prose belongs here, not in the JS — game code ships to phones, so keep
   its comments short and point at `_README.md` for the reasoning.

3. **Register it** in two places, both of which are easy to forget:
   - `js/games.js` — add `{ name, description, emoji, path: 'games/<slug>/' }`
     to the `GAMES` array. This is what renders the home-page tile.
   - `README.md` — add a row to the "Games & tools" table. Nothing enforces
     this one, so it silently goes stale; the table has drifted before.

4. **Cache it** in `sw.js`: add the new files to `PRECACHE_URLS` **and bump
   `CACHE_VERSION`** (this is mandatory — stale caches otherwise). Precache
   code and assets only — never `_README.md`.

5. **Persist state** (if the game has any) in `localStorage` under
   `games.<slug>.v1` as one JSON object. Validate on load (see
   `scorekeeper.js` `load()` for the pattern). Use IndexedDB only for
   large/structured data.

6. **Test it**: add `_tests/specs/<slug>.spec.js` covering the game's own
   rules plus the two things every game owes the shell — state that
   survives a reload under its namespaced key, and no requests leaving the
   origin. Copy the shape of `specs/counter.spec.js`. The shell and
   publishing specs pick the game up automatically.

7. **Verify**: `cd _tests && npm ci && npm test` (it starts its own server).
   Use `npm ci`, never `npm install`, and never run `npx playwright install`
   — the runner is pinned to an already-provisioned browser; see
   `_tests/README.md`. For a manual look, `python3 -m http.server 8080` from
   the repo root, confirm the new tile appears and the game works offline.

## Before it can deploy

The suite must be green, and the work has to reach `gh-pages` to go live —
a pushed branch alone deploys nothing. If the branch's PR has already
merged, start a new branch from `origin/gh-pages` rather than adding
commits to the merged one. See Deploying in CLAUDE.md.
