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
_config.yml                 Pages build: keeps repo-only files unpublished
css/app.css                 Shared styles for the home page
js/games.js                 Game registry + home-page list rendering
js/install.js               "Install this app" prompt logic
icons/                      App icons (see Images below)
games/<slug>/index.html     One folder per game; each page is self-contained
games/<slug>/_README.md     Why the game exists and how it works (unpublished)
_tests/                     Playwright suite (unpublished; see _tests/README.md)
```

Anything at a normal path is published to games.payne.run. Names starting
with `_` or `.` are skipped by the Jekyll build that GitHub Pages runs,
which is what keeps `_tests/` and every `games/<slug>/_README.md` out of
the deployed site. Do **not** add a `.nojekyll` file — it disables the
build and with it every exclusion. Repo-only files that lack an underscore
(`CLAUDE.md`, `README.md`) are listed in `_config.yml` instead.

## Adding a game or tool

Use the `add-game` skill, or by hand:

1. Create `games/<slug>/index.html` (+ its JS). Keep each game
   self-contained; link back to `../../` in a top bar.
2. Write `games/<slug>/_README.md` (required — see Documenting a game).
3. Add an entry to `GAMES` in `js/games.js`.
4. Add the new files to `PRECACHE_URLS` in `sw.js` — code and assets only,
   never `_README.md`.
5. **Bump `CACHE_VERSION` in `sw.js`** — required for any change to a
   precached file, or clients keep the stale copy.
6. Namespace persisted state: `localStorage` keys look like
   `games.<slug>.v1` and store a single JSON object.
7. Add `_tests/specs/<slug>.spec.js` and run the suite.

## Documenting a game

Every game has a `games/<slug>/_README.md` covering its intended logic and
use case: what the game is for, the rules and edge cases (what happens at
zero, what is undoable), any layout decisions worth knowing, and the shape
of its persisted state. Write for someone changing the game a year from
now.

That file is the home for prose, because **the JS ships to phones**. Keep
comments in game code short and local — a line explaining a non-obvious
decision is welcome, a paragraph of design rationale belongs in
`_README.md`. Reach for `// see _README.md` rather than restating it.

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

## Player colors

Any game with sides uses the same two identities, so a color means the
same thing everywhere on the site:

| Token | Value | Meaning |
| --- | --- | --- |
| `--player-1` | `#2f6fdb` blue | Player 1 — always moves first |
| `--player-2` | `#d84a35` red | Player 2 |
| `--player-ink` | `#ffffff` | Text/detail on top of a player fill |

They live in `css/players.css`, which every such game links with
`<link rel="stylesheet" href="../../css/players.css">`. **Use the tokens;
never re-declare the hex values in a game.** A game may alias them to its
own vocabulary — the scorekeeper sets `--team-a: var(--player-1)` — but the
value has one home. Changing a value there restyles every game at once,
which is the point.

Rules that come with this:

- **Player 1 always goes first**, in every game. The turn is
  `moves.length % 2`, never a stored flag that can drift out of sync.
- **Never let color be the only signal.** The turn indicator names the
  player in text (`Player 2 to move`), and where a game can carry a shape
  as well it should — tic-tac-toe's X and O are readable with no color
  vision at all. Connect Four's pieces can only differ by color, which is
  exactly why its status line is wordy.
- Games with no players — Counter — do not use these tokens. Its `--up` and
  `--down` are semantic, not identities, and should stay separate.

The turn indicator itself is a shared pattern rather than shared code:
a colored disc plus a text label, `aria-live="polite"`, driven by
`data-player="1|2|none"` and `data-state="playing|over"` on the container.
Connect Four and tic-tac-toe carry identical markup and CSS for it. Copy it
into a new game rather than inventing a third variant.

### Marking the winning line

When a game ends in a win, the pieces that made the line are marked the
same way everywhere: **an inset `box-shadow` ring in `--player-ink`, plus a
brightness pulse.** The winning cells carry a `data-win` attribute and the
CSS hangs off that. Three rules make it work:

- **The ring must stand on its own, without the animation.** It is what
  marks the line at the dim half of the pulse, under
  `prefers-reduced-motion: reduce`, and in any screenshot. A pulse alone
  reads as "nothing happened" half the time it is looked at. Reduced motion
  drops the animation and keeps the ring.
