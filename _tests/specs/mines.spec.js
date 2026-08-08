const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests } = require('../helpers');

const URL = '/games/mines/';
const KEY = 'games.mines.v1';

const cells = page => page.locator('.cell');
const minesLeft = page => page.locator('#mines-left');

/** The board's shape, read off the footer line. */
async function shape(page) {
  const text = await page.locator('#board-size').textContent();
  const m = /(\d+) × (\d+) · (\d+) mines/.exec(text);
  return { cols: Number(m[1]), rows: Number(m[2]), mines: Number(m[3]) };
}

async function resize(page, width, height) {
  await page.setViewportSize({ width, height });
  // The fit is driven by a ResizeObserver on the stage, so let it land.
  await page.waitForTimeout(300);
}

async function pickLevel(page, name) {
  await page.locator('#settings-btn').click();
  await page.locator('#opt-level button', { hasText: name }).click();
  await page.locator('#settings .modal-close').click();
}

/** Opens every square that is not mined, which is the whole win condition. */
async function clearField(page) {
  await cells(page).first().click();
  return page.evaluate(key => {
    const saved = JSON.parse(localStorage.getItem(key));
    const list = [...document.querySelectorAll('.cell')];
    for (let i = 0; i < saved.mines.length; i++) {
      if (saved.mines[i] === '1') continue;
      if (list[i].dataset.state === 'hidden') list[i].click();
    }
    return document.body.dataset.status;
  }, KEY);
}

/** The index of a mine, once they have been laid. */
function mineIndex(page) {
  return page.evaluate(key => {
    const saved = JSON.parse(localStorage.getItem(key));
    return saved.mines ? saved.mines.indexOf('1') : -1;
  }, KEY);
}

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
});

test.describe('fitting the screen', () => {
  test('a portrait phone gets a board taller than it is wide', async ({ page }) => {
    await resize(page, 390, 780);
    const s = await shape(page);
    expect(s.rows).toBeGreaterThan(s.cols);
    await expect(cells(page)).toHaveCount(s.cols * s.rows);
  });

  test('landscape gets a board wider than it is tall', async ({ page }) => {
    await resize(page, 780, 390);
    const s = await shape(page);
    expect(s.cols).toBeGreaterThan(s.rows);
  });

  test('squares stay big enough to hit', async ({ page }) => {
    for (const level of ['Easy', 'Medium', 'Hard']) {
      await resize(page, 360, 720);
      await pickLevel(page, level);
      const size = await cells(page).first().evaluate(el =>
        el.getBoundingClientRect().width);
      expect(size, level + ' squares').toBeGreaterThanOrEqual(34);
    }
  });

  test('a big screen gets bigger squares, not hundreds more of them', async ({ page }) => {
    await resize(page, 1600, 1200);
    const s = await shape(page);
    expect(s.cols * s.rows).toBeLessThanOrEqual(400);
    // The cap is paid for in square size, which is the whole point of it.
    const size = await cells(page).first().evaluate(el =>
      el.getBoundingClientRect().width);
    expect(size).toBeGreaterThan(40);
  });

  test('the board never overflows the screen', async ({ page }) => {
    for (const size of [{ w: 320, h: 568 }, { w: 390, h: 844 }, { w: 780, h: 390 }]) {
      await resize(page, size.w, size.h);
      const m = await page.evaluate(() => {
        const board = document.getElementById('board').getBoundingClientRect();
        const stage = document.querySelector('.stage').getBoundingClientRect();
        return {
          overflowX: document.documentElement.scrollWidth - window.innerWidth,
          overflowY: document.documentElement.scrollHeight - window.innerHeight,
          wide: board.width - stage.width,
          tall: board.height - stage.height,
        };
      });
      const at = size.w + 'x' + size.h;
      expect(m.overflowX, 'x overflow at ' + at).toBeLessThanOrEqual(0);
      expect(m.overflowY, 'y overflow at ' + at).toBeLessThanOrEqual(0);
      expect(m.wide, 'board wider than the stage at ' + at).toBeLessThanOrEqual(1);
      expect(m.tall, 'board taller than the stage at ' + at).toBeLessThanOrEqual(1);
    }
  });

  test('mines scale with the board', async ({ page }) => {
    await resize(page, 390, 780);
    const easy = await (async () => { await pickLevel(page, 'Easy'); return shape(page); })();
    await pickLevel(page, 'Hard');
    const hard = await shape(page);
    expect(hard.mines / (hard.cols * hard.rows))
      .toBeGreaterThan(easy.mines / (easy.cols * easy.rows));
  });
});

