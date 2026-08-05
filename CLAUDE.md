# games-pwa

A collection of small games and tools served as a single installable PWA at
https://games.payne.run (GitHub Pages, custom domain — do not delete `CNAME`).

## How to report work here

**Keep the summary terse.** A few lines: what changed, per game, and
anything that was not done. No walkthrough of the diff, no restating the
request, no bullet list of every file touched — the diff and the
`_README.md` files are where the detail belongs, and the site itself is
where the owner checks the result.

Say what actually ran, and say what is still open. Brevity is not a licence
to leave out a caveat.

## Hard constraints

- **100% static.** No build step, no bundler, no framework, no server-side
  code of any kind. Plain HTML/CSS/JS files served as-is by GitHub Pages.
- **No external network dependencies.** No CDNs, no analytics, no fonts or
  scripts fetched from other origins. Everything must work fully offline
  once the service worker has cached the shell.
  **One deliberate exception:** Honeycomb: Spelling draws random letters and
  checks guesses against `api.dictionaryapi.dev`, which no shipped word list
  could replace — its `_README.md` argues the trade. It is an exception, not
  a precedent: the shell still precaches and still loads offline, the game
  says so on its start sheet, and its spec asserts that host is the only one
  the site ever reaches. A new game needing the network has to earn it the
  same way, in writing.
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
css/players.css             Player identity colors (see Player colors)
css/dice.css                Die and pip styling, paired with js/lib/dice.js
css/modal.css               Overlay dialog, paired with js/lib/modal.js
js/games.js                 Game registry + home-page list rendering
js/install.js               "Install this app" prompt logic
js/lib/store.js             localStorage load/save, used by every game
js/lib/dice.js              Dice tray: builds the dice, rolls them
js/lib/modal.js             Overlay dialog: scrim, Escape, focus handling
js/lib/viewport.js          Measures the usable height; re-measures after load
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

## Naming a game — check the trademark first

**Never name a game after a trademark.** This is a hard rule, and it is
checked *before* the name is written anywhere.

Game *rules* are not copyrightable and are free to reimplement. Game
*names* are trademarked, and most well-known board and dice games are. The
rules being public is not permission to use the name.

- **If the obvious name is a trademark, stop and ask** which name to use.
  Do not pick a replacement silently, and do not proceed with the
  trademarked name "for now" — it ends up in the slug, the storage key,
  the precache list, the specs, the commit messages and the PR title, and
  every one of those has to be rewritten afterwards.
- Prefer the **traditional, descriptive or numeric** name: `10,000 (Dice)`
  rather than the trademarked name for the same six-dice game, `Dice`
  rather than a branded roller.
- This applies to **commit messages and PR text as much as to code.** A
  trademarked name in a commit is the expensive kind of mistake, because
  removing it means rewriting history on a pushed branch.
- Being unsure counts as a hit. Ask.

Names already in the tree are not evidence that they were checked. If you
notice one that looks trademarked, raise it rather than copying the
pattern.

## Adding a game or tool

Use the `add-game` skill, or by hand:

1. Create `games/<slug>/index.html` (+ its JS). Keep each game
   self-contained; link back to `../../` in a top bar.
2. Write `games/<slug>/_README.md` (required — see Documenting a game).
3. Add an entry to `GAMES` in `js/games.js`, including its **`section`**:
   `scoring`, `two`, `group`, `solitaire` or `other`. The home page groups by that and
   sorts alphabetically inside each group, so where the entry sits in the
   array does not matter. An entry with no recognised section falls through
   to *Other* rather than vanishing.
4. Add the new files to `PRECACHE_URLS` in `sw.js` — code and assets only,
   never `_README.md`.
5. **Bump `CACHE_VERSION` in `sw.js`** — required for any change to a
   precached file, or clients keep the stale copy.
6. Namespace persisted state: `localStorage` keys look like
   `games.<slug>.v1` and store a single JSON object.
7. Add `_tests/specs/<slug>.spec.js` and run the suite.

## Shared code

Games are self-contained by default — each owns its markup, its stylesheet
and its logic. `js/lib/` is the exception, for the few things where a
second copy would be a second set of bugs:

| Module | What it owns |
| --- | --- |
| `js/lib/store.js` | `Store.load(key)` / `Store.save(key, value)`. Swallows and warns, because storage throws in Safari private mode, on a full quota, and when a user blocks site data. Validation stays in the game — `load()` only promises "parsed JSON, or null". |
| `js/lib/dice.js` | `DiceTray.create(el, { onPick })`, plus `randomFace()`. Builds the dice, sizes them from how many are in play, and runs the bounce-and-settle roll. Pairs with `css/dice.css`. Omit `onPick` and the dice are inert `<span>`s rather than buttons. |
| `js/lib/modal.js` | `Modal.create(el, { trigger })`. An overlay dialog with the parts that are easy to forget: closing on the scrim but not the panel, closing on Escape, and moving focus in and back out. Pairs with `css/modal.css`; a `[data-close]` button inside closes it. |
| `js/lib/viewport.js` | Sets `--measured-height` from `window.innerHeight` and re-measures on resize, orientation change, `pageshow` and 1s after load. Pages cap it — `--app-height: min(var(--measured-height, 100dvh), 100dvh)` — and size themselves with `var(--app-height, 100dvh)`. See The Android bottom-bar bug. |

