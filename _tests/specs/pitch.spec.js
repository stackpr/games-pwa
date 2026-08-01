const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests, trackErrors } = require('../helpers');

const URL = '/games/pitch/';

const total = (page, side) => page.locator(`#total-${side}`);
const bidder = (page, side) => page.locator(`#bidder-row .side[data-side="${side}"]`);
const took = (page, side) => page.locator(`#took-${side}`);
const tookUp = (page, side) => page.locator(`#took-up-${side}`);
const tookDown = (page, side) => page.locator(`#took-down-${side}`);

async function bid(page, n) {
  const from = Number(await page.locator('#bid-value').textContent());
  const dir = n > from ? '#bid-up' : '#bid-down';
  for (let i = 0; i < Math.abs(n - from); i++) await page.locator(dir).click();
}

/** Gives each side its points, then scores the hand. `points` is per side. */
async function hand(page, { by, amount, points }) {
  await bidder(page, by).click();
  await bid(page, amount);
  await page.locator('#score').click();      // Lock bid
  for (let side = 0; side < points.length; side++) {
    for (let i = 0; i < points[side]; i++) await tookUp(page, side).click();
  }
  await page.locator('#score').click();      // Score the hand
}

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
});

test.describe('the sheet', () => {
  test('opens on four players, ten point, two teams', async ({ page }) => {
    await expect(page.locator('.total')).toHaveCount(2);
    await expect(page.locator('.total .total-name').first()).toHaveText('Team 1');
    await expect(page.locator('#empty')).toBeVisible();
    await expect(total(page, 0)).toHaveText('0');
  });

  test('opens in the bidding phase, with no point steppers up', async ({ page }) => {
    await expect(page.locator('#entry')).toHaveAttribute('data-phase', 'bidding');
    await expect(page.locator('#score')).toHaveText('Lock bid');
    await expect(page.locator('.took-stage')).toBeHidden();
    await expect(page.locator('#bidder-row .side')).toHaveCount(2);
  });

  test('the entry panel names no individual points', async ({ page }) => {
    // Counting tricks is the table's job; the point list is reference only.
    await expect(page.locator('#entry')).not.toContainText('Off-Jack');
    await page.locator('#rules-btn').click();
    await expect(page.locator('#points-list')).toContainText('Off-Jack');
  });
});

test.describe('locking the bid', () => {
  test('the bid runs two to the version total', async ({ page }) => {
    await bid(page, 2);
    await expect(page.locator('#bid-down')).toBeDisabled();
    await bid(page, 10);
    await expect(page.locator('#bid-value')).toHaveText('10');
    await expect(page.locator('#bid-up')).toBeDisabled();
  });

  test('locking shows the points, the bid, and a way back', async ({ page }) => {
    await bidder(page, 1).click();
    await bid(page, 6);
    await page.locator('#score').click();
    await expect(page.locator('#entry')).toHaveAttribute('data-phase', 'playing');
    await expect(page.locator('#entry-title')).toHaveText('Hand 1 · Team 2 bid 6');
    await expect(page.locator('#score')).toHaveText('Score the hand');
    await expect(page.locator('.bid-stage')).toBeHidden();
    await expect(page.locator('#took .took-cell')).toHaveCount(2);

    await page.locator('#edit-bid').click();
    await expect(page.locator('#entry')).toHaveAttribute('data-phase', 'bidding');
    await expect(page.locator('#bid-value')).toHaveText('6');
    await expect(bidder(page, 1)).toHaveAttribute('aria-pressed', 'true');
  });

  test('the bid cannot be stepped once it is locked', async ({ page }) => {
    await page.locator('#score').click();
    await expect(page.locator('#bid-up')).toBeDisabled();
    await expect(page.locator('#bid-down')).toBeDisabled();
  });
});

test.describe('the points have to add up', () => {
  test.beforeEach(async ({ page }) => {
    await page.locator('#score').click();   // lock the default bid of 4
  });

  test('the panel counts down what is still to place', async ({ page }) => {
    await expect(page.locator('#entry-left')).toHaveText('10 of 10 still to place');
    await tookUp(page, 0).click();
    await tookUp(page, 0).click();
    await expect(took(page, 0)).toHaveText('2');
    await expect(page.locator('#entry-left')).toHaveText('8 of 10 still to place');
  });

  test('the hand will not score until they do', async ({ page }) => {
    await expect(page.locator('#score')).toBeDisabled();
    for (let i = 0; i < 9; i++) await tookUp(page, 0).click();
    await expect(page.locator('#score')).toBeDisabled();
    await tookUp(page, 1).click();
    await expect(page.locator('#entry-left')).toHaveText('all 10 placed');
    await expect(page.locator('#score')).toBeEnabled();
  });

  test('the steppers cannot overshoot the hand total', async ({ page }) => {
    for (let i = 0; i < 10; i++) await tookUp(page, 0).click();
    await expect(took(page, 0)).toHaveText('10');
    await expect(tookUp(page, 0)).toBeDisabled();
    await expect(tookUp(page, 1)).toBeDisabled();
    // Freeing a point re-opens the other side.
    await tookDown(page, 0).click();
    await expect(tookUp(page, 1)).toBeEnabled();
  });

  test('a side at zero cannot go below it', async ({ page }) => {
    await expect(tookDown(page, 0)).toBeDisabled();
  });
});