test.describe('playing', () => {
  test('the first click never hits a mine', async ({ page }) => {
    // Mines are laid after the opening click, so this is a property of every
    // board rather than luck on one of them.
    for (let round = 0; round < 8; round++) {
      await page.locator('#face').click();
      await cells(page).nth(round).click();
      await expect(page.locator('body')).toHaveAttribute('data-status', 'playing');
    }
  });

  test('the first click opens a patch, not a single square', async ({ page }) => {
    await cells(page).first().click();
    const open = await page.locator('.cell[data-state="open"]').count();
    expect(open).toBeGreaterThan(1);
  });

  test('the clock starts on the first click, not on load', async ({ page }) => {
    await expect(page.locator('#timer')).toHaveText('0:00');
    await page.waitForTimeout(600);
    await expect(page.locator('#timer')).toHaveText('0:00');
    await cells(page).first().click();
    await expect(page.locator('#timer')).not.toHaveText('0:00', { timeout: 3000 });
  });

  test('flag mode flags instead of opening, and the counter follows', async ({ page }) => {
    const before = Number(await minesLeft(page).textContent());
    await page.locator('#flag-btn').click();
    await expect(page.locator('#flag-btn')).toHaveAttribute('aria-pressed', 'true');

    await cells(page).first().click();
    await expect(cells(page).first()).toHaveAttribute('data-state', 'flag');
    await expect(minesLeft(page)).toHaveText(String(before - 1));

    // Tapping it again takes the flag off.
    await cells(page).first().click();
    await expect(cells(page).first()).toHaveAttribute('data-state', 'hidden');
    await expect(minesLeft(page)).toHaveText(String(before));
  });

  test('a flagged square is not opened by a tap', async ({ page }) => {
    await page.locator('#flag-btn').click();
    await cells(page).first().click();
    await page.locator('#flag-btn').click();
    await cells(page).first().click();
    await expect(cells(page).first()).toHaveAttribute('data-state', 'flag');
  });

  test('right-click flags without flag mode', async ({ page }) => {
    await cells(page).nth(3).click({ button: 'right' });
    await expect(cells(page).nth(3)).toHaveAttribute('data-state', 'flag');
  });

  test('press and hold flags', async ({ page }) => {
    const box = await cells(page).nth(2).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(550);
    await page.mouse.up();
    await expect(cells(page).nth(2)).toHaveAttribute('data-state', 'flag');
    // …and the click behind the hold does not also open the square.
    await expect(page.locator('body')).toHaveAttribute('data-status', 'ready');
  });

  test('hitting a mine ends it and shows them all', async ({ page }) => {
    await pickLevel(page, 'Hard');
    await cells(page).first().click();
    await expect(page.locator('body')).toHaveAttribute('data-status', 'playing');

    const i = await mineIndex(page);
    expect(i).toBeGreaterThanOrEqual(0);
    await cells(page).nth(i).click();

    await expect(page.locator('body')).toHaveAttribute('data-status', 'lost');
    await expect(cells(page).nth(i)).toHaveAttribute('data-boom', '');
    const shown = await page.locator('.cell[data-mine]').count();
    const s = await shape(page);
    expect(shown).toBe(s.mines);

    // Nothing responds afterwards.
    const open = await page.locator('.cell[data-state="open"]').count();
    await cells(page).last().click();
    expect(await page.locator('.cell[data-state="open"]').count()).toBe(open);
  });

  test('clearing every safe square wins', async ({ page }) => {
    expect(await clearField(page)).toBe('won');
    await expect(page.locator('body')).toHaveAttribute('data-status', 'won');
    // Winning finds the rest of the mines for you.
    await expect(minesLeft(page)).toHaveText('0');
    const s = await shape(page);
    await expect(page.locator('.cell[data-state="flag"]')).toHaveCount(s.mines);
  });
});