Load them with plain `<script>` tags before the game's own script; they
attach `Store` and `DiceTray` to `window`. There is no module system here
and no build step to add one.

**Extract on the second use, not the first.** Each of these earned its
place by being needed twice — 10,000 and Dice share the tray, 10,000 alone
opened two dialogs, and every game shares the storage wrapper. A helper with one caller is better left in
the game that uses it, where it can stay shaped to that game.

Anything genuinely game-specific stays put even when it looks generic: the
kept-die ring is 10,000's, the count selector is Dice's.

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
- **Never let color be the only signal.** Where a game can carry a shape it
  should — tic-tac-toe's X and O are readable with no color vision at all,
  which is why its turn indicator shows the actual mark rather than a
  disc. Four in a Row's pieces genuinely can only differ by color, so its
  indicator leans on the accessible label below.
- Games with no players — Counter — do not use these tokens. Its `--up` and
  `--down` are semantic, not identities, and should stay separate.
- **Two tokens means two sides.** A game with a variable number of seats —
  10,000 has 2–12 — must not map them onto these, because the third seat
  would have to invent a colour and the first two would stop meaning what
  they mean everywhere else. Mark the active seat with weight, a ring or
  position instead of a hue. A game may still define its own *semantic*
  colours (10,000's `--keep` and `--bust`); those name a state, not a
  player, which is why they are allowed to be local.

### The turn indicator

A shared pattern rather than shared code — Four in a Row and tic-tac-toe
carry near-identical markup and CSS. Copy it into a new game rather than
inventing a third variant.

**The piece identifies the player; the words carry only the state.** The
line reads `Next: ⬤` while playing and `⬤ Wins!` once won, never
"Player 1". The piece is the game's own token — Four in a Row shows its
disc, tic-tac-toe shows the actual X or O — so the indicator previews
exactly what the next tap places.

Three things make that work:

- **Size it for across-the-room reading.** `clamp(1.9rem, 9.5vw, 3.5rem)`
  in portrait, where there is room above the board, dropping to a
  height-based clamp in landscape where there is not. Dropping the player
  name is what buys the space, and keeps the line unwrapped on a 320px
  phone.
- **The word order flips with the state**, via
  `.turn[data-state="playing"] .turn-text { order: -1 }` — one rule, so
  "Next:" leads and "Wins!" trails without duplicating markup.
- **Keep a full sentence for screen readers.** A colored disc says nothing
  to a screen reader and an SVG glyph says little more, so the visible text
  and piece are `aria-hidden` and a `.visually-hidden` `#turn-label` holds
  `Player 2 (O) to move`. The `aria-live="polite"` container announces that,
  not the abbreviation.

The container is driven by `data-player="1|2|none"` and
`data-state="playing|over"`; `none` hides the piece for a draw.

Reserve the board's vertical space with a `--chrome` token rather than a
literal, so growing this indicator cannot silently push the board
off-screen — that is a real failure mode, since the board sizes itself
against `100dvh - var(--chrome)`.

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
- **Ring the unit the game is played in** — the disc in Four in a Row, the
  whole square in tic-tac-toe. Match the piece's own border radius so the
  ring traces it rather than boxing it.
- **`box-shadow` lengths are px, never `%`.** A single percentage makes the
  entire declaration invalid and the browser drops it silently — no error,
  no ring, and pieces that quietly render flat. Both games have a spec
  asserting the computed `box-shadow` is not `none`; copy it.

White on both player colors is the reason `--player-ink` exists rather than
each game picking a highlight — one identity, one marker.

## The Android bottom-bar bug (js/lib/viewport.js)

Installed on Android, a full-height page could lay itself out taller than
the space the system navigation bar actually leaves, so the bottom row of
controls sat *under* the home/back/recents buttons. Rotating the phone and
rotating back fixed it — which is the whole diagnosis: the height was
stale, not wrong.

So every full-height page carries `js/lib/viewport.js`, which publishes
`window.innerHeight` as `--measured-height` and re-measures on resize,
orientation change, `pageshow`, becoming visible again, and **once a second
after load** — that last beat being the one that fixes the install case.

Three rules come with it:

- **The measurement is a cap, not the height.** Every such page declares
  `--app-height: min(var(--measured-height, 100dvh), 100dvh)` in its
  `:root`, so JS can only make the page *shorter*. That is the direction the
  bug runs in, and it means a stale reading — the script always trails a
  resize by a frame — can never push content off the bottom instead. There
  is a spec asserting both halves.
- **Write `height: var(--app-height, 100dvh)`, never bare `100dvh`.** The
  fallback is what renders before the script runs, and what the page keeps
  if a neighbouring release serves markup without the script. The same
  applies inside `calc()` where a board or tray sizes itself against the
  viewport.
- **It measures `innerHeight`, not `visualViewport.height`.** The visual
  viewport shrinks for the on-screen keyboard and for pinch-zoom, neither
  of which should resize a board.

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
cd _tests && npm ci             # first time only
npm run affected                # only the specs your changes can break
npm test                        # the whole suite — minutes
```

Service workers cache aggressively — when testing changes, use DevTools →
Application → "Update on reload", or bump `CACHE_VERSION`.

`_tests/` holds the Playwright suite: shell (manifest, icons, service
worker, offline, install prompt), one spec per game, and `publishing.spec.js`
guarding what reaches the deployed site.

### Run a segment while you work

The suite is over seven hundred tests and takes minutes. **Do not run it
after every edit.** A game can only break its own spec, the specs of the
libraries its page loads, and the deploy surface, so run that much and keep
moving:

```
npm run affected            # works it out from the diff — the usual answer
npm run game mancala        # one game, plus the js/lib specs its page loads
npm run shell               # home page, worker, install prompt, publishing
npm run lib                 # the js/lib modules' own specs
```

`npm run affected` reads both the diff against `origin/gh-pages` and the
uncommitted working tree, and anything it cannot place falls back to
running everything — so it is never the reason something went untested.
`_tests/README.md` has the mapping.

**The affected segment is the default gate, not the full suite.** The repo
owner plays the site themselves after every change — it is a static
client-side app and that is the faster feedback loop — so `npm run affected`
(or a named segment) before pushing is enough. Run the full `npm test` when
the change reaches every game: `js/lib/`, `sw.js`, `js/games.js`, the shared
stylesheets. Saying "full test" asks for it explicitly; saying "no tests"
asks for none.

**Never claim a run that did not happen.** Quote what actually ran — *"43
passing (`npm run game mancala`); full suite not run"* — rather than a
number that reads as the whole suite. Inventing one is worse than skipping
the run.

**Segmenting is about which specs a run needs, never about dropping a
viewport.** Both projects — phone and desktop — run everything that
renders. The one exception is `{ tag: '@nodom' }`, carried by the five
specs with no UI at all (`deck`, `vocab`, `publishing`, and the suite's own
`segments` and `tagging`), where a second viewport repeats identical work.
`specs/tagging.spec.js` fails the suite if a tagged block so much as calls
`locator`, and the config uses `grepInvert` so running at both widths stays
the default. Do not tag a spec to make it faster.

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

## A game's JS must tolerate the neighbouring release's HTML

`sw.js` calls `skipWaiting()` on install and `clients.claim()` on activate,
so a new worker can take over a page **that is already loading**: the HTML
can come from the outgoing worker and the script from the incoming one.

That means a game whose script hard-requires an element added in the same
release will break on exactly those loads — and because a throw at the top
of the IIFE aborts everything after it, the symptom is not a missing
button, it is a **blank game**. This has happened once: 10,000 gained a
`#settings-close` button and a matching `addEventListener`, and clients
caught mid-update rendered no dice, no seats and no working controls.

Bind through a null-tolerant helper rather than reaching straight into the
DOM:

```js
function on(node, type, fn) {
  if (node) node.addEventListener(type, fn);
  else console.warn('Missing element for a ' + type + ' handler');
}
```

Adding an element and using it in the same version is fine. *Assuming it is
there* is what breaks. The same applies to any node read at start-up —
guard it, or accept that one missing element takes the page with it.

## Deploying

GitHub Pages serves the `gh-pages` branch, which is also the default
branch — there is no staging step, so a push to `gh-pages` publishes
immediately. Keep `CNAME` (`games.payne.run`) at the repo root.

**Commit and push straight to `gh-pages`.** No feature branch, no pull
request: the owner reviews by playing the site, and a branch waiting on a
PR is a change that is not being reviewed at all. Pull before pushing if
the branch has moved.

Only take work to a `claude/*` branch when the change is genuinely
unfinished or wants a second opinion before it is live — and say so, since
nothing on a branch reaches the site until it lands on `gh-pages`.

### When a change isn't live

Work down this list; it is ordered by how often each one is the answer.

1. **The commit never landed.** Check that the change is actually in
   `origin/gh-pages` (`git log origin/gh-pages --oneline`), not just
   committed locally or pushed to a branch. Every deploy gap found so far
   has been this.
2. **`CACHE_VERSION` wasn't bumped.** Installed clients keep serving the
   old precache until the version changes. Compare the version the live
   site reports in the home-page footer against `sw.js` on `gh-pages`.
3. **Pages hasn't finished building.** Usually under a minute.
4. **Cloudflare.** Only plausible within ~10 minutes of a deploy, and only
   for `/sw.js` — see Cache busting for the measured numbers.