test.describe('scoring a hand', () => {
  test('a made bid scores what was taken', async ({ page }) => {
    await hand(page, { by: 0, amount: 4, points: [6, 4] });
    await expect(total(page, 0)).toHaveText('6');
    await expect(total(page, 1)).toHaveText('4');
    await expect(page.locator('#empty')).toBeHidden();
  });

  test('falling short of the bid loses it outright', async ({ page }) => {
    await hand(page, { by: 0, amount: 7, points: [2, 8] });
    await expect(total(page, 0)).toHaveText('-7');
    await expect(total(page, 1)).toHaveText('8');
  });

  test('the bidder is marked and a set hand reads as a loss', async ({ page }) => {
    await hand(page, { by: 0, amount: 7, points: [1, 9] });
    const cell = page.locator('#rows tr .pts').first();
    await expect(cell).toHaveAttribute('data-bidder', '');
    await expect(cell).toHaveAttribute('data-sign', 'down');
    await expect(page.locator('#rows .bidcell')).toHaveText('Team 1 7');
  });

  test('scoring returns to bidding for the next hand', async ({ page }) => {
    await hand(page, { by: 1, amount: 5, points: [4, 6] });
    await expect(page.locator('#entry')).toHaveAttribute('data-phase', 'bidding');
    await expect(page.locator('#entry-title')).toHaveText('Hand 2 · bidding');
    await expect(took(page, 0)).toHaveText('0');
  });

  test('totals add up across hands', async ({ page }) => {
    for (let i = 0; i < 2; i++) {
      await hand(page, { by: 0, amount: 4, points: [4, 6] });
    }
    await expect(page.locator('#rows tr')).toHaveCount(2);
    await expect(total(page, 0)).toHaveText('8');
    await expect(total(page, 1)).toHaveText('12');
  });

  test('undo removes the last hand only', async ({ page }) => {
    await hand(page, { by: 0, amount: 4, points: [4, 6] });
    await hand(page, { by: 1, amount: 4, points: [6, 4] });
    await expect(page.locator('#rows tr')).toHaveCount(2);
    await page.locator('#undo').click();
    await expect(page.locator('#rows tr')).toHaveCount(1);
    await expect(total(page, 0)).toHaveText('4');
  });

  test('undo is disabled before anything is scored', async ({ page }) => {
    await expect(page.locator('#undo')).toBeDisabled();
  });
});

test.describe('players and point versions', () => {
  test('five players is five sides, one per player', async ({ page }) => {
    await page.locator('#settings-btn').click();
    await page.locator('#players-5').click();
    await expect(page.locator('.total')).toHaveCount(5);
    await expect(page.locator('.total .total-name').first()).toHaveText('P1');
    await expect(page.locator('#bidder-row .side')).toHaveCount(5);
  });

  test('thirteen point raises the ceiling and the hand total', async ({ page }) => {
    await page.locator('#settings-btn').click();
    await page.locator('#points-13').click();
    await page.locator('#settings .modal-close').click();
    await bid(page, 13);
    await expect(page.locator('#bid-up')).toBeDisabled();
    await bid(page, 4);
    await page.locator('#score').click();
    await expect(page.locator('#entry-left')).toHaveText('13 of 13 still to place');
    await expect(page.locator('#took-label')).toHaveText('Points taken · 13 in the hand');
  });

  test('the rules modal lists exactly what is at stake', async ({ page }) => {
    await page.locator('#rules-btn').click();
    await expect(page.locator('#points-list li')).toHaveCount(9);
    await expect(page.locator('#points-list li').first()).toHaveText('High — 1 point');
    await expect(page.locator('#points-list li').nth(6)).toHaveText('Three — 3 points');
    await expect(page.locator('#points-list li').last())
      .toHaveText('Everything counted: 10 points a hand.');
  });

  test('a five-player hand scores per player', async ({ page }) => {
    await page.locator('#settings-btn').click();
    await page.locator('#players-5').click();
    await page.locator('#settings .modal-close').click();
    await hand(page, { by: 2, amount: 4, points: [1, 0, 4, 4, 1] });
    await expect(total(page, 2)).toHaveText('4');
    await expect(total(page, 0)).toHaveText('1');
    await expect(total(page, 4)).toHaveText('1');
    await expect(total(page, 1)).toHaveText('0');
  });

  test('changing the version clears the sheet', async ({ page }) => {
    await hand(page, { by: 0, amount: 4, points: [4, 6] });
    page.on('dialog', d => d.accept());
    await page.locator('#settings-btn').click();
    await page.locator('#points-13').click();
    await expect(page.locator('#rows tr')).toHaveCount(0);
    await expect(total(page, 0)).toHaveText('0');
  });
});

