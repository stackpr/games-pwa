const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { describeBlocks, MEASURES, specFiles } = require('../segments');

/*
 * The desktop project runs `grep: /@layout/` and nothing else, so a block
 * that measures the page without carrying the tag is only ever checked at
 * phone width. That is invisible — the suite still passes, it just stopped
 * looking. This spec is the thing that notices.
 *
 * It reads every spec except its own: the words it is looking for are all
 * written out below, so including itself would make it its own first
 * offender. That is also why the titles here spell the tag with a space.
 */
const TAG = '@' + 'layout';
const files = () => specFiles().filter(file => file !== __filename);
const blocks = file => describeBlocks(fs.readFileSync(file, 'utf8'))
  .map(block => ({ ...block, where: `${path.basename(file)} › ${block.title}` }));

test.describe('the layout tag', () => {
  test('every block that measures the page carries it', () => {
    const missing = [];
    for (const file of files()) {
      for (const block of blocks(file)) {
        const measured = block.body.match(MEASURES);
        if (measured && !block.tagged) missing.push(`${block.where} (${measured[0]})`);
      }
    }
    expect(missing, `add { tag: '${TAG}' } to these describe blocks`).toEqual([]);
  });

  test('no block claims it without measuring anything', () => {
    const idle = [];
    for (const file of files()) {
      for (const block of blocks(file)) {
        if (block.tagged && !MEASURES.test(block.body)) idle.push(block.where);
      }
    }
    // Not a correctness problem — just the desktop project running something
    // a second time that cannot come out differently. Worth knowing about.
    expect(idle, 'tagged, but never measures the page').toEqual([]);
  });

  test('the tag is an option, not part of a title', () => {
    // A tag written into the title string greps the same, and then quietly
    // stops working the day somebody rewords the block.
    const inTitle = [];
    for (const file of files()) {
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        if (new RegExp(`test\\.describe\\('[^']*${TAG}`).test(line)) {
          inTitle.push(`${path.basename(file)}: ${line.trim()}`);
        }
      }
    }
    expect(inTitle).toEqual([]);
  });

  test('the desktop project runs exactly the tagged blocks', () => {
    const config = require('../playwright.config.js');
    const desktop = config.projects.find(project => project.name === 'desktop');
    expect(desktop.grep).toEqual(new RegExp(TAG));
    // And the phone runs everything, which is what makes the split safe.
    const mobile = config.projects.find(project => project.name === 'mobile-portrait');
    expect(mobile.grep).toBeUndefined();
  });
});
