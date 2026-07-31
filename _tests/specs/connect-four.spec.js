const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests } = require('../helpers');

const URL = '/games/connect-four/';

const col = (page, c) => page.locator(`.col[data-col="${c}"]`);
const turnText = page => page.locator('#turn-text');
const turn = page => page.locator('#turn');
// Cells are laid out column-major: each .col holds its 6 rows, top first.
const cell = (page, c, r) => page.locator(`.col[data-col="${c}"] .cell`).nth(r);

/** Alternating drops in two columns, so neither player ever connects four. */
async function playSafely(page, count) {
  for (let i = 0; i < count; i++) await col(page, i % 2).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
});

test.describe('dropping', () => {
  test('starts empty with player 1 to move', async ({ page }) => {
    await expect(turnText(page)).toHaveText('Player 1 to move');
    await expect(turn(page)).toHaveAttribute('data-player', '1');
    await expect(page.locator('.cell[data-p]')).toHaveCount(0);
  });

  test('the board is 7 columns of 6 cells', async ({ page }) => {
    await expect(page.locator('.col')).toHaveCount(7);
    await expect(page.locator('.cell')).toHaveCount(42);
  });

  test('a piece lands on the bottom row of the column touched', async ({ page }) => {
    await col(page, 3).click();
    await expect(cell(page, 3, 5)).toHaveAttribute('data-p', '1');
    await expect(page.locator('.cell[data-p]')).toHaveCount(1);
  });

  test('pieces stack upwards in the same column', async ({ page }) => {
    await col(page, 2).click();
    await col(page, 2).click();
    await col(page, 2).click();
    await expect(cell(page, 2, 5)).toHaveAttribute('data-p', '1');
    await expect(cell(page, 2, 4)).toHaveAttribute('data-p', '2');
    await expect(cell(page, 2, 3)).toHaveAttribute('data-p', '1');
  });

  test('touching anywhere in the column drops the piece', async ({ page }) => {
    // The whole column is the target, so a tap near the top still lands
    // at the bottom — that is the point of the column-sized hit area.
    const box = await col(page, 4).boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + 8);
    await expect(cell(page, 4, 5)).toHaveAttribute('data-p', '1');
  });

  test('players alternate', async ({ page }) => {
    await col(page, 0).click();
    await expect(turnText(page)).toHaveText('Player 2 to move');
    await expect(turn(page)).toHaveAttribute('data-player', '2');
    await col(page, 1).click();
    await expect(turnText(page)).toHaveText('Player 1 to move');
  });

  test('a full column is disabled and takes no more pieces', async ({ page }) => {
    for (let i = 0; i < 6; i++) await col(page, 6).click();
    await expect(col(page, 6)).toBeDisabled();
    await expect(page.locator('.col[data-col="6"] .cell[data-p]')).toHaveCount(6);
  });

  test('number keys drop in a column', async ({ page }) => {
    await page.keyboard.press('1');
    await expect(cell(page, 0, 5)).toHaveAttribute('data-p', '1');
    await page.keyboard.press('7');
    await expect(cell(page, 6, 5)).toHaveAttribute('data-p', '2');
  });
});

test.describe('winning', () => {
  test('four in a row horizontally wins and stops the game', async ({ page }) => {
    // P1 takes the bottom of 0-3; P2 answers on row 5 of columns 4-6.
    await col(page, 0).click(); await col(page, 4).click();
    await col(page, 1).click(); await col(page, 5).click();
    await col(page, 2).click(); await col(page, 6).click();
    await col(page, 3).click();

    await expect(turnText(page)).toHaveText('Player 1 wins');
    await expect(turn(page)).toHaveAttribute('data-state', 'over');
    await expect(page.locator('.cell[data-win]')).toHaveCount(4);

    // Every column is locked, so nothing can land after the win.
    for (let c = 0; c < 7; c++) await expect(col(page, c)).toBeDisabled();
  });

  test('four in a column wins', async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      await col(page, 1).click();   // P1 stacks column 1
      await col(page, 2).click();   // P2 stacks column 2
    }
    await col(page, 1).click();
    await expect(turnText(page)).toHaveText('Player 1 wins');
    await expect(page.locator('.cell[data-win]')).toHaveCount(4);
  });

  test('a diagonal wins', async ({ page }) => {
    // Builds the staircase 0,1,2,3 rising left-to-right for player 1.
    await col(page, 0).click();                      // P1 (5,0)
    await col(page, 1).click();                      // P2 (5,1)
    await col(page, 1).click();                      // P1 (4,1)
    await col(page, 2).click();                      // P2 (5,2)
    await col(page, 2).click();                      // P1 (4,2)
    await col(page, 3).click();                      // P2 (5,3)
    await col(page, 2).click();                      // P1 (3,2)
    await col(page, 3).click();                      // P2 (4,3)
    await col(page, 6).click();                      // P1 parks elsewhere
    await col(page, 3).click();                      // P2 (3,3)
    await col(page, 3).click();                      // P1 (2,3) completes 5,0/4,1/3,2/2,3

    await expect(turnText(page)).toHaveText('Player 1 wins');
    await expect(page.locator('.cell[data-win]')).toHaveCount(4);
  });

  test('the winning discs are highlighted, others are not', async ({ page }) => {
    await col(page, 0).click(); await col(page, 4).click();
    await col(page, 1).click(); await col(page, 5).click();
    await col(page, 2).click(); await col(page, 6).click();
    await col(page, 3).click();

    for (let c = 0; c < 4; c++) {
      await expect(cell(page, c, 5)).toHaveAttribute('data-win', '');
    }
    await expect(cell(page, 4, 5)).not.toHaveAttribute('data-win', '');
  });
});