test.describe('persistence', () => {
  test('the sheet and the hand in progress both survive a reload',
    async ({ page }) => {
      await hand(page, { by: 0, amount: 4, points: [4, 6] });
      await bidder(page, 1).click();
      await bid(page, 6);
      await page.locator('#score').click();
      await tookUp(page, 1).click();

      await page.reload();
      await expect(page.locator('#rows tr')).toHaveCount(1);
      await expect(total(page, 0)).toHaveText('4');
      await expect(page.locator('#entry')).toHaveAttribute('data-phase', 'playing');
      await expect(page.locator('#bid-value')).toHaveText('6');
      await expect(bidder(page, 1)).toHaveAttribute('aria-pressed', 'true');
      await expect(took(page, 1)).toHaveText('1');
    });

  test('the settings survive a reload', async ({ page }) => {
    await page.locator('#settings-btn').click();
    await page.locator('#players-5').click();
    await page.locator('#points-13').click();
    await page.reload();
    await expect(page.locator('.total')).toHaveCount(5);
    await expect(page.locator('#bidder-row .side')).toHaveCount(5);
  });

  test('corrupt saved state falls back to an empty sheet', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('games.pitch.v2', 'not json'));
    await page.reload();
    await expect(page.locator('#rows tr')).toHaveCount(0);
    await expect(total(page, 0)).toHaveText('0');
  });

  test('a saved hand that no longer adds up is kept, not zeroed',
    async ({ page }) => {
      await page.evaluate(() => localStorage.setItem('games.pitch.v2', JSON.stringify({
        players: 4, points: 10, rounds: [],
        draft: { phase: 'playing', bidder: 0, bid: 4, took: [3, 2] },
      })));
      await page.reload();
      await expect(took(page, 0)).toHaveText('3');
      await expect(page.locator('#score')).toBeDisabled();
      await expect(page.locator('#entry-left')).toHaveText('5 of 10 still to place');
    });
});

test.describe('presentation', () => {
  test('uses the shared player colors for the two teams', async ({ page }) => {
    const colors = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const boxes = document.querySelectorAll('.total');
      return {
        p1: root.getPropertyValue('--player-1').trim(),
        one: getComputedStyle(boxes[0]).backgroundColor,
        two: getComputedStyle(boxes[1]).backgroundColor,
      };
    });
    expect(colors.p1).toBe('#2f6fdb');
    expect(colors.one).toBe('rgb(47, 111, 219)');
    expect(colors.two).toBe('rgb(216, 74, 53)');
  });

  test('the entry buttons take the height the sheet can spare', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const bidderHeight = await bidder(page, 0)
      .evaluate(node => node.getBoundingClientRect().height);
    expect(bidderHeight).toBeGreaterThan(60);

    await page.locator('#score').click();
    const stepHeight = await tookUp(page, 0)
      .evaluate(node => node.getBoundingClientRect().height);
    expect(stepHeight).toBeGreaterThan(60);
  });

  test('nothing overflows sideways, even at five players', async ({ page }) => {
    await page.locator('#settings-btn').click();
    await page.locator('#players-5').click();
    await page.locator('#settings .modal-close').click();
    for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size);
      const over = await page.evaluate(() =>
        document.documentElement.scrollWidth - window.innerWidth);
      expect(over, `${size.width}x${size.height}`).toBeLessThanOrEqual(0);
    }
  });

  test('nothing overflows downward either', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.locator('#settings-btn').click();
    await page.locator('#players-5').click();
    await page.locator('#settings .modal-close').click();
    await page.locator('#score').click();
    const over = await page.evaluate(() =>
      document.documentElement.scrollHeight - window.innerHeight);
    expect(over).toBeLessThanOrEqual(0);
  });

  test('survives markup from the neighbouring release', async ({ page }) => {
    const errors = trackErrors(page);
    await page.route('**/games/pitch/', async route => {
      const res = await route.fetch();
      const body = (await res.text()).replace(/<button id="edit-bid"[\s\S]*?<\/button>/, '');
      await route.fulfill({ response: res, body });
    });
    await page.goto(URL);
    await expect(page.locator('#edit-bid')).toHaveCount(0);
    await expect(page.locator('#bidder-row .side')).toHaveCount(2);
    expect(errors).toEqual([]);
  });

  test('no external requests and no raster images', async ({ page }) => {
    const external = trackExternalRequests(page);
    await page.goto(URL);
    await expect(page.locator('img')).toHaveCount(0);
    expect(external).toEqual([]);
  });
});
