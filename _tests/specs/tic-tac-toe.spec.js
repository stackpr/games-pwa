const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests } = require('../helpers');

const URL = '/games/tic-tac-toe/';

const square = (page, i) => page.locator(`.cell[data-index="${i}"]`);
const turnText = page => page.locator('#turn-text');
const turn = page => page.locator('#turn');

/** Plays the given squares in order, alternating X and O. */
async function playAll(page, indexes) {
  for (const i of indexes) await square(page, i).click();
}

// X takes the top row while O answers in the middle row.
const X_TOP_ROW = [0, 3, 1, 4, 2];
// Fills the board with no line: X 0,2,3,7,8 / O 1,4,5,6.
const DRAWN = [0, 1, 2, 4, 3, 5, 7, 6, 8];

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
});

test.describe('playing', () => {
  test('starts empty with player 1 (X) to move', async ({ page }) => {
    await expect(turnText(page)).toHaveText('Player 1 (X) to move');
    await expect(turn(page)).toHaveAttribute('data-player', '1');
    await expect(page.locator('.cell[data-p]')).toHaveCount(0);
  });

  test('the board is nine squares', async ({ page }) => {
    await expect(page.locator('.cell')).toHaveCount(9);
  });

  test('the first mark is an X, the second an O', async ({ page }) => {
    await square(page, 4).click();
    await expect(square(page, 4)).toHaveAttribute('data-p', '1');
    await expect(square(page, 4).locator('svg.mark-x')).toHaveCount(1);

    await square(page, 0).click();
    await expect(square(page, 0)).toHaveAttribute('data-p', '2');
    await expect(square(page, 0).locator('svg.mark-o')).toHaveCount(1);
  });

  test('players alternate', async ({ page }) => {
    await square(page, 0).click();
    await expect(turnText(page)).toHaveText('Player 2 (O) to move');
    await expect(turn(page)).toHaveAttribute('data-player', '2');
    await square(page, 1).click();
    await expect(turnText(page)).toHaveText('Player 1 (X) to move');
  });

  test('a played square is disabled and cannot be overwritten', async ({ page }) => {
    await square(page, 4).click();
    await expect(square(page, 4)).toBeDisabled();
    await expect(square(page, 4)).toHaveAttribute('data-p', '1');
    await expect(page.locator('.cell[data-p]')).toHaveCount(1);
  });
});

test.describe('winning and drawing', () => {
  test('three in a row wins and stops the game', async ({ page }) => {
    await playAll(page, X_TOP_ROW);
    await expect(turnText(page)).toHaveText('Player 1 (X) wins');
    await expect(turn(page)).toHaveAttribute('data-state', 'over');
    await expect(page.locator('.cell[data-win]')).toHaveCount(3);

    for (let i = 0; i < 9; i++) await expect(square(page, i)).toBeDisabled();
  });

  test('a column wins', async ({ page }) => {
    await playAll(page, [0, 1, 3, 4, 6]);
    await expect(turnText(page)).toHaveText('Player 1 (X) wins');
  });

  test('a diagonal wins', async ({ page }) => {
    await playAll(page, [0, 1, 4, 2, 8]);
    await expect(turnText(page)).toHaveText('Player 1 (X) wins');
  });

  test('player 2 can win', async ({ page }) => {
    // X: 0, 1, 8 / O: 3, 4, 5 — O takes the middle row.
    await playAll(page, [0, 3, 1, 4, 8, 5]);
    await expect(turnText(page)).toHaveText('Player 2 (O) wins');
    await expect(turn(page)).toHaveAttribute('data-player', '2');
  });

  test('only the winning line is highlighted', async ({ page }) => {
    await playAll(page, X_TOP_ROW);
    for (const i of [0, 1, 2]) {
      await expect(square(page, i)).toHaveAttribute('data-win', '');
    }
    await expect(square(page, 3)).not.toHaveAttribute('data-win', '');
  });

  test('a full board with no line is a draw', async ({ page }) => {
    await playAll(page, DRAWN);
    await expect(turnText(page)).toHaveText('Draw — nobody wins');
    await expect(turn(page)).toHaveAttribute('data-state', 'over');
    await expect(turn(page)).toHaveAttribute('data-player', 'none');
    await expect(page.locator('.cell[data-p]')).toHaveCount(9);
    await expect(page.locator('.cell[data-win]')).toHaveCount(0);
  });

  test('the turn disc is hidden on a draw', async ({ page }) => {
    await playAll(page, DRAWN);
    await expect(page.locator('#turn-disc')).toBeHidden();
  });
});

