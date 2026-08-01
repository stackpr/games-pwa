#!/usr/bin/env node
/*
 * Runs only the specs the working tree's changes can affect.
 *
 *   npm run affected                  # vs origin/gh-pages, plus uncommitted
 *   npm run affected -- --since HEAD  # just what is uncommitted
 *   npm run affected -- --list        # print the specs, run nothing
 *
 * Anything it cannot place answers "everything", so a wrong guess costs
 * time rather than coverage. See "Segments" in README.md.
 */
const { execFileSync, spawnSync } = require('child_process');
const { specsFor, porcelainPaths, ROOT } = require('./segments');

const argv = process.argv.slice(2);
const listOnly = argv.includes('--list');
const sinceAt = argv.indexOf('--since');
const since = sinceAt === -1 ? 'origin/gh-pages' : argv[sinceAt + 1];
const rest = argv.filter((arg, i) =>
  arg !== '--list' && arg !== '--since' && i !== sinceAt + 1);

function git(args) {
  try {
    // Lines are kept verbatim: `status --porcelain` puts the state in the
    // first two columns, so trimming here would eat part of the path.
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
      .split('\n').filter(Boolean);
  } catch (err) {
    return null;                    // no such ref, not a checkout, no git
  }
}

// Committed changes against the base, plus whatever is not committed yet —
// the second half is the point, since this runs mid-edit.
const committed = git(['diff', '--name-only', `${since}...HEAD`]);
const uncommitted = porcelainPaths(git(['status', '--porcelain']) || []);

if (committed === null) {
  console.error(`affected: cannot diff against ${since} — running everything.`);
}
const changed = [...new Set([...(committed || []), ...uncommitted])];

if (!changed.length) {
  console.log('affected: nothing changed, nothing to run.');
  process.exit(0);
}

const specs = committed === null ? 'all' : specsFor(changed);
const files = specs === 'all' ? [] : specs;

console.log(`affected: ${changed.length} changed file(s) since ${since}`);
if (specs === 'all') console.log('affected: running the whole suite');
else files.forEach(spec => console.log('  ' + spec));

if (!files.length && specs !== 'all') {
  console.log('affected: no spec covers those files.');
  process.exit(0);
}
if (listOnly) process.exit(0);

const run = spawnSync('npx', ['playwright', 'test', ...files, ...rest],
  { cwd: __dirname, stdio: 'inherit' });
process.exit(run.status === null ? 1 : run.status);
