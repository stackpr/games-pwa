const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests, trackErrors } = require('../helpers');

const URL = '/games/reversi/';

const sq = (page, i) => page.locator(`.sq[data-index="${i}"]`);
const label = page => page.locator('#turn-label');

/** Seeds an exact position. Codes: a player 1, b player 2, . empty. */
async function position(page, discs, turn = 1) {
  await page.evaluate(([list, t]) => {
    const board = new Array(64).fill('.');
    for (const [i, code] of list) board[i] = code;
    localStorage.setItem('games.reversi.v1', JSON.stringify({
      board: board.join(''), turn: t, over: false, passed: false,
    }));
  }, [Object.entries(discs).map(([i, c]) => [Number(i), c]), turn]);
  await page.reload();
}

const playable = page => page.evaluate(() =>
  [...document.querySelectorAll('.sq[data-play]')].map(s => Number(s.dataset.index)));

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
});

test.describe('the opening position', () => {
  test('four discs in the centre, player 1 on d5 and e4', async ({ page }) => {
    await expect(page.locator('.sq')).toHaveCount(64);
    await expect(page.locator('.sq[data-p="1"]')).toHaveCount(2);
    await expect(page.locator('.sq[data-p="2"]')).toHaveCount(2);
    await expect(sq(page, 27)).toHaveAttribute('data-p', '1');
    await expect(sq(page, 36)).toHaveAttribute('data-p', '1');
    await expect(sq(page, 28)).toHaveAttribute('data-p', '2');
    await expect(sq(page, 35)).toHaveAttribute('data-p', '2');
  });

  test('player 1 moves first, with the four standard openings', async ({ page }) => {
    await expect(label(page)).toHaveText('Player 1 to move');
    expect((await playable(page)).sort((a, b) => a - b)).toEqual([20, 29, 34, 43]);
  });

  test('the tally starts two apiece and marks the side to move', async ({ page }) => {
    await expect(page.locator('#count-1')).toHaveText('2');
    await expect(page.locator('#count-2')).toHaveText('2');
    await expect(page.locator('#tally-1')).toHaveAttribute('data-turn', '');
    await expect(page.locator('#tally-2')).not.toHaveAttribute('data-turn', /.*/);
  });

  test('a square that flips nothing is inert', async ({ page }) => {
    await expect(sq(page, 0)).toBeDisabled();
  });
});

test.describe('flipping', () => {
  test('a move flips the trapped run and takes the turn', async ({ page }) => {
    // e6: the disc on e5 is trapped between it and e4.
    await sq(page, 20).click();
    await expect(sq(page, 20)).toHaveAttribute('data-p', '1');
    await expect(sq(page, 28)).toHaveAttribute('data-p', '1');
    await expect(page.locator('#count-1')).toHaveText('4');
    await expect(page.locator('#count-2')).toHaveText('1');
    await expect(label(page)).toHaveText('Player 2 to move');
  });

  test('a run that reaches the edge traps nothing', async ({ page }) => {
    // Player 2 discs with no player 1 disc anywhere to close a run.
    await position(page, { 24: 'b', 25: 'b', 26: 'b' }, 1);
    expect(await playable(page)).toEqual([]);
  });

  test('flips run in every direction at once', async ({ page }) => {
    // 26 closes three runs: east through 27, south through 34, and the
    // diagonal through 35.
    await position(page, {
      27: 'b', 28: 'a', 34: 'b', 42: 'a', 35: 'b', 44: 'a',
    }, 1);
    await sq(page, 26).click();
    for (const i of [26, 27, 34, 35]) {
      await expect(sq(page, i)).toHaveAttribute('data-p', '1');
    }
    await expect(page.locator('.sq[data-p="2"]')).toHaveCount(0);
  });

  test('flipped discs are marked for the animation', async ({ page }) => {
    await sq(page, 20).click();
    await expect(sq(page, 28)).toHaveAttribute('data-flip', '');
    await expect(sq(page, 20)).not.toHaveAttribute('data-flip', /.*/);
  });
});

