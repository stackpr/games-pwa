const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests, trackErrors } = require('../helpers');

const URL = '/games/mancala/';

const cell = (page, i) => page.locator(`.cell[data-i="${i}"]`);
const label = page => page.locator('#turn-label');
const note = page => page.locator('#note');

const board = page => page.evaluate(() =>
  [...document.querySelectorAll('.cell')]
    .sort((a, b) => a.dataset.i - b.dataset.i)
    .map(c => Number(c.querySelector('.count').textContent)));

const playable = page => page.evaluate(() =>
  [...document.querySelectorAll('.cell[data-play]')].map(c => Number(c.dataset.i)));

const CAPTURE = { store: 'again', empty: 'capture', full: 'end' };
const AVALANCHE = { store: 'end', empty: 'none', full: 'sow' };

/** Seeds an exact board. Anything omitted is empty. */
async function position(page, pits, turn = 1, rules = CAPTURE) {
  await page.evaluate(([list, t, r]) => {
    const seeds = new Array(14).fill(0);
    for (const [i, n] of list) seeds[i] = n;
    localStorage.setItem('games.mancala.v1', JSON.stringify({
      board: seeds, turn: t, over: false, rules: r,
    }));
  }, [Object.entries(pits).map(([i, n]) => [Number(i), n]), turn, rules]);
  await page.reload();
}

/** The save is only accepted if the seeds total 48, so pad a short board. */
function padded(pits) {
  const used = Object.values(pits).reduce((a, b) => a + b, 0);
  return { ...pits, 6: (pits[6] || 0) + (48 - used) };
}

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
});

