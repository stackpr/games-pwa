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
npm test             # run everything
npm test -- --headed # watch it run
npm test -- specs/scorekeeper.spec.js   # one file
npm test -- -g "undo"                   # by test name
npm run report       # open the HTML report after a CI-style run
```

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
specs/shell.spec.js        Home page, manifest, icons, service worker,
                           offline, install prompt, precache integrity
specs/scorekeeper.spec.js  Scoring, tap grouping, undo, reset, persistence,
                           history-line layout
specs/counter.spec.js      Counting, keyboard, persistence, H/V reflow
specs/publishing.spec.js   Deploy surface: exclude rules, CNAME, no .nojekyll
```

## Adding tests for a new game

The `add-game` skill covers this. In short: add `specs/<slug>.spec.js`
covering the game's own rules plus the two things every game must honour —
state under a `games.<slug>.v1` key that survives a reload, and no requests
leaving the origin. Games are picked up by `shell.spec.js` automatically
through the home-page registry, so offline and link checks need no edit.
