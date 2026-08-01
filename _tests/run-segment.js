#!/usr/bin/env node
/*
 * The named segments, for when you know what you touched and do not want
 * `affected` to work it out from the diff.
 *
 *   npm run game mancala        one game, plus the libraries its page loads
 *   npm run shell               home page, worker, install, deploy surface
 *   npm run lib                 the js/lib modules' own specs
 *   npm run game -- --headed    extra arguments reach playwright
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { specsFor, slugs } = require('./segments');

const [segment, ...rest] = process.argv.slice(2);
const SPECS = path.join(__dirname, 'specs');
const specExists = name => fs.existsSync(path.join(SPECS, `${name}.spec.js`));

function libSpecs() {
  return fs.readdirSync(path.join(__dirname, '..', 'js', 'lib'))
    .map(file => file.replace(/\.js$/, ''))
    .filter(specExists)
    .map(name => `specs/${name}.spec.js`);
}

let files;
let args = rest;

if (segment === 'shell') {
  files = ['specs/shell.spec.js', 'specs/publishing.spec.js', 'specs/tagging.spec.js'];
} else if (segment === 'lib') {
  files = libSpecs();
} else if (segment === 'game') {
  const slug = rest.find(arg => !arg.startsWith('-'));
  args = rest.filter(arg => arg !== slug);
  if (!slug) {
    console.error('usage: npm run game <slug>\n  ' + slugs().join('\n  '));
    process.exit(2);
  }
  if (!specExists(slug)) {
    console.error(`no specs/${slug}.spec.js — did you mean one of:\n  `
      + slugs().filter(specExists).join('\n  '));
    process.exit(2);
  }
  // The game's own spec, plus the specs of the js/lib modules its page
  // loads — the ones a change here could just as easily have broken.
  const page = path.join(__dirname, '..', 'games', slug, 'index.html');
  const markup = fs.existsSync(page) ? fs.readFileSync(page, 'utf8') : '';
  const libs = [...markup.matchAll(/js\/lib\/([\w-]+)\.js/g)]
    .map(match => match[1])
    .filter(specExists)
    .map(name => `specs/${name}.spec.js`);
  files = [...new Set([`specs/${slug}.spec.js`, ...libs])];
} else {
  console.error('usage: npm run <game|shell|lib> [args]');
  process.exit(2);
}

files.forEach(spec => console.log('  ' + spec));
const run = spawnSync('npx', ['playwright', 'test', ...files, ...args],
  { cwd: __dirname, stdio: 'inherit' });
process.exit(run.status === null ? 1 : run.status);