test.describe('the opening position', () => {
  test('fourteen cells, four seeds in each of the twelve pits', async ({ page }) => {
    await expect(page.locator('.cell')).toHaveCount(14);
    await expect(page.locator('.cell.store')).toHaveCount(2);
    expect(await board(page)).toEqual([4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0]);
  });

  test('player 1 moves first and may play only their own pits', async ({ page }) => {
    await expect(label(page)).toHaveText('Player 1 to move, 0 to 0');
    expect((await playable(page)).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test('pits show their seeds as pips', async ({ page }) => {
    await expect(cell(page, 0).locator('.seed')).toHaveCount(4);
    // A store is a number, never pips.
    await expect(cell(page, 6).locator('.seed')).toHaveCount(0);
  });
});

test.describe('sowing', () => {
  test('seeds drop one per pit, moving towards your own store', async ({ page }) => {
    // Four seeds from pit 3 reach 4, 5, the store, and the first of player 2's.
    await cell(page, 3).click();
    expect(await board(page)).toEqual([4, 4, 4, 0, 5, 5, 1, 5, 4, 4, 4, 4, 4, 0]);
    await expect(label(page)).toHaveText('Player 2 to move, 1 to 0');
  });

  test("the opponent's store is skipped", async ({ page }) => {
    // Nine seeds from pit 5 run past store 6, all of player 2's pits, over
    // store 13 and back round to pit 1. The seed already in pit 1 keeps the
    // landing from turning into a capture, which is a different rule.
    await position(page, padded({ 1: 1, 5: 9 }), 1);
    await cell(page, 5).click();
    const after = await board(page);
    expect(after[6]).toBe(38 + 1);   // the padding, plus the one dropped here
    expect(after[13]).toBe(0);
    expect(after.slice(7, 13)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(after[0]).toBe(1);
    expect(after[1]).toBe(2);
  });

  test('touched pits are marked so the sown row reads', async ({ page }) => {
    await cell(page, 3).click();
    await expect(cell(page, 4)).toHaveAttribute('data-hit', '');
    await expect(cell(page, 0)).not.toHaveAttribute('data-hit', /.*/);
  });

  test('a pit past a dozen seeds shows a number instead of pips', async ({ page }) => {
    await position(page, padded({ 0: 13 }), 1);
    await expect(cell(page, 0)).toHaveAttribute('data-many', '');
    await expect(cell(page, 0).locator('.seed')).toHaveCount(0);
    await expect(cell(page, 0).locator('.count')).toHaveText('13');
  });
});

test.describe('capture rules', () => {
  test('landing in your own store earns another turn', async ({ page }) => {
    // Two seeds from pit 4 reach pit 5 and then the store exactly.
    await position(page, padded({ 0: 1, 4: 2, 7: 4 }), 1);
    await cell(page, 4).click();
    await expect(label(page)).toHaveText(/^Player 1 to move/);
    await expect(note(page)).toHaveText('Extra turn');
  });

  test('landing in an empty pit of yours captures it and the pit facing it',
    async ({ page }) => {
      // 0 -> 1 with one seed; pit 1 is empty and pit 11 faces it.
      await position(page, padded({ 0: 1, 3: 2, 11: 5, 7: 1 }), 1);
      await cell(page, 0).click();
      const after = await board(page);
      expect(after[1]).toBe(0);
      expect(after[11]).toBe(0);
      await expect(note(page)).toHaveText('Captured 6');
      await expect(label(page)).toHaveText(/^Player 2 to move/);
    });

  test('an empty facing pit captures nothing', async ({ page }) => {
    await position(page, padded({ 0: 1, 7: 3 }), 1);
    await cell(page, 0).click();
    const after = await board(page);
    expect(after[1]).toBe(1);
    await expect(note(page)).toBeEmpty();
  });

  test('landing on the opponent side captures nothing', async ({ page }) => {
    await position(page, padded({ 0: 1, 5: 3 }), 1);
    await cell(page, 5).click();
    const after = await board(page);
    expect(after[7]).toBe(1);
    expect(after[8]).toBe(1);
    await expect(note(page)).toBeEmpty();
  });
});

test.describe('scoop and keep sowing', () => {
  test('landing in an occupied pit scoops it and keeps sowing', async ({ page }) => {
    // 1 seed from pit 0 lands on pit 1 which holds 2, so 3 are picked back
    // up and sown onward into 2, 3 and 4.
    await position(page, padded({ 0: 1, 1: 2, 7: 1 }), 1, AVALANCHE);
    await cell(page, 0).click();
    const after = await board(page);
    expect(after[0]).toBe(0);
    expect(after[1]).toBe(0);
    expect(after.slice(2, 5)).toEqual([1, 1, 1]);
    await expect(note(page)).toHaveText('Sowed 2 times');
  });

  test('with the store set to end, landing there passes the turn',
    async ({ page }) => {
      await position(page, padded({ 0: 1, 5: 1, 7: 1 }), 1, AVALANCHE);
      await cell(page, 5).click();
      await expect(label(page)).toHaveText(/^Player 2 to move/);
    });

  test('with captures off, nothing is ever captured', async ({ page }) => {
    // The same setup that captures six with captures on.
    await position(page, padded({ 0: 1, 3: 2, 11: 5, 7: 1 }), 1, AVALANCHE);
    await cell(page, 0).click();
    const after = await board(page);
    expect(after[11]).toBe(5);
    await expect(note(page)).toBeEmpty();
  });
});

test.describe('the three rule axes', () => {
  const pressed = page => page.evaluate(() =>
    [...document.querySelectorAll('.pick[aria-pressed="true"]')]
      .map(b => b.dataset.axis + ':' + b.dataset.value).sort());

  test('every axis shows exactly one option chosen', async ({ page }) => {
    await page.locator('#rules-btn').click();
    expect(await pressed(page)).toEqual(['empty:capture', 'full:end', 'store:again']);
  });

  test('the axes are independent — the extra turn survives dropping captures',
    async ({ page }) => {
      await page.locator('#rules-btn').click();
      await page.locator('#pick-empty-none').click();
      expect(await pressed(page)).toEqual(['empty:none', 'full:end', 'store:again']);

      // Store still grants another turn, with no capture on the empty pit.
      await position(page, padded({ 0: 1, 4: 2, 11: 5 }), 1,
        { store: 'again', empty: 'none', full: 'end' });
      await cell(page, 4).click();
      await expect(note(page)).toHaveText('Extra turn');
      await expect(label(page)).toHaveText(/^Player 1 to move/);
    });

  test('turning the extra turn off leaves captures alone', async ({ page }) => {
    await position(page, padded({ 0: 1, 3: 2, 11: 5, 7: 1 }), 1,
      { store: 'end', empty: 'capture', full: 'end' });
    await cell(page, 0).click();
    await expect(note(page)).toHaveText('Captured 6');
    await expect(label(page)).toHaveText(/^Player 2 to move/);
  });

  test('changing an axis restarts the game', async ({ page }) => {
    await cell(page, 3).click();
    await page.locator('#rules-btn').click();
    await page.locator('#pick-full-sow').click();
    expect(await board(page)).toEqual([4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0]);
    await expect(label(page)).toHaveText('Player 1 to move, 0 to 0');
  });

  test('the choices survive a reload', async ({ page }) => {
    await page.locator('#rules-btn').click();
    await page.locator('#pick-store-end').click();
    await page.locator('#pick-full-sow').click();
    await page.reload();
    expect(await pressed(page)).toEqual(['empty:capture', 'full:sow', 'store:end']);
  });

  test('one bad axis in a save falls back on its own', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('games.mancala.v1', JSON.stringify({
      board: [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0], turn: 1, over: false,
      rules: { store: 'nonsense', empty: 'none', full: 'sow' },
    })));
    await page.reload();
    expect(await pressed(page)).toEqual(['empty:none', 'full:sow', 'store:again']);
  });
});

test.describe('ending', () => {
  test('emptying a side sweeps the rest and ends the game', async ({ page }) => {
    // Player 1's last seed lands in their store, emptying their side.
    await position(page, { 5: 1, 6: 20, 7: 3, 8: 4, 13: 20 }, 1);
    await cell(page, 5).click();
    await expect(page.locator('#turn')).toHaveAttribute('data-state', 'over');
    const after = await board(page);
    expect(after.slice(0, 6)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(after.slice(7, 13)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(after[6]).toBe(21);
    expect(after[13]).toBe(27);
    await expect(label(page)).toHaveText('Player 2 wins, 21 to 27');
  });

  test('an equal split is a draw', async ({ page }) => {
    await position(page, { 5: 1, 6: 23, 7: 0, 13: 24 }, 1);
    await cell(page, 5).click();
    await expect(page.locator('#turn')).toHaveAttribute('data-player', 'none');
    await expect(page.locator('#turn-text')).toHaveText('Draw');
  });

  test('the board locks once the game is over', async ({ page }) => {
    await position(page, { 5: 1, 6: 23, 7: 0, 13: 24 }, 1);
    await cell(page, 5).click();
    expect(await playable(page)).toEqual([]);
  });
});

test.describe('undo and reset', () => {
  test('undo takes back a move', async ({ page }) => {
    await cell(page, 3).click();
    await page.locator('#undo').click();
    expect(await board(page)).toEqual([4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0]);
    await expect(label(page)).toHaveText('Player 1 to move, 0 to 0');
  });

  test('undo is disabled before anything happens', async ({ page }) => {
    await expect(page.locator('#undo')).toBeDisabled();
  });

  test('new game refills every pit', async ({ page }) => {
    await cell(page, 3).click();
    await page.locator('#reset').click();
    expect(await board(page)).toEqual([4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0]);
  });
});

test.describe('persistence', () => {
  test('the position survives a reload', async ({ page }) => {
    await cell(page, 3).click();
    await page.reload();
    expect(await board(page)).toEqual([4, 4, 4, 0, 5, 5, 1, 5, 4, 4, 4, 4, 4, 0]);
    await expect(label(page)).toHaveText('Player 2 to move, 1 to 0');
  });

  test('corrupt saved state falls back to a new game', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('games.mancala.v1', 'not json'));
    await page.reload();
    expect(await board(page)).toEqual([4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0]);
  });

  test('a board whose seeds do not add up is rejected', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('games.mancala.v1', JSON.stringify({
      board: new Array(14).fill(1), turn: 1, over: false,
      rules: { store: 'again', empty: 'capture', full: 'end' },
    })));
    await page.reload();
    expect(await board(page)).toEqual([4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0]);
  });
});

