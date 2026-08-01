const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests } = require('../helpers');

const URL = '/games/checkers/';

const sq = (page, i) => page.locator(`.sq[data-index="${i}"]`);
const label = page => page.locator('#turn-label');

/** Seeds an exact position. Codes: a/A player 1 man/king, b/B player 2. */
async function position(page, pieces, turn = 1) {
  await page.evaluate(([list, t]) => {
    const board = new Array(64).fill('.');
    for (const [i, code] of list) board[i] = code;
    localStorage.setItem('games.checkers.v1', JSON.stringify({
      board: board.join(''), turn: t, locked: null, winner: 0,
    }));
  }, [Object.entries(pieces).map(([i, c]) => [Number(i), c]), turn]);
  await page.reload();
}

const playable = page => page.evaluate(() =>
  [...document.querySelectorAll('.sq[data-playable]')].map(s => Number(s.dataset.index)));

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
});

test.describe('the opening position', () => {
  test('twelve a side on the dark squares', async ({ page }) => {
    await expect(page.locator('.sq')).toHaveCount(64);
    await expect(page.locator('.sq[data-dark]')).toHaveCount(32);
    await expect(page.locator('.sq[data-p="1"]')).toHaveCount(12);
    await expect(page.locator('.sq[data-p="2"]')).toHaveCount(12);
    // Every piece is on a dark square.
    await expect(page.locator('.sq[data-p]:not([data-dark])')).toHaveCount(0);
  });

  test('player 1 moves first, from the front rank only', async ({ page }) => {
    await expect(label(page)).toHaveText('Player 1 to move');
    // Row 5 holds four men, and only those have anywhere to go.
    expect(await playable(page)).toEqual([40, 42, 44, 46]);
  });

  test('light squares are inert', async ({ page }) => {
    await expect(sq(page, 0)).toBeDisabled();
  });
});

test.describe('moving', () => {
  test('a man steps diagonally forward', async ({ page }) => {
    await sq(page, 40).click();
    await expect(sq(page, 40)).toHaveAttribute('data-sel', '');
    await expect(sq(page, 33)).toHaveAttribute('data-to', 'step');

    await sq(page, 33).click();
    await expect(sq(page, 33)).toHaveAttribute('data-p', '1');
    await expect(sq(page, 40)).not.toHaveAttribute('data-p', /.*/);
    await expect(label(page)).toHaveText('Player 2 to move');
  });

  test('tapping a selected piece again puts it down', async ({ page }) => {
    await sq(page, 40).click();
    await expect(sq(page, 40)).toHaveAttribute('data-sel', '');
    await sq(page, 40).click();
    await expect(sq(page, 40)).not.toHaveAttribute('data-sel', /.*/);
  });

  test('a man cannot step backwards', async ({ page }) => {
    // A lone man mid-board may only go up the board, never back down.
    await position(page, { 28: 'a' });
    await sq(page, 28).click();
    const targets = await page.evaluate(() =>
      [...document.querySelectorAll('.sq[data-to]')].map(s => Number(s.dataset.index)));
    expect(targets.sort((a, b) => a - b)).toEqual([19, 21]);
  });
});

test.describe('jumping is forced', () => {
  test('only the piece that can jump will pick up', async ({ page }) => {
    // 40 can jump 33; 56 could step but must not be allowed to.
    await position(page, { 40: 'a', 56: 'a', 33: 'b' });
    expect(await playable(page)).toEqual([40]);
    await expect(sq(page, 40)).toHaveAttribute('data-must', '');
    await expect(label(page)).toHaveText('Player 1 to move, must jump');
  });

  test('the jump target is marked differently from a step', async ({ page }) => {
    await position(page, { 40: 'a', 33: 'b' });
    await sq(page, 40).click();
    await expect(sq(page, 26)).toHaveAttribute('data-to', 'jump');
  });

  test('jumping removes the captured piece', async ({ page }) => {
    await position(page, { 40: 'a', 33: 'b' });
    await sq(page, 40).click();
    await sq(page, 26).click();
    await expect(sq(page, 26)).toHaveAttribute('data-p', '1');
    await expect(page.locator('.sq[data-p="2"]')).toHaveCount(0);
  });

  test('a chain keeps the turn and locks the piece', async ({ page }) => {
    await position(page, { 40: 'a', 56: 'a', 33: 'b', 19: 'b' });
    await sq(page, 40).click();
    await sq(page, 26).click();

    await expect(label(page)).toHaveText('Player 1 to move, continuing a jump');
    // Only the jumping piece and its next landing square are live.
    expect((await playable(page)).sort((a, b) => a - b)).toEqual([12, 26]);

    await sq(page, 12).click();
    await expect(page.locator('.sq[data-p="2"]')).toHaveCount(0);
  });
});

test.describe('kings', () => {
  test('reaching the far row crowns, and ends the move', async ({ page }) => {
    // Jumping 10 lands on the crown row; another jump from there is on offer
    // via 12, but crowning stops the turn.
    await position(page, { 17: 'a', 10: 'b', 12: 'b' });
    await sq(page, 17).click();
    await sq(page, 3).click();

    await expect(sq(page, 3).locator('.crown')).toHaveCount(1);
    await expect(label(page)).toHaveText('Player 2 to move');
    await expect(page.locator('.sq[data-p="2"]')).toHaveCount(1);
  });

  test('a king moves backwards too', async ({ page }) => {
    await position(page, { 28: 'A' });
    await sq(page, 28).click();
    const targets = await page.evaluate(() =>
      [...document.querySelectorAll('.sq[data-to]')].map(s => Number(s.dataset.index)));
    expect(targets.sort((a, b) => a - b)).toEqual([19, 21, 35, 37]);
  });
});