- **Ring the unit the game is played in** — the disc in Connect Four, the
  whole square in tic-tac-toe. Match the piece's own border radius so the
  ring traces it rather than boxing it.
- **`box-shadow` lengths are px, never `%`.** A single percentage makes the
  entire declaration invalid and the browser drops it silently — no error,
  no ring, and pieces that quietly render flat. Both games have a spec
  asserting the computed `box-shadow` is not `none`; copy it.

White on both player colors is the reason `--player-ink` exists rather than
each game picking a highlight — one identity, one marker.

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
cd _tests && npm ci && npm test         # Playwright suite (starts its own server)
```

Service workers cache aggressively — when testing changes, use DevTools →
Application → "Update on reload", or bump `CACHE_VERSION`.

`_tests/` holds the Playwright suite: shell (manifest, icons, service
worker, offline, install prompt), one spec per game, and `publishing.spec.js`
guarding what reaches the deployed site. Run it before merging to
`gh-pages`.

Use `npm ci`, never `npm install`, and never run `npx playwright install`.
The `@playwright/test` version is pinned to match a browser build that is
already provisioned; `npm ci` honours that pin and the browsers need no
download. Upgrading means bumping the package and the browser together —
doing either alone leaves a runner that cannot launch its browser. See
`_tests/README.md`.

## Cache busting

`CACHE_VERSION` in `sw.js` is the single knob. Each worker precaches every
URL with `?v=<CACHE_VERSION>` appended, so a new version fetches URLs that
no HTTP cache or CDN edge has ever seen — a stale copy cannot be reused.
Pages request those files without a query string, which is why the fetch
handler matches with `ignoreSearch: true`. Two consequences:

- **Bump `CACHE_VERSION` for any change to a precached file.** Nothing else
  needs a version suffix; do not hand-append `?v=` in HTML.
- **Games must not use query strings to vary content**, since `ignoreSearch`
  makes `?level=2` and `?level=3` the same cache entry.

`sw.js` itself cannot be busted this way — the browser refetches it on
every navigation (bypassing its own HTTP cache), but Cloudflare sits in
front of Pages and may hold an old copy until its TTL expires. Measured on
the live site: `/sw.js` is edge-cached with `cache-control: max-age=600`,
and `/` comes back `cf-cache-status: DYNAMIC` (not edge-cached at all). So
the CDN can delay a deploy by **at most ~10 minutes**, and never touches
the home page. A cache rule bypassing `/sw.js` would remove even that;
it has not been added.

That ceiling matters for diagnosis: anything still stale after ten minutes
is not the CDN. See Deploying.

## Deploying

GitHub Pages serves the `gh-pages` branch, which is also the default
branch — there is no staging step, so merging to `gh-pages` publishes
immediately. Feature work happens on `claude/*` branches. Keep `CNAME`
(`games.payne.run`) at the repo root on the deployed branch.

### A merged PR ends its branch's life

Once a PR merges, that branch is spent. Start the next piece of work from
a fresh base:

```bash
git fetch origin gh-pages
git checkout -B <branch-name> origin/gh-pages
```

Pushing another commit to a branch whose PR already merged is the failure
mode to avoid: the commit lands on GitHub, the branch looks updated, and
nothing deploys, because no PR is open to carry it. That is exactly how the
footer-version commit got stranded. **Push first, then say it is ready to
merge** — never the reverse. If the branch still holds unmerged commits,
rebase them onto the new base rather than discarding them.

### When a change isn't live

Work down this list; it is ordered by how often each one is the answer.

1. **The commit never merged.** Check that the change is actually in
   `origin/gh-pages` (`git log origin/gh-pages --oneline`), not just pushed
   to a branch. Every deploy gap found so far has been this.
2. **`CACHE_VERSION` wasn't bumped.** Installed clients keep serving the
   old precache until the version changes. Compare the version the live
   site reports in the home-page footer against `sw.js` on `gh-pages`.
3. **Pages hasn't finished building.** Usually under a minute.
4. **Cloudflare.** Only plausible within ~10 minutes of a deploy, and only
   for `/sw.js` — see Cache busting for the measured numbers.
