const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(repoRoot, f), 'utf8');

// These guard the deploy surface: what reaches games.payne.run, and what
// must not. They are static checks, so they need no browser page.
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