test.describe('presentation', () => {
  test('the rules modal offers all three axes', async ({ page }) => {
    await page.locator('#rules-btn').click();
    await expect(page.locator('#rules')).toBeVisible();
    await expect(page.locator('#picks .axis')).toHaveCount(3);
    await expect(page.locator('#picks .pick')).toHaveCount(6);
    await page.keyboard.press('Escape');
    await expect(page.locator('#rules')).toBeHidden();
  });

  test('uses the shared player colors for pit ownership', async ({ page }) => {
    const colors = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        p1: root.getPropertyValue('--player-1').trim(),
        p2: root.getPropertyValue('--player-2').trim(),
        one: getComputedStyle(document.querySelector('.cell[data-i="0"]')).boxShadow,
        two: getComputedStyle(document.querySelector('.cell[data-i="7"]')).boxShadow,
      };
    });
    expect(colors.p1).toBe('#2f6fdb');
    expect(colors.p2).toBe('#d84a35');
    // A percentage anywhere in a box-shadow drops the whole declaration.
    expect(colors.one).not.toBe('none');
    expect(colors.two).not.toBe('none');
    expect(colors.one).not.toBe(colors.two);
  });

  test('both layouts fit on screen with the stores at the ends', async ({ page }) => {
    for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 },
      { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      const m = await page.evaluate(() => {
        const at = i => document.querySelector(`.cell[data-i="${i}"]`).getBoundingClientRect();
        return {
          portrait: window.innerHeight > window.innerWidth,
          s1: at(6), s2: at(13), p0: at(0), p5: at(5), p7: at(7),
          ox: document.documentElement.scrollWidth - window.innerWidth,
          oy: document.documentElement.scrollHeight - window.innerHeight,
        };
      });
      const at = `${size.width}x${size.height}`;
      expect(m.ox, `x overflow at ${at}`).toBeLessThanOrEqual(0);
      expect(m.oy, `y overflow at ${at}`).toBeLessThanOrEqual(0);
      if (m.portrait) {
        // Rotated a quarter turn: player 1's store along the bottom, player
        // 2's along the top, and pit 5 sits next to store 6.
        expect(m.s2.top, `p2 store on top at ${at}`).toBeLessThan(m.p0.top);
        expect(m.s1.top, `p1 store at the bottom at ${at}`).toBeGreaterThan(m.p5.top);
        expect(m.p0.left, `player 1 down the left at ${at}`).toBeLessThan(m.p7.left);
      } else {
        expect(m.s2.left, `p2 store on the left at ${at}`).toBeLessThan(m.p0.left);
        expect(m.s1.left, `p1 store on the right at ${at}`).toBeGreaterThan(m.p5.left);
        expect(m.p0.top, `player 1 along the bottom at ${at}`).toBeGreaterThan(m.p7.top);
      }
    }
  });

  test('survives markup from the neighbouring release', async ({ page }) => {
    // A new worker can pair this script with older HTML; a missing element
    // must warn, not blank the page. See CLAUDE.md.
    const errors = trackErrors(page);
    await page.route('**/games/mancala/', async route => {
      const res = await route.fetch();
      const body = (await res.text()).replace(/<button id="undo"[\s\S]*?<\/button>/, '');
      await route.fulfill({ response: res, body });
    });
    await page.goto(URL);
    await expect(page.locator('#undo')).toHaveCount(0);
    await expect(page.locator('.cell')).toHaveCount(14);
    expect(errors.filter(e => !e.includes('Missing element'))).toEqual([]);
  });

  test('no external requests and no raster images', async ({ page }) => {
    const external = trackExternalRequests(page);
    await page.goto(URL);
    await expect(page.locator('img')).toHaveCount(0);
    expect(external).toEqual([]);
  });
});
