const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests, trackErrors } = require('../helpers');

const URL = '/games/pitch/';

const total = (page, side) => page.locator(`#total-${side}`);
const itemSide = (page, key, side) =>
  page.locator(`.item[data-item="${key}"] .side[data-side="${side}"]`);
const bidder = (page, side) => page.locator(`#bidder-row .side[data-side="${side}"]`);

async function bid(page, n) {
  const from = Number(await page.locator('#bid-value').textContent());
  const dir = n > from ? '#bid-up' : '#bid-down';
  for (let i = 0; i < Math.abs(n - from); i++) await page.locator(dir).click();
}

/** Assigns each named point to a side, then scores the hand. */
async function hand(page, { by, amount, taken }) {
  await bidder(page, by).click();
  await bid(page, amount);
  for (const [key, side] of Object.entries(taken)) {
    await itemSide(page, key, side).click();
  }
  await page.locator('#score').click();
}

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
});

test.describe('the sheet', () => {
  test('opens on four players, ten point, two teams', async ({ page }) => {
    await expect(page.locator('.total')).toHaveCount(2);
    await expect(page.locator('.total .total-name').first()).toHaveText('Team 1');
    await expect(page.locator('#items .item')).toHaveCount(8);
    await expect(page.locator('#empty')).toBeVisible();
    await expect(total(page, 0)).toHaveText('0');
  });

  test('the point rows and their worth come from the point set', async ({ page }) => {
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('#items .item')].map(r => ({
        key: r.dataset.item,
        name: r.querySelector('.item-name').textContent.trim(),
      })));
    expect(rows.map(r => r.key)).toEqual([
      'high', 'low', 'jack', 'offjack', 'hijoker', 'lojoker', 'three', 'game']);
    expect(rows.find(r => r.key === 'three').name).toBe('Three (3)');
    expect(rows.find(r => r.key === 'high').name).toBe('High');
  });

  test('the panel counts down the points still to place', async ({ page }) => {
    await expect(page.locator('#entry-left')).toHaveText('10 of 10 still to place');
    await itemSide(page, 'three', 0).click();
    await expect(page.locator('#entry-left')).toHaveText('7 of 10 still to place');
  });

  test('tapping the chosen side again clears it', async ({ page }) => {
    await itemSide(page, 'high', 1).click();
    await expect(itemSide(page, 'high', 1)).toHaveAttribute('aria-pressed', 'true');
    await itemSide(page, 'high', 1).click();
    await expect(itemSide(page, 'high', 1)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#entry-left')).toHaveText('10 of 10 still to place');
  });
});

test.describe('scoring a hand', () => {
  test('a made bid scores what was taken', async ({ page }) => {
    // Team 1 bid 4 and took High, Low, Three and Game: 6 points.
    await hand(page, {
      by: 0, amount: 4,
      taken: { high: 0, low: 0, three: 0, game: 0, jack: 1, offjack: 1 },
    });
    await expect(total(page, 0)).toHaveText('6');
    await expect(total(page, 1)).toHaveText('2');
    await expect(page.locator('#empty')).toBeHidden();
  });

  test('falling short of the bid loses it outright', async ({ page }) => {
    // Team 1 bid 7 and took only 2, so they score -7 rather than 2.
    await hand(page, {
      by: 0, amount: 7,
      taken: { high: 0, low: 0, three: 1, game: 1, jack: 1, offjack: 1 },
    });
    await expect(total(page, 0)).toHaveText('-7');
    await expect(total(page, 1)).toHaveText('6');
  });

  test('the bidder is marked and a set hand reads as a loss', async ({ page }) => {
    await hand(page, { by: 0, amount: 7, taken: { high: 0 } });
    const cell = page.locator('#rows tr .pts').first();
    await expect(cell).toHaveAttribute('data-bidder', '');
    await expect(cell).toHaveAttribute('data-sign', 'down');
    await expect(page.locator('#rows .bidcell')).toHaveText('Team 1 7');
  });

  test('points nobody was given score for nobody', async ({ page }) => {
    await hand(page, { by: 0, amount: 2, taken: { high: 0, low: 1 } });
    await expect(total(page, 0)).toHaveText('-2');
    await expect(total(page, 1)).toHaveText('1');
  });

  test('totals add up across hands', async ({ page }) => {
    for (let i = 0; i < 2; i++) {
      await hand(page, { by: 0, amount: 4, taken: { three: 0, high: 0, game: 1 } });
    }
    await expect(page.locator('#rows tr')).toHaveCount(2);
    await expect(total(page, 0)).toHaveText('8');
    await expect(total(page, 1)).toHaveText('2');
  });

  test('undo removes the last hand only', async ({ page }) => {
    await hand(page, { by: 0, amount: 4, taken: { three: 0, high: 0 } });
    await hand(page, { by: 1, amount: 4, taken: { three: 1, high: 1 } });
    await expect(page.locator('#rows tr')).toHaveCount(2);
    await page.locator('#undo').click();
    await expect(page.locator('#rows tr')).toHaveCount(1);
    await expect(total(page, 0)).toHaveText('4');
  });

  test('undo is disabled before anything is scored', async ({ page }) => {
    await expect(page.locator('#undo')).toBeDisabled();
  });
});

