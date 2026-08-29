const { test, expect } = require('@playwright/test');

/*
 * js/lib/modal.js and css/modal.css — the overlay dialog every game uses.
 *
 * Word Squiggles is the page under test because it is the one with something
 * worth tapping underneath the dialog: a board of cells. What is being
 * checked is the shared dialog, not the game.
 */
const URL = '/games/word-squiggles/';
const sheet = page => page.locator('#board-sheet');

/** What is actually hit-tested at a point, in the terms these tests care about. */
const hitAt = (page, box) => page.evaluate(([x, y]) => {
  const el = document.elementFromPoint(x, y);
  return {
    modal: Boolean(el && el.closest('.modal')),
    cell: Boolean(el && el.closest('.cell'))
  };
}, [box.x + box.width / 2, box.y + box.height / 2]);

test.beforeEach(async ({ page }) => {
  // The dictionary probe is not this file's business; keep it off the wire.
  for (const api of ['https://api.dictionaryapi.dev/**', 'https://freedictionaryapi.com/**']) {
    await page.route(api, route => route.fulfill({ status: 404, body: '{}' }));
  }
  await page.goto(URL);
});

test.describe('the shared dialog', () => {
  test('a closed dialog stops intercepting taps at once', async ({ page }) => {
    /*
     * The bug this exists for. The closed state delays `visibility` by the
     * length of the fade so the fade can be seen — which left the dialog
     * hit-testable for 160ms after it closed. A tap in that window landed on
     * the dialog instead of on whatever it was covering.
     *
     * In most games that costs a button press. In Word Squiggles it silently
     * ate a whole traced word: the pointerdown that should have started the
     * squiggle never reached the board, so nothing was drawn and nothing was
     * submitted. It showed up as a word that simply did not count, about one
     * time in three.
     */
    const box = await page.locator('#board .cell').first().boundingBox();

    await page.locator('#board-btn').click();
    await expect(sheet(page)).toHaveAttribute('data-open', /.*/);
    // Open, it is meant to swallow taps — that is what a scrim is for.
    expect(await hitAt(page, box)).toEqual({ modal: true, cell: false });

    await page.locator('#board-sheet [data-close]').click();
    /*
     * Checked immediately, with nothing awaited in between: the whole point
     * is the moment during the fade, when `visibility` is still `visible`.
     * Waiting for the fade to finish would test nothing.
     */
    const during = await hitAt(page, box);
    expect(during.modal, 'a fading dialog is still swallowing taps').toBe(false);
    expect(during.cell, 'the board underneath is not reachable yet').toBe(true);
  });

  test('a squiggle traced straight after closing a sheet still counts',
    async ({ page }) => {
      // The same bug, in the terms a player would report it.
      const puzzle = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('games.word-squiggles.v1')).puzzle);
      const cells = puzzle.words[0].cells;

      await page.locator('#board-btn').click();
      await expect(sheet(page)).toHaveAttribute('data-open', /.*/);
      await page.locator('#board-sheet [data-close]').click();

      const boxes = [];
      for (const i of cells) {
        boxes.push(await page.locator(`#board .cell[data-i="${i}"]`).boundingBox());
      }
      await page.mouse.move(boxes[0].x + boxes[0].width / 2,
        boxes[0].y + boxes[0].height / 2);
      await page.mouse.down();
      for (const b of boxes.slice(1)) {
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 3 });
      }
      await page.mouse.up();

      await expect(page.locator('#tally')).toContainText('1 of ');
    });

  test('the scrim closes it, the panel does not', async ({ page }) => {
    await page.locator('#board-btn').click();
    await expect(sheet(page)).toHaveAttribute('data-open', /.*/);

    // A click on the panel is a click inside the dialog, not outside it.
    await page.locator('#board-sheet .modal-panel').click({ position: { x: 5, y: 5 } });
    await expect(sheet(page)).toHaveAttribute('data-open', /.*/);

    // The scrim is the dialog element itself, so a corner of it is outside
    // the panel wherever the panel happens to sit.
    await page.locator('#board-sheet').click({ position: { x: 2, y: 2 } });
    await expect(sheet(page)).not.toHaveAttribute('data-open', '');
  });

  test('Escape closes it, and focus comes back', async ({ page }) => {
    const trigger = page.locator('#board-btn');
    await trigger.click();
    await expect(sheet(page)).toHaveAttribute('data-open', /.*/);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Escape');
    await expect(sheet(page)).not.toHaveAttribute('data-open', '');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // A keyboard user is never stranded behind a dialog that has gone.
    await expect(trigger).toBeFocused();
  });

  test('it opens at its own heading, not scrolled past it', async ({ page }) => {
    // Focusing the first control in a long panel used to scroll the dialog
    // to the bottom before anyone could read the title.
    await page.setViewportSize({ width: 320, height: 568 });
    await page.locator('#rules-btn').click();
    await expect(page.locator('#rules')).toHaveAttribute('data-open', /.*/);
    const scrolled = await page.evaluate(() =>
      document.querySelector('#rules .modal-panel').scrollTop);
    expect(scrolled).toBe(0);
    await expect(page.locator('#rules-title')).toBeInViewport();
  });
});