test.describe('passing and ending', () => {
  test('a player with no move is skipped', async ({ page }) => {
    // Playing a1-c1 leaves player 2 only the disc on b2, which cannot close
    // any run — but player 1 still has one, so the turn comes straight back.
    await position(page, { 0: 'a', 1: 'b', 9: 'b' }, 1);
    await sq(page, 2).click();
    await expect(label(page)).toHaveText('Player 1 to move, player 2 had no move');
    // b2 can be trapped from three squares on the row below it.
    expect((await playable(page)).sort((a, b) => a - b)).toEqual([16, 17, 18]);
  });

  test('neither side able to move ends the game', async ({ page }) => {
    // The last player 2 disc is taken, so nobody can move after.
    await position(page, { 0: 'a', 1: 'b' }, 1);
    await sq(page, 2).click();
    await expect(page.locator('#turn')).toHaveAttribute('data-state', 'over');
    await expect(page.locator('#turn-text')).toHaveText('Wins!');
    await expect(label(page)).toHaveText('Player 1 wins, 3 to 0');
    expect(await playable(page)).toEqual([]);
  });

  test('an equal count is a draw with no disc shown', async ({ page }) => {
    await page.evaluate(() => {
      const board = new Array(64).fill('.');
      board[0] = 'a'; board[1] = 'b';
      localStorage.setItem('games.reversi.v1', JSON.stringify({
        board: board.join(''), turn: 1, over: true, passed: false,
      }));
    });
    await page.reload();
    await expect(page.locator('#turn')).toHaveAttribute('data-state', 'over');
    await expect(page.locator('#turn')).toHaveAttribute('data-player', 'none');
    await expect(page.locator('#turn-text')).toHaveText('Draw');
    await expect(label(page)).toHaveText('Draw, 1 each');
  });
});

test.describe('undo and reset', () => {
  test('undo takes back a move and its flips', async ({ page }) => {
    await sq(page, 20).click();
    await page.locator('#undo').click();
    await expect(sq(page, 28)).toHaveAttribute('data-p', '2');
    await expect(sq(page, 20)).not.toHaveAttribute('data-p', /.*/);
    await expect(label(page)).toHaveText('Player 1 to move');
  });

  test('undo is disabled before anything happens', async ({ page }) => {
    await expect(page.locator('#undo')).toBeDisabled();
  });

  test('new game restores the opening cross', async ({ page }) => {
    await sq(page, 20).click();
    await page.locator('#reset').click();
    await expect(page.locator('.sq[data-p="1"]')).toHaveCount(2);
    await expect(page.locator('.sq[data-p="2"]')).toHaveCount(2);
    await expect(label(page)).toHaveText('Player 1 to move');
  });
});

test.describe('persistence', () => {
  test('the position survives a reload', async ({ page }) => {
    await sq(page, 20).click();
    await page.reload();
    await expect(sq(page, 28)).toHaveAttribute('data-p', '1');
    await expect(label(page)).toHaveText('Player 2 to move');
  });

  test('corrupt saved state falls back to a new game', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('games.reversi.v1', 'not json'));
    await page.reload();
    await expect(page.locator('.sq[data-p="1"]')).toHaveCount(2);
  });

  test('a board of the wrong length is rejected', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('games.reversi.v1',
      JSON.stringify({ board: 'aaa', turn: 1, over: false, passed: false })));
    await page.reload();
    await expect(page.locator('.sq[data-p="1"]')).toHaveCount(2);
  });
});

test.describe('presentation', { tag: '@layout' }, () => {
  test('the rules modal names Reversi as the original name', async ({ page }) => {
    await page.locator('#rules-btn').click();
    await expect(page.locator('#rules')).toBeVisible();
    await expect(page.locator('#rules')).toContainText('trademark');
    await page.keyboard.press('Escape');
    await expect(page.locator('#rules')).toBeHidden();
  });

  test('uses the shared player colors', async ({ page }) => {
    const colors = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const bg = sel => getComputedStyle(document.querySelector(sel)).backgroundColor;
      return {
        p1: root.getPropertyValue('--player-1').trim(),
        one: bg('.sq[data-p="1"] .disc'),
        two: bg('.sq[data-p="2"] .disc'),
      };
    });
    expect(colors.p1).toBe('#2f6fdb');
    expect(colors.one).toBe('rgb(47, 111, 219)');
    expect(colors.two).toBe('rgb(216, 74, 53)');
  });

  test('legal-move dots are actually painted', async ({ page }) => {
    // A dot drawn with an invalid length would compute away silently.
    const size = await page.evaluate(() => {
      const el = document.querySelector('.sq[data-play]');
      const s = getComputedStyle(el, '::after');
      return { w: parseFloat(s.width), h: parseFloat(s.height) };
    });
    expect(size.w).toBeGreaterThan(3);
    expect(size.h).toBeGreaterThan(3);
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

  test('survives markup from the neighbouring release', async ({ page }) => {
    // A new worker can pair this script with older HTML; a missing element
    // must warn, not blank the page. See CLAUDE.md.
    const errors = trackErrors(page);
    await page.route('**/games/reversi/', async route => {
      const res = await route.fetch();
      const body = (await res.text()).replace(/<button id="undo"[\s\S]*?<\/button>/, '');
      await route.fulfill({ response: res, body });
    });
    await page.goto(URL);
    await expect(page.locator('#undo')).toHaveCount(0);
    await expect(page.locator('.sq[data-p]')).toHaveCount(4);
    expect(errors.filter(e => !e.includes('Missing element'))).toEqual([]);
  });

  test('no external requests and no raster images', async ({ page }) => {
    const external = trackExternalRequests(page);
    await page.goto(URL);
    await expect(page.locator('img')).toHaveCount(0);
    expect(external).toEqual([]);
  });
});
