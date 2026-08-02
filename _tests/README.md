# Tests

Playwright suite for the site. This folder is **repo-only** — it is never
published to GitHub Pages.

## Why the folder is named `_tests`

The site is deployed by copying the repo to GitHub Pages, so anything at a
normal path ships to `games.payne.run`. Two things keep this folder off the
published site, and either one alone would be enough:

1. **The leading underscore.** GitHub Pages builds with Jekyll, and Jekyll
   ignores files and directories whose names begin with `_` or `.` unless
   they are one of its own special folders (`_posts`, `_layouts`, …).
   `_tests/` is not one of those, so it is skipped.
2. **An explicit `exclude` entry** in `/_config.yml`, which states the
   intent so the protection does not silently disappear if the folder is
   ever renamed to something without an underscore.

`specs/publishing.spec.js` asserts both, so a change that would start
publishing the tests fails the suite instead of quietly shipping. The same
spec enforces the other unpublished-docs rule: every game carries a
`games/<slug>/_README.md`, kept off the site by the same underscore rule.

Note that `.nojekyll` must **not** exist in this repo — it would turn off
the Jekyll build and with it every `exclude` rule.

To see exactly what a deploy would publish, build the site the way Pages
does and list the result:

```
gem install jekyll                       # once
jekyll build -d /tmp/site && find /tmp/site -type f
```

Only site files should appear — no `_tests/`, no `_README.md`, no
`CLAUDE.md`.

## Running

The suite starts its own static server (`python3 -m http.server` at the
repo root) and shuts it down afterwards; an already-running server on the
same port is reused.

```
cd _tests
npm ci               # first time only — see "Installing" below
npm run affected     # only what your changes can break  ← start here
npm test             # everything: minutes, not seconds
npm test -- --headed # watch it run
npm test -- specs/scorekeeper.spec.js   # one file
npm test -- -g "undo"                   # by test name
npm run report       # open the HTML report after a CI-style run
```

## Segments

The whole suite is over seven hundred tests and takes minutes. Almost no
change needs all of them: a game can only break its own spec, the specs of
the libraries its page loads, and the deploy surface. So run a segment
while you work, and the whole thing once before merging.

```
npm run affected            # worked out from the diff — the usual answer
npm run game mancala        # one game, plus the js/lib specs its page loads
npm run shell               # home page, worker, install prompt, publishing
npm run lib                 # the js/lib modules' own specs
```

**`npm run affected`** diffs against `origin/gh-pages` *and* reads the
working tree, so it covers what you have not committed yet — which is the
state it is usually run in. `--since HEAD` narrows it to uncommitted work;
`--list` prints the specs without running them.

The mapping lives in `segments.js`:

| Changed | Runs |
| --- | --- |
| `games/<slug>/…` | that game's spec |
| `games/<slug>/_README.md` | `publishing` — it is the spec that requires the file |
| `js/lib/<name>.js` | that module's spec, **and every game whose page loads it** |
| `css/<name>.css` | every game whose page links it |
| `js/…`, `sw.js`, `index.html`, `manifest.webmanifest`, `icons/…` | `shell` + `publishing` |
| `_config.yml`, `CNAME` | `publishing` |
| `_tests/specs/<x>.spec.js` | that spec, and the tag guard |
| `_tests/helpers.js`, the config, `segments.js` | everything |
| `*.md` elsewhere | nothing |
| anything unrecognised | **everything** |

The reverse dependencies — which games use `dice.js`, which link
`players.css` — are read out of each game's `index.html` at run time rather
than listed here. A hand-kept table is a second place to update, and the
day it goes stale is the day a change ships untested.

Unrecognised paths run the whole suite on purpose. A wrong "nothing to run"
is silent and a wrong "run everything" costs a few minutes, so the fallback
goes the expensive way.

That fallback also hides bugs in the mapping — the first version read `git
status` with the two status columns trimmed off the front along with two
characters of every path, and the symptom was a run that looked cautious
rather than broken. `specs/segments.spec.js` covers both halves: the
mapping, and the parse that feeds it.