test.describe('undo and reset', () => {
  test('undo is disabled on an empty board', async ({ page }) => {
    await expect(page.locator('#undo')).toBeDisabled();
  });

  test('undo takes back the last mark', async ({ page }) => {
    await square(page, 4).click();
    await page.locator('#undo').click();
    await expect(page.locator('.cell[data-p]')).toHaveCount(0);
    await expect(turnText(page)).toHaveText('Player 1 (X) to move');
    await expect(square(page, 4)).toBeEnabled();
  });

  test('undo after a win resumes the game', async ({ page }) => {
    await playAll(page, X_TOP_ROW);
    await page.locator('#undo').click();
    await expect(turnText(page)).toHaveText('Player 1 (X) to move');
    await expect(page.locator('.cell[data-win]')).toHaveCount(0);
    await expect(square(page, 2)).toBeEnabled();
  });

  test('new game clears the board', async ({ page }) => {
    await playAll(page, [0, 4, 8]);
    await page.locator('#reset').click();
    await expect(page.locator('.cell[data-p]')).toHaveCount(0);
    await expect(turnText(page)).toHaveText('Player 1 (X) to move');
  });
});

test.describe('persistence', () => {
  test('the position survives a reload', async ({ page }) => {
    await playAll(page, [4, 0]);
    await page.reload();
    await expect(square(page, 4)).toHaveAttribute('data-p', '1');
    await expect(square(page, 0)).toHaveAttribute('data-p', '2');
    await expect(turnText(page)).toHaveText('Player 1 (X) to move');
  });

  test('only the move list is stored', async ({ page }) => {
    await playAll(page, [4, 0]);
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('games.tic-tac-toe.v1')));
    expect(saved).toEqual({ moves: [4, 0] });
  });

  test('corrupt saved state falls back to an empty board', async ({ page }) => {
    await page.evaluate(() =>
      localStorage.setItem('games.tic-tac-toe.v1', 'not json'));
    await page.reload();
    await expect(page.locator('.cell[data-p]')).toHaveCount(0);
    await expect(turnText(page)).toHaveText('Player 1 (X) to move');
  });

  test('a repeated saved square truncates the game there', async ({ page }) => {
    // Square 0 twice is impossible, so only the first two moves survive.
    await page.evaluate(() => localStorage.setItem(
      'games.tic-tac-toe.v1', JSON.stringify({ moves: [0, 1, 0, 5] })));
    await page.reload();
    await expect(page.locator('.cell[data-p]')).toHaveCount(2);
    await expect(turnText(page)).toHaveText('Player 1 (X) to move');
  });
});

test.describe('presentation', () => {
  test('uses the shared player colors, not its own', async ({ page }) => {
    await playAll(page, [0, 1]);

    const colors = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const strokeOf = sel => getComputedStyle(document.querySelector(sel)).stroke;
      return {
        p1: root.getPropertyValue('--player-1').trim(),
        p2: root.getPropertyValue('--player-2').trim(),
        x: strokeOf('.mark-x'),
        o: strokeOf('.mark-o'),
      };
    });

    expect(colors.p1).toBe('#2f6fdb');
    expect(colors.p2).toBe('#d84a35');
    expect(colors.x).toBe('rgb(47, 111, 219)');
    expect(colors.o).toBe('rgb(216, 74, 53)');
  });

  test('the turn indicator names the player, not just a color', async ({ page }) => {
    await expect(turnText(page)).toContainText('Player 1');
    await square(page, 0).click();
    await expect(turnText(page)).toContainText('Player 2');
  });

  test('marks are inline SVG, not raster images', async ({ page }) => {
    await playAll(page, [0, 1]);
    await expect(page.locator('svg.mark')).toHaveCount(2);
    await expect(page.locator('img')).toHaveCount(0);
  });

  test('no external requests', async ({ page }) => {
    const external = trackExternalRequests(page);
    await page.goto(URL);
    expect(external).toEqual([]);
  });

  test('the board fits the viewport in portrait and landscape', async ({ page }) => {
    for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      const overflow = await page.evaluate(() => ({
        x: document.documentElement.scrollWidth - window.innerWidth,
        y: document.documentElement.scrollHeight - window.innerHeight,
      }));
      expect(overflow.x, `x overflow at ${size.width}x${size.height}`).toBeLessThanOrEqual(0);
      expect(overflow.y, `y overflow at ${size.width}x${size.height}`).toBeLessThanOrEqual(0);
    }
  });
});