test.describe('undo and reset', () => {
  test('undo is disabled on an empty board', async ({ page }) => {
    await expect(page.locator('#undo')).toBeDisabled();
  });

  test('undo removes the last piece and hands the turn back', async ({ page }) => {
    await col(page, 3).click();
    await expect(turnText(page)).toHaveText('Player 2 to move');
    await page.locator('#undo').click();
    await expect(page.locator('.cell[data-p]')).toHaveCount(0);
    await expect(turnText(page)).toHaveText('Player 1 to move');
    await expect(page.locator('#undo')).toBeDisabled();
  });

  test('undo after a win resumes the game', async ({ page }) => {
    await col(page, 0).click(); await col(page, 4).click();
    await col(page, 1).click(); await col(page, 5).click();
    await col(page, 2).click(); await col(page, 6).click();
    await col(page, 3).click();
    await expect(turnText(page)).toHaveText('Player 1 wins');

    await page.locator('#undo').click();
    await expect(turnText(page)).toHaveText('Player 1 to move');
    await expect(page.locator('.cell[data-win]')).toHaveCount(0);
    await expect(col(page, 3)).toBeEnabled();
  });

  test('new game clears the board', async ({ page }) => {
    await playSafely(page, 5);
    await page.locator('#reset').click();
    await expect(page.locator('.cell[data-p]')).toHaveCount(0);
    await expect(turnText(page)).toHaveText('Player 1 to move');
  });
});

test.describe('persistence', () => {
  test('the position survives a reload', async ({ page }) => {
    await col(page, 3).click();
    await col(page, 3).click();
    await col(page, 5).click();
    await page.reload();

    await expect(cell(page, 3, 5)).toHaveAttribute('data-p', '1');
    await expect(cell(page, 3, 4)).toHaveAttribute('data-p', '2');
    await expect(cell(page, 5, 5)).toHaveAttribute('data-p', '1');
    await expect(turnText(page)).toHaveText('Player 2 to move');
  });

  test('only the move list is stored', async ({ page }) => {
    await col(page, 3).click();
    await col(page, 1).click();
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('games.connect-four.v1')));
    expect(saved).toEqual({ moves: [3, 1] });
  });

  test('corrupt saved state falls back to an empty board', async ({ page }) => {
    await page.evaluate(() =>
      localStorage.setItem('games.connect-four.v1', 'not json'));
    await page.reload();
    await expect(page.locator('.cell[data-p]')).toHaveCount(0);
    await expect(turnText(page)).toHaveText('Player 1 to move');
  });

  test('an illegal saved move truncates the game at that point', async ({ page }) => {
    // Column 99 does not exist, so only the two moves before it survive.
    await page.evaluate(() => localStorage.setItem(
      'games.connect-four.v1', JSON.stringify({ moves: [0, 1, 99, 2] })));
    await page.reload();
    await expect(page.locator('.cell[data-p]')).toHaveCount(2);
    await expect(turnText(page)).toHaveText('Player 1 to move');
  });
});

test.describe('presentation', () => {
  test('uses the shared player colors, not its own', async ({ page }) => {
    await col(page, 0).click();
    await col(page, 1).click();

    const colors = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const discOf = c => {
        const cell = document.querySelector(`.col[data-col="${c}"] .cell[data-p]`);
        return getComputedStyle(cell.querySelector('.disc')).backgroundColor;
      };
      return {
        p1: root.getPropertyValue('--player-1').trim(),
        p2: root.getPropertyValue('--player-2').trim(),
        disc1: discOf(0),
        disc2: discOf(1),
      };
    });

    // The tokens come from the shared stylesheet, not a local declaration.
    expect(colors.p1).toBe('#2f6fdb');
    expect(colors.p2).toBe('#d84a35');
    expect(colors.disc1).toBe('rgb(47, 111, 219)');
    expect(colors.disc2).toBe('rgb(216, 74, 53)');
  });

  test('pieces keep their shading and the winning four are ringed', async ({ page }) => {
    // box-shadow rejects percentage lengths and drops the whole declaration
    // if it sees one, which flattens every piece without any error. Assert
    // the computed value so that failure cannot happen silently again.
    await col(page, 0).click();
    const shadow = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.cell[data-p] .disc')).boxShadow);
    expect(shadow).not.toBe('none');

    await col(page, 4).click();
    await col(page, 1).click(); await col(page, 5).click();
    await col(page, 2).click(); await col(page, 6).click();
    await col(page, 3).click();

    const winShadow = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.cell[data-win] .disc')).boxShadow);
    expect(winShadow).not.toBe('none');
    // The white ring is what marks the winning line when the pulse is at
    // its dimmest, and for anyone with reduced motion turned on.
    expect(winShadow).toContain('rgb(255, 255, 255)');
  });

  test('the ring survives reduced motion, which drops the pulse', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await col(page, 0).click(); await col(page, 4).click();
    await col(page, 1).click(); await col(page, 5).click();
    await col(page, 2).click(); await col(page, 6).click();
    await col(page, 3).click();

    const win = await page.evaluate(() => {
      const disc = document.querySelector('.cell[data-win] .disc');
      const style = getComputedStyle(disc);
      return { shadow: style.boxShadow, animation: style.animationName };
    });

    expect(win.animation).toBe('none');
    expect(win.shadow).toContain('rgb(255, 255, 255)');
  });

  test('the turn indicator names the player, not just a color', async ({ page }) => {
    // Color must never be the only signal; see Player colors in CLAUDE.md.
    await expect(turnText(page)).toContainText('Player 1');
    await col(page, 0).click();
    await expect(turnText(page)).toContainText('Player 2');
  });

  test('no raster images and nothing leaves the origin', async ({ page }) => {
    const external = trackExternalRequests(page);
    await page.goto(URL);
    await expect(page.locator('img')).toHaveCount(0);
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
