const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { describeBlocks, specFiles } = require('../segments');

/*
 * The desktop project runs everything except blocks tagged `@nodom` — the
 * handful that never render anything, where a second viewport repeats
 * identical work. That is only safe while the tag means what it says, and
 * a wrong tag is silent: the block still passes at phone width, it just
 * quietly stops being checked at desktop width. This spec is what notices.
 *
 * It reads every spec but its own — the words it looks for are all written
 * out below, so including itself would make it its own first offender.
 * That is also why the titles here spell the tag with a space.
 */
const TAG = '@' + 'nodom';

/*
 * Touching a rendered page at all. Deliberately broader than "measures the
 * page": a click can land differently when the layout reflows, so anything
 * that drives or reads the DOM has to run at both widths. The tag is only
 * for specs that use the browser as a JavaScript engine — the card and
 * vocabulary libraries — or no browser at all, like the publishing checks.
 */
const TOUCHES_DOM = new RegExp([
  '\\.locator\\(', '\\.click\\(', '\\.fill\\(', '\\.press\\(', '\\.focus\\(',
  '\\.tap\\(', '\\.hover\\(', 'page\\.mouse', 'page\\.keyboard',
  'toBeVisible', 'toBeHidden', 'toHaveText', 'toContainText',
  'toHaveAttribute', 'toBeEnabled', 'toBeDisabled', 'toHaveCount',
  'boundingBox', 'getComputedStyle', 'setViewportSize',
  'scrollWidth', 'scrollHeight', 'innerWidth', 'innerHeight',
  'querySelector', 'getElementById', 'matchMedia'
].join('|'));

const others = () => specFiles().filter(file => file !== __filename);
const blocks = file => describeBlocks(fs.readFileSync(file, 'utf8'))
  .map(block => ({ ...block, where: `${path.basename(file)} › ${block.title}` }));

test.describe('the no-DOM tag', { tag: '@nodom' }, () => {
  test('nothing that touches the page carries it', () => {
    const wrong = [];
    for (const file of others()) {
      for (const block of blocks(file)) {
        const found = block.tagged && block.body.match(TOUCHES_DOM);
        if (found) wrong.push(`${block.where} (${found[0]})`);
      }
    }
    // The whole claim of the tag is that a wider window cannot change the
    // result. One locator in the block and that stops being true.
    expect(wrong, `these are tagged ${TAG} but drive the DOM`).toEqual([]);
  });

  test('desktop skips only the tagged blocks, and runs the rest', () => {
    const config = require('../playwright.config.js');
    const desktop = config.projects.find(project => project.name === 'desktop');
    // grepInvert, not grep: the default is to run, and the tag is the
    // exception. The other way round is how coverage goes missing by
    // omission rather than by decision.
    expect(desktop.grepInvert).toEqual(new RegExp(TAG));
    expect(desktop.grep).toBeUndefined();
    const mobile = config.projects.find(project => project.name === 'mobile-portrait');
    expect(mobile.grep).toBeUndefined();
    expect(mobile.grepInvert).toBeUndefined();
  });

  test('the tag is an option, not part of a title', () => {
    // A tag written into a title greps the same, then quietly stops working
    // the day somebody rewords the block.
    const inTitle = [];
    for (const file of others()) {
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        if (new RegExp(`test\\.describe\\('[^']*${TAG}`).test(line)) {
          inTitle.push(`${path.basename(file)}: ${line.trim()}`);
        }
      }
    }
    expect(inTitle).toEqual([]);
  });

  test('a tagged spec is tagged all the way through', () => {
    // Half a file tagged means the file's own describe blocks disagree
    // about whether they render — which is a sign one of them is wrong.
    const split = [];
    for (const file of others()) {
      const found = blocks(file);
      const tagged = found.filter(block => block.tagged).length;
      if (tagged && tagged !== found.length) split.push(path.basename(file));
    }
    expect(split, 'these files are only partly tagged').toEqual([]);
  });
});
