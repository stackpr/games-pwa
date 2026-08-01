const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { specsFor, porcelainPaths, slugs, ROOT } = require('../segments');

/*
 * `npm run affected` decides what not to run, and every way it can be wrong
 * is quiet: too narrow and a change ships untested, too wide and it stops
 * being worth using. Neither shows up as a failure anywhere else, so it is
 * checked here. See "Segments" in README.md.
 */
test.describe('picking the specs a change affects', () => {
  test('a game change runs that game and nothing else', () => {
    expect(specsFor(['games/mancala/mancala.js'])).toEqual(['specs/mancala.spec.js']);
    expect(specsFor(['games/mancala/index.html'])).toEqual(['specs/mancala.spec.js']);
  });

  test('a shared module runs its own spec and every game that loads it', () => {
    const picked = specsFor(['js/lib/dice.js']);
    expect(picked).toContain('specs/dice.spec.js');
    expect(picked).toContain('specs/ten-thousand.spec.js');
    // 10,000 is the second caller the tray exists for; the tray's own spec
    // passing says nothing about the game that drives it.
    expect(picked).not.toContain('specs/counter.spec.js');
  });

  test('every game that loads a module is picked up, not a list of them', () => {
    // The mapping reads each game's markup, so a game that starts using
    // store.js is covered without anyone remembering to say so.
    const picked = specsFor(['js/lib/store.js']);
    const users = slugs().filter(slug => {
      const page = path.join(ROOT, 'games', slug, 'index.html');
      return fs.existsSync(page)
        && fs.readFileSync(page, 'utf8').includes('js/lib/store.js');
    });
    for (const slug of users) {
      if (fs.existsSync(path.join(__dirname, `${slug}.spec.js`))) {
        expect(picked, `${slug} loads store.js`).toContain(`specs/${slug}.spec.js`);
      }
    }
  });

  test('the deploy surface runs shell and publishing', () => {
    for (const file of ['sw.js', 'index.html', 'manifest.webmanifest',
      'js/games.js', 'icons/favicon.svg']) {
      expect(specsFor([file]), file).toEqual(
        ['specs/publishing.spec.js', 'specs/shell.spec.js']);
    }
    expect(specsFor(['_config.yml'])).toEqual(['specs/publishing.spec.js']);
  });

  test('a game README runs the spec that requires it', () => {
    // The rule "every game has a _README.md" is publishing's, not the game's.
    expect(specsFor(['games/mancala/_README.md']))
      .toEqual(['specs/publishing.spec.js']);
  });

  test('anything unrecognised runs everything', () => {
    // The fallback goes the expensive way on purpose: a wrong "nothing to
    // run" is silent, and a wrong "run everything" only costs minutes.
    expect(specsFor(['some/new/place/thing.txt'])).toBe('all');
    expect(specsFor(['games/not-built-yet/index.html'])).toBe('all');
    expect(specsFor(['_tests/helpers.js'])).toBe('all');
  });

  test('prose alone runs nothing', () => {
    expect(specsFor(['CLAUDE.md', 'README.md'])).toEqual([]);
  });

  test('a spec edit runs that spec and the tag guard', () => {
    expect(specsFor(['_tests/specs/pitch.spec.js']))
      .toEqual(['specs/pitch.spec.js', 'specs/tagging.spec.js']);
  });

  test('every spec named by the mapping exists', () => {
    const named = new Set();
    for (const file of ['sw.js', 'js/lib/store.js', 'css/players.css',
      '_config.yml', 'games/mancala/_README.md']) {
      const picked = specsFor([file]);
      if (picked !== 'all') picked.forEach(spec => named.add(spec));
    }
    for (const spec of named) {
      expect(fs.existsSync(path.join(ROOT, '_tests', spec)), spec).toBe(true);
    }
  });
});

test.describe('reading git status', () => {
  test('the two status columns come off, and nothing else', () => {
    // The bug this exists for: trimming the line first ate two characters
    // of an unstaged path, and the "unrecognised → run everything" fallback
    // made it look like caution rather than breakage.
    expect(porcelainPaths([
      ' M games/mancala/mancala.js',
      'M  js/lib/dice.js',
      '?? _tests/segments.js',
      'A  css/party.css',
    ])).toEqual([
      'games/mancala/mancala.js',
      'js/lib/dice.js',
      '_tests/segments.js',
      'css/party.css',
    ]);
  });

  test('a rename is the name the file has now', () => {
    expect(porcelainPaths(['R  games/old/index.html -> games/new/index.html']))
      .toEqual(['games/new/index.html']);
  });

  test('what it parses is what the mapping understands', () => {
    // The two halves are only useful joined up: paths that survive parsing
    // have to be paths specsFor recognises.
    const paths = porcelainPaths([' M games/mancala/mancala.js']);
    expect(specsFor(paths)).toEqual(['specs/mancala.spec.js']);
  });
});