test.describe('bidding', () => {
  test('the bid runs two to the version total', async ({ page }) => {
    await bid(page, 2);
    await expect(page.locator('#bid-down')).toBeDisabled();
    await bid(page, 10);
    await expect(page.locator('#bid-value')).toHaveText('10');
    await expect(page.locator('#bid-up')).toBeDisabled();
  });
});

test.describe('players and point versions', () => {
  test('five players is five sides, one per player', async ({ page }) => {
    await page.locator('#settings-btn').click();
    await page.locator('#players-5').click();
    await expect(page.locator('.total')).toHaveCount(5);
    await expect(page.locator('.total .total-name').first()).toHaveText('P1');
    await expect(page.locator('.item[data-item="high"] .side')).toHaveCount(5);
  });

  test('thirteen point adds the five and raises the ceiling', async ({ page }) => {
    await page.locator('#settings-btn').click();
    await page.locator('#points-13').click();
    await page.locator('#settings .modal-close').click();
    await expect(page.locator('#items .item')).toHaveCount(9);
    await expect(page.locator('#items .item[data-item="five"] .item-name'))
      .toHaveText('Five (Pedro) (3)');
    await expect(page.locator('#entry-left')).toHaveText('13 of 13 still to place');
    await bid(page, 13);
    await expect(page.locator('#bid-up')).toBeDisabled();
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
    await hand(page, {
      by: 2, amount: 4, taken: { three: 2, high: 2, low: 0, game: 4 },
    });
    await expect(total(page, 2)).toHaveText('4');
    await expect(total(page, 0)).toHaveText('1');
    await expect(total(page, 4)).toHaveText('1');
    await expect(total(page, 1)).toHaveText('0');
  });

  test('changing the version clears the sheet', async ({ page }) => {
    await hand(page, { by: 0, amount: 4, taken: { three: 0, high: 0 } });
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
      await hand(page, { by: 0, amount: 4, taken: { three: 0, high: 0 } });
      await bidder(page, 1).click();
      await bid(page, 6);
      await itemSide(page, 'game', 1).click();

      await page.reload();
      await expect(page.locator('#rows tr')).toHaveCount(1);
      await expect(total(page, 0)).toHaveText('4');
      await expect(page.locator('#bid-value')).toHaveText('6');
      await expect(bidder(page, 1)).toHaveAttribute('aria-pressed', 'true');
      await expect(itemSide(page, 'game', 1)).toHaveAttribute('aria-pressed', 'true');
    });

  test('the settings survive a reload', async ({ page }) => {
    await page.locator('#settings-btn').click();
    await page.locator('#players-5').click();
    await page.locator('#points-13').click();
    await page.reload();
    await expect(page.locator('.total')).toHaveCount(5);
    await expect(page.locator('#items .item')).toHaveCount(9);
  });

  test('corrupt saved state falls back to an empty sheet', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('games.pitch.v1', 'not json'));
    await page.reload();
    await expect(page.locator('#rows tr')).toHaveCount(0);
    await expect(total(page, 0)).toHaveText('0');
  });

  test('a stored point that no longer exists is simply unread', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('games.pitch.v1', JSON.stringify({
      players: 4, points: 10,
      rounds: [{ bidder: 0, bid: 2, taken: { high: 0, nonsense: 1 } }],
      draft: { bidder: 0, bid: 4, taken: {} },
    })));
    await page.reload();
    await expect(page.locator('#rows tr')).toHaveCount(1);
    // High alone is 1 against a bid of 2, so the bidder is set; the point
    // parked on the unknown key scores for nobody.
    await expect(total(page, 0)).toHaveText('-2');
    await expect(total(page, 1)).toHaveText('0');
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

  test('survives markup from the neighbouring release', async ({ page }) => {
    const errors = trackErrors(page);
    await page.route('**/games/pitch/', async route => {
      const res = await route.fetch();
      const body = (await res.text()).replace(/<button id="undo"[\s\S]*?<\/button>/, '');
      await route.fulfill({ response: res, body });
    });
    await page.goto(URL);
    await expect(page.locator('#undo')).toHaveCount(0);
    await expect(page.locator('#items .item')).toHaveCount(8);
    expect(errors).toEqual([]);
  });

  test('no external requests and no raster images', async ({ page }) => {
    const external = trackExternalRequests(page);
    await page.goto(URL);
    await expect(page.locator('img')).toHaveCount(0);
    expect(external).toEqual([]);
  });
});