test.describe('best times', () => {
  test('a win is kept under its own board size', async ({ page }) => {
    await resize(page, 390, 780);
    expect(await clearField(page)).toBe('won');
    const s = await shape(page);

    await page.locator('#scores-btn').click();
    await expect(page.locator('#score-body .score-size')).toHaveText(
      new RegExp('Medium · ' + s.cols + ' × ' + s.rows + ' · ' + s.mines + ' mines'));
    await expect(page.locator('#score-body .score-list li')).toHaveCount(1);

    const saved = await page.evaluate(key =>
      JSON.parse(localStorage.getItem(key)).scores, KEY);
    const key = 'medium:' + s.cols + 'x' + s.rows + 'x' + s.mines;
    expect(Object.keys(saved)).toEqual([key]);
    expect(saved[key].times).toHaveLength(1);
  });

  test('two boards keep two lists', async ({ page }) => {
    await resize(page, 390, 780);
    expect(await clearField(page)).toBe('won');
    await pickLevel(page, 'Easy');
    expect(await clearField(page)).toBe('won');

    await page.locator('#scores-btn').click();
    await expect(page.locator('#score-body .score-size')).toHaveCount(2);
  });

  test('with no wins the list says so', async ({ page }) => {
    await page.locator('#scores-btn').click();
    await expect(page.locator('#score-body .score-empty')).toBeVisible();
  });
});

test.describe('persistence', () => {
  test('a game in progress survives a reload', async ({ page }) => {
    await cells(page).first().click();
    const before = await page.evaluate(() =>
      [...document.querySelectorAll('.cell')].map(c => c.dataset.state).join(''));
    const s = await shape(page);

    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-status', 'playing');
    expect(await shape(page)).toEqual(s);
    expect(await page.evaluate(() =>
      [...document.querySelectorAll('.cell')].map(c => c.dataset.state).join(''))).toBe(before);
  });

  test('it saves under its own namespaced key', async ({ page }) => {
    await cells(page).first().click();
    const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    expect(saved.level).toBe('medium');
    expect(saved.mines.length).toBe(saved.cols * saved.rows);
    expect(saved.mask.length).toBe(saved.cols * saved.rows);
  });

  test('best times survive a corrupt board', async ({ page }) => {
    expect(await clearField(page)).toBe('won');
    await page.evaluate(key => {
      const saved = JSON.parse(localStorage.getItem(key));
      saved.mask = 'nonsense';
      localStorage.setItem(key, JSON.stringify(saved));
    }, KEY);
    await page.reload();
    // A fresh board, but the times are parsed separately and kept.
    await expect(page.locator('body')).toHaveAttribute('data-status', 'ready');
    await page.locator('#scores-btn').click();
    await expect(page.locator('#score-body .score-list li')).toHaveCount(1);
  });

  test('corrupt saved state falls back to a playable board', async ({ page }) => {
    await page.evaluate(key => localStorage.setItem(key, 'not json'), KEY);
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-status', 'ready');
    await cells(page).first().click();
    await expect(page.locator('body')).toHaveAttribute('data-status', 'playing');
  });
});

test.describe('the shell', () => {
  test('nothing leaves the origin', async ({ page }) => {
    const external = trackExternalRequests(page);
    await page.goto(URL);
    await cells(page).first().click();
    expect(external).toEqual([]);
  });
});
