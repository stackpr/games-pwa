const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(repoRoot, f), 'utf8');

// These guard the deploy surface: what reaches games.payne.run, and what
// must not. They are static checks, so they need no browser page.
/*
 * A hazard that ships silently, so it is checked before it can.
 *
 * Two functions declared with the same name in one scope is not an error in
 * JavaScript: declarations hoist and the later one takes the name. `node
 * --check` is happy, nothing looks wrong on the page, and every call goes to
 * the wrong function. It happened in Word Squiggles — a drag-end handler and
 * a puzzle-complete handler both called `finish` — and it broke the entire
 * game: every pointerup opened the "Solved" sheet and no traced word was
 * ever submitted.
 *
 * There is no linter here and this is the sort of thing a linter is for.
 */
test.describe('source hazards', { tag: '@nodom' }, () => {
  test('no script declares the same function name twice', async () => {
    const scripts = [];
    const walk = dir => {
      for (const entry of fs.readdirSync(path.join(repoRoot, dir), { withFileTypes: true })) {
        if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
        const rel = dir + '/' + entry.name;
        if (entry.isDirectory()) walk(rel);
        else if (entry.name.endsWith('.js')) scripts.push(rel.replace(/^\.\//, ''));
      }
    };
    walk('js');
    walk('games');
    expect(scripts.length).toBeGreaterThan(20);

    const clashes = [];
    for (const file of scripts) {
      const seen = new Map();
      for (const line of read(file).split('\n')) {
        // Indentation stands in for scope: two declarations at the same
        // depth in one file are the case that bites.
        const match = line.match(/^(\s*)function\s+([A-Za-z_$][\w$]*)\s*\(/);
        if (!match) continue;
        const key = match[1].length + ':' + match[2];
        if (seen.has(key)) clashes.push(file + ': ' + match[2] + ' declared twice');
        seen.set(key, true);
      }
    }
    expect(clashes).toEqual([]);
  });
});

test.describe('what gets published', { tag: '@nodom' }, () => {
  test('the test suite is excluded from the Pages build', async () => {
    const config = read('_config.yml');
    // Belt and braces: Jekyll skips "_"-prefixed paths anyway, but the
    // exclude entry keeps the intent explicit if the folder is ever renamed.
    expect(config).toMatch(/^\s*-\s*_tests\/?\s*(#.*)?$/m);
  });

  test('repo-only Markdown is excluded', async () => {
    const config = read('_config.yml');
    for (const file of ['CLAUDE.md', 'README.md']) {
      expect(config, `${file} should be excluded`).toMatch(
        new RegExp(`^\\s*-\\s*${file}\\s*(#.*)?$`, 'm')
      );
    }
  });

  test('every root-level Markdown file is accounted for', async () => {
    const config = read('_config.yml');
    const rootMarkdown = fs
      .readdirSync(repoRoot)
      .filter(f => f.toLowerCase().endsWith('.md'));

    for (const file of rootMarkdown) {
      expect(config, `${file} is new — add it to exclude in _config.yml`).toContain(file);
    }
  });

  test('every game documents itself in an unpublished _README.md', async () => {
    const gamesDir = path.join(repoRoot, 'games');
    const slugs = fs
      .readdirSync(gamesDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);

    expect(slugs.length).toBeGreaterThan(0);
    for (const slug of slugs) {
      const doc = path.join(gamesDir, slug, '_README.md');
      expect(fs.existsSync(doc), `games/${slug} needs a _README.md`).toBe(true);
      // The underscore is what keeps it off the published site.
      expect(path.basename(doc).startsWith('_')).toBe(true);
      expect(fs.readFileSync(doc, 'utf8').trim().length).toBeGreaterThan(0);
    }
  });

  test('game docs are never precached or linked from a page', async () => {
    const gamesDir = path.join(repoRoot, 'games');
    expect(read('sw.js')).not.toMatch(/_README/);
    for (const entry of fs.readdirSync(gamesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const html = read(path.join('games', entry.name, 'index.html'));
      expect(html, `games/${entry.name}/index.html should not link its _README`)
        .not.toMatch(/_README/);
    }
  });

  test('the custom domain is preserved', async () => {
    // Losing CNAME drops the custom domain on the next deploy.
    expect(read('CNAME').trim()).toBe('games.payne.run');
  });

  test('test files are never precached by the service worker', async () => {
    const sw = read('sw.js');
    expect(sw).not.toMatch(/_tests/);
  });

  test('no .nojekyll file (it would disable the exclude rules)', async () => {
    expect(fs.existsSync(path.join(repoRoot, '.nojekyll'))).toBe(false);
  });
});