**Run the whole suite before merging to `gh-pages`.** The segments are a
working aid, not the gate.

## The two projects

Every test runs on `mobile-portrait` (Pixel 7) and again on `desktop`
(1280×800). **Both projects run everything that renders.** The only
exception is blocks tagged `@nodom`:

```js
test.describe('the card library', { tag: '@nodom' }, () => { … });
```

Five specs carry it, and only because they render nothing at all:

| Spec | Why a viewport cannot change it |
| --- | --- |
| `deck`, `vocab` | the browser is used as a JavaScript engine — `page.evaluate` over library data, no markup |
| `publishing` | reads files off disk; no page is ever opened |
| `segments`, `tagging` | the same, for the suite's own machinery |

That is 28 of the original tests, run once instead of twice. Everything
else — every game, the shell, `names` (which drives the recent-name UI) —
still runs at both widths, because a wider window moves layout and a click
that lands on the wrong element is a real failure a phone-only run would
miss.

`specs/tagging.spec.js` keeps the tag honest, and it is deliberately strict
about it. The rule is not "does it measure the page" but **"does it touch
the page at all"** — one `locator`, `click`, `toBeVisible` or
`querySelector` inside a tagged block fails the suite. It also checks that
the config uses `grepInvert` and not `grep`: the default has to be *run at
both widths*, with the tag as the narrow exception, because the other way
round is how coverage goes missing by omission rather than by decision.

**Do not reach for this tag to make a slow spec faster.** It exists for
code that has no UI, and its cost when wrong is silent — a tagged block
still passes at phone width, it just quietly stops being checked at
desktop.

## Installing

Two rules, both about keeping the runner and the browser in step:

- **`npm ci`, not `npm install`.** `@playwright/test` is pinned to an exact
  version in `package.json` (no `^`), and `npm ci` installs the lockfile
  verbatim. `npm install` is free to resolve something newer, which is how
  the runner drifts away from the browser build it has to drive.
- **Never run `npx playwright install`.** The browsers are already on disk
  and `PLAYWRIGHT_BROWSERS_PATH` points at them; downloading again either
  wastes the bandwidth or installs a revision the pinned runner refuses to
  launch. Upgrading is a deliberate two-part job — bump `@playwright/test`
  and provision the matching browser together, never one alone.

A fresh checkout or a new container starts with no `node_modules`, so the
first `npx playwright test` fails with `MODULE_NOT_FOUND` pointing at
`playwright.config.js`. That means "run `npm ci`", nothing more.

Chromium only, on purpose: the behaviour under test (service worker,
`beforeinstallprompt`) is Chromium-specific, and the iOS paths are covered
by emulating Safari's user agent rather than running WebKit.

## Layout

```
playwright.config.js   Server startup, projects (mobile + desktop), reporters
helpers.js             Shared setup: clean state, service-worker readiness,
                       external-request and console-error tracking
segments.js            Which specs a change can affect, and the describe-block
                       parser the tag guard reads
affected.js            `npm run affected` — segments.js against a git diff
run-segment.js         `npm run game|shell|lib` — the named segments
specs/shell.spec.js        Home page, manifest, icons, service worker,
                           offline, install prompt, precache integrity
specs/scorekeeper.spec.js  Scoring, tap grouping, undo, reset, persistence,
                           history-line layout
specs/counter.spec.js      Counting, keyboard, persistence, H/V reflow
specs/viewport.spec.js     --app-height: measured, capped, and carried by
                           every full-height page
specs/publishing.spec.js   Deploy surface: exclude rules, CNAME, no .nojekyll
specs/tagging.spec.js      Guards the @nodom tag, and that desktop skips
                           nothing else
specs/segments.spec.js     Guards the change → spec mapping and the git parse
```

## Adding tests for a new game

The `add-game` skill covers this. In short: add `specs/<slug>.spec.js`
covering the game's own rules plus the two things every game must honour —
state under a `games.<slug>.v1` key that survives a reload, and no requests
leaving the origin. Games are picked up by `shell.spec.js` automatically
through the home-page registry, so offline and link checks need no edit.