test.describe('winning', () => {
  test('taking the last piece wins', async ({ page }) => {
    await position(page, { 40: 'a', 33: 'b' });
    await sq(page, 40).click();
    await sq(page, 26).click();
    await expect(label(page)).toHaveText('Player 1 wins');
    await expect(page.locator('#turn-text')).toHaveText('Wins!');
  });

  test('a player with no legal move loses', async ({ page }) => {
    // Player 2's man on 0 is boxed into the corner by its own side.
    await position(page, { 40: 'a', 0: 'b', 9: 'B' }, 1);
    await sq(page, 40).click();
    await sq(page, 33).click();
    // Player 2 still has moves here, so the game continues.
    await expect(page.locator('#turn')).toHaveAttribute('data-state', 'playing');
  });

  test('the board locks once the game is over', async ({ page }) => {
    await position(page, { 40: 'a', 33: 'b' });
    await sq(page, 40).click();
    await sq(page, 26).click();
    expect(await playable(page)).toEqual([]);
  });
});

test.describe('undo and reset', () => {
  test('undo takes back a move', async ({ page }) => {
    await sq(page, 40).click();
    await sq(page, 33).click();
    await expect(label(page)).toHaveText('Player 2 to move');

    await page.locator('#undo').click();
    await expect(sq(page, 40)).toHaveAttribute('data-p', '1');
    await expect(sq(page, 33)).not.toHaveAttribute('data-p', /.*/);
    await expect(label(page)).toHaveText('Player 1 to move');
  });

  test('undo is disabled before anything happens', async ({ page }) => {
    await expect(page.locator('#undo')).toBeDisabled();
  });

  test('new game restores twelve a side', async ({ page }) => {
    await sq(page, 40).click();
    await sq(page, 33).click();
    await page.locator('#reset').click();
    await expect(page.locator('.sq[data-p="1"]')).toHaveCount(12);
    await expect(label(page)).toHaveText('Player 1 to move');
  });
});

test.describe('persistence', () => {
  test('the position survives a reload', async ({ page }) => {
    await sq(page, 40).click();
    await sq(page, 33).click();
    await page.reload();
    await expect(sq(page, 33)).toHaveAttribute('data-p', '1');
    await expect(label(page)).toHaveText('Player 2 to move');
  });

  test('corrupt saved state falls back to a new game', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('games.checkers.v1', 'not json'));
    await page.reload();
    await expect(page.locator('.sq[data-p="1"]')).toHaveCount(12);
  });

  test('a piece saved onto a light square is rejected', async ({ page }) => {
    // Not a position this game can reach, so the whole save is discarded.
    await page.evaluate(() => {
      const board = new Array(64).fill('.');
      board[0] = 'a';
      localStorage.setItem('games.checkers.v1',
        JSON.stringify({ board: board.join(''), turn: 1, locked: null, winner: 0 }));
    });
    await page.reload();
    await expect(page.locator('.sq[data-p="1"]')).toHaveCount(12);
  });
});

test.describe('presentation', () => {
  test('the rules modal explains the forced jump', async ({ page }) => {
    await page.locator('#rules-btn').click();
    await expect(page.locator('#rules')).toBeVisible();
    await expect(page.locator('#rules')).toContainText('forced');
    await page.keyboard.press('Escape');
    await expect(page.locator('#rules')).toBeHidden();
  });

  test('uses the shared player colors', async ({ page }) => {
    const colors = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const bg = sel => getComputedStyle(document.querySelector(sel)).backgroundColor;
      return {
        p1: root.getPropertyValue('--player-1').trim(),
        one: bg('.sq[data-p="1"] .piece'),
        two: bg('.sq[data-p="2"] .piece'),
      };
    });
    expect(colors.p1).toBe('#2f6fdb');
    expect(colors.one).toBe('rgb(47, 111, 219)');
    expect(colors.two).toBe('rgb(216, 74, 53)');
  });

  test('the board stays square and on screen', async ({ page }) => {
    for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 },
      { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      const m = await page.evaluate(() => {
        const b = document.getElementById('board').getBoundingClientRect();
        return {
          ratio: b.width / b.height,
          ox: document.documentElement.scrollWidth - window.innerWidth,
          oy: document.documentElement.scrollHeight - window.innerHeight,
        };
      });
      const at = `${size.width}x${size.height}`;
      expect(m.ratio, `square at ${at}`).toBeCloseTo(1, 1);
      expect(m.ox, `x overflow at ${at}`).toBeLessThanOrEqual(0);
      expect(m.oy, `y overflow at ${at}`).toBeLessThanOrEqual(0);
    }
  });

  test('no external requests and no raster images', async ({ page }) => {
    const external = trackExternalRequests(page);
    await page.goto(URL);
    await expect(page.locator('img')).toHaveCount(0);
    expect(external).toEqual([]);
  });
});
