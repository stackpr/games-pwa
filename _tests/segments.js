/*
 * Which specs a change actually needs.
 *
 * The whole suite is ~1100 tests and takes minutes; a change to one game
 * can only break that game, its shared libraries' specs and the deploy
 * surface. This module works out which files those are, so `npm run
 * affected` runs tens of tests instead of hundreds. See "Segments" in
 * README.md for when to trust it and when to run everything.
 *
 * Used by `affected.js` (picking specs) and by `specs/tagging.spec.js`
 * (checking the @nodom tag), which is why the describe-block parser lives
 * here rather than in either of them.
 */
const fs = require('fs');
const path = require('path');

const TESTS = __dirname;
const ROOT = path.join(__dirname, '..');
const SPECS = path.join(TESTS, 'specs');

/**
 * Anything that measures the rendered page rather than reading the DOM —
 * the only kind of assertion a wider viewport can change. Not global: it is
 * used with both `.test()` and `.match()`, and `lastIndex` would make those
 * disagree on alternate calls.
 */
const MEASURES = new RegExp([
  'setViewportSize', 'boundingBox', 'getBoundingClientRect', 'getComputedStyle',
  'scrollWidth', 'scrollHeight', 'clientWidth', 'clientHeight',
  'offsetWidth', 'offsetHeight', 'innerWidth', 'innerHeight',
  'matchMedia', 'aspectRatio', 'devicePixelRatio'
].join('|'));

/** Every spec file, as absolute paths. */
function specFiles() {
  return fs.readdirSync(SPECS)
    .filter(name => name.endsWith('.spec.js'))
    .sort()
    .map(name => path.join(SPECS, name));
}

/**
 * Top-level `test.describe` blocks in a spec, with their bodies. Brace
 * counting rather than a parser: these files are all hand-written in one
 * house style, and a dependency to read them would be a bigger cost than
 * the thing it replaces.
 */
function describeBlocks(src) {
  const lines = src.split('\n');
  const out = [];
  let start = null;
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    if (start === null && /^\s*test\.describe\(/.test(lines[i])) {
      start = i;
      depth = 0;
    }
    if (start === null) continue;
    depth += (lines[i].match(/\{/g) || []).length;
    depth -= (lines[i].match(/\}/g) || []).length;
    if (depth <= 0 && i > start) {
      const head = lines[start];
      out.push({
        title: (head.match(/test\.describe\('([^']*)'/) || [, '?'])[1],
        tagged: /@nodom/.test(head),
        body: lines.slice(start, i + 1).join('\n')
      });
      start = null;
    }
  }
  return out;
}

/** Every game slug that has a folder. */
function slugs() {
  return fs.readdirSync(path.join(ROOT, 'games'), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
}

const specName = name => `specs/${name}.spec.js`;
const specExists = name => fs.existsSync(path.join(SPECS, `${name}.spec.js`));

/**
 * Games whose page pulls in a shared asset. Read out of the markup rather
 * than kept in a table here, because a table is a second place to update
 * and the day it is wrong is the day a change ships untested.
 */
function gamesUsing(asset) {
  const found = [];
  for (const slug of slugs()) {
    const page = path.join(ROOT, 'games', slug, 'index.html');
    if (!fs.existsSync(page)) continue;
    if (fs.readFileSync(page, 'utf8').includes(asset)) found.push(slug);
  }
  return found;
}

// Everything the deploy surface depends on: what the home page lists, what
// the worker precaches, what Pages is allowed to publish.
const SHELL = ['specs/shell.spec.js', 'specs/publishing.spec.js'];

/**
 * The specs a list of changed repo-relative paths can affect, or the string
 * 'all' when a change reaches something every spec sits on top of.
 *
 * Unrecognised paths answer 'all' on purpose: a wrong "nothing to run" is
 * silent, and the cost of being wrong the other way is a few minutes.
 */
function specsFor(changed) {
  const want = new Set();
  for (const file of changed) {
    const parts = file.split('/');

    if (parts[0] === '_tests') {
      if (parts[1] === 'specs') {
        want.add(file.slice('_tests/'.length));
        // The tag guard reads every spec, so any spec edit can break it.
        want.add('specs/tagging.spec.js');
        continue;
      }
      // helpers, config, this file, package.json: everything sits on them.
      if (/\.(js|json)$/.test(file)) return 'all';
      continue;                                   // README and friends
    }

    if (parts[0] === 'games') {
      const slug = parts[1];
      // The docs rule is enforced by the publishing spec, not by the game's.
      if (parts[2] === '_README.md') want.add('specs/publishing.spec.js');
      else if (specExists(slug)) want.add(specName(slug));
      else return 'all';                          // a game with no spec yet
      continue;
    }

    if (parts[0] === 'js' && parts[1] === 'lib') {
      const name = parts[2].replace(/\.js$/, '');
      if (specExists(name)) want.add(specName(name));
      for (const slug of gamesUsing(`js/lib/${parts[2]}`)) {
        if (specExists(slug)) want.add(specName(slug));
      }
      continue;
    }

    if (parts[0] === 'css') {
      if (parts[1] === 'app.css') { SHELL.forEach(s => want.add(s)); continue; }
      for (const slug of gamesUsing(`css/${parts[1]}`)) {
        if (specExists(slug)) want.add(specName(slug));
      }
      continue;
    }

    if (parts[0] === 'icons' || parts[0] === 'js'
      || file === 'index.html' || file === 'sw.js'
      || file === 'manifest.webmanifest') {
      SHELL.forEach(s => want.add(s));
      continue;
    }

    if (file === '_config.yml' || file === 'CNAME') {
      want.add('specs/publishing.spec.js');
      continue;
    }

    if (/\.md$/.test(file)) continue;             // prose changes nothing

    return 'all';
  }
  return [...want].sort();
}

/**
 * Repo-relative paths out of `git status --porcelain` lines.
 *
 * Two status columns, a space, then the path — so the line must not be
 * trimmed first, or an unstaged ` M games/x/y.js` loses two characters off
 * the front and stops matching anything. That failure is invisible without
 * a test: an unrecognised path falls through to "run everything", which
 * looks like caution rather than a bug.
 */
function porcelainPaths(lines) {
  return lines
    .filter(line => line.length > 3)
    .map(line => line.slice(3).split(' -> ').pop());
}

module.exports = {
  MEASURES, describeBlocks, specFiles, specsFor, slugs, porcelainPaths, ROOT
};
