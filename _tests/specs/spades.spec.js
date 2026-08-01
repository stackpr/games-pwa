const { test, expect } = require('@playwright/test');
const { clearState, trackExternalRequests } = require('../helpers');

const URL = '/games/spades/';

const step = (page, kind, seat, dir) =>
  page.locator(`.step[data-kind="${kind}"][data-seat="${seat}"][data-dir="${dir}"]`);
const bidValue = (page, seat) => page.locator(`.value[data-kind="bid"][data-seat="${seat}"]`);
const total = (page, team) => page.locator(`#total-${team}`);
const cell = (page, team, what) => page.locator(`#rows .${what}[data-team="${team}"]`);

/** Nudges a stepper `n` times; negative goes down. */
async function nudge(page, kind, seat, n) {
  const dir = n > 0 ? 'up' : 'down';
  for (let i = 0; i < Math.abs(n); i++) await step(page, kind, seat, dir).click();
}

/** Bids default to 3, so this walks each seat to the value asked for. */
async function setBids(page, bids) {
  for (let seat = 0; seat < 4; seat++) {
    // The ladder is Blind, Nil, 1..13 — so index, not value, is the distance.
    const ladder = ['blind', 'nil'].concat(
      Array.from({ length: 13 }, (_, i) => i + 1));
    const want = ladder.indexOf(bids[seat]);
    const from = ladder.indexOf(3);
    await nudge(page, 'bid', seat, want - from);
  }
}

async function setTricks(page, tricks) {
  for (let seat = 0; seat < 4; seat++) await nudge(page, 'tricks', seat, tricks[seat]);
}

test.beforeEach(async ({ page }) => {
  await page.goto(URL);
  await clearState(page);
});

test.describe('the sheet', () => {
  test('starts empty with both teams on zero', async ({ page }) => {
    await expect(page.locator('#rows tr')).toHaveCount(0);
    await expect(total(page, 1)).toHaveText('0');
    await expect(total(page, 2)).toHaveText('0');
    await expect(page.locator('#empty')).toBeVisible();
  });

  test('a scored round becomes a row showing both teams', async ({ page }) => {
    await setBids(page, [4, 2, 3, 4]);
    await setTricks(page, [4, 2, 3, 4]);
    await page.locator('#score-round').click();

    await expect(page.locator('#rows tr')).toHaveCount(1);
    // Partners sit across: team 1 is seats 1 and 3.
    await expect(cell(page, 1, 'bids')).toHaveText('4 / 3');
    await expect(cell(page, 2, 'bids')).toHaveText('2 / 4');
    await expect(page.locator('#empty')).toBeHidden();
  });

  test('totals accumulate across rounds', async ({ page }) => {
    for (let r = 0; r < 2; r++) {
      await setBids(page, [4, 2, 3, 4]);
      await setTricks(page, [4, 2, 3, 4]);
      await page.locator('#score-round').click();
    }
    await expect(page.locator('#rows tr')).toHaveCount(2);
    await expect(total(page, 1)).toHaveText('140');   // 70 twice
    await expect(total(page, 2)).toHaveText('120');   // 60 twice
  });

  test('undo removes the last round only', async ({ page }) => {
    await setBids(page, [4, 2, 3, 4]);
    await setTricks(page, [4, 2, 3, 4]);
    await page.locator('#score-round').click();
    await setBids(page, [1, 1, 1, 1]);
    await setTricks(page, [1, 1, 1, 1]);
    await page.locator('#score-round').click();

    await expect(page.locator('#rows tr')).toHaveCount(2);
    await page.locator('#undo').click();
    await expect(page.locator('#rows tr')).toHaveCount(1);
    await expect(total(page, 1)).toHaveText('70');
  });
});

test.describe('bidding', () => {
  test('steps down through nil to blind nil, and stops there', async ({ page }) => {
    await expect(bidValue(page, 0)).toHaveText('3');
    await nudge(page, 'bid', 0, -2);
    await expect(bidValue(page, 0)).toHaveText('1');
    await nudge(page, 'bid', 0, -1);
    await expect(bidValue(page, 0)).toHaveText('Nil');
    await nudge(page, 'bid', 0, -1);
    await expect(bidValue(page, 0)).toHaveText('Blind');
    // Blind nil is the floor.
    await expect(step(page, 'bid', 0, 'down')).toBeDisabled();
  });

  test('stops at thirteen going up', async ({ page }) => {
    await nudge(page, 'bid', 0, 10);
    await expect(bidValue(page, 0)).toHaveText('13');
    await expect(step(page, 'bid', 0, 'up')).toBeDisabled();
  });

  test('tricks run zero to thirteen', async ({ page }) => {
    await expect(step(page, 'tricks', 0, 'down')).toBeDisabled();
    await nudge(page, 'tricks', 0, 13);
    await expect(step(page, 'tricks', 0, 'up')).toBeDisabled();
  });
});

test.describe('scoring', () => {
  const cases = [
    {
      name: 'making the contract is ten a trick',
      bids: [4, 2, 3, 4], tricks: [4, 2, 3, 4], t1: '70', t2: '60',
    },
    {
      name: 'overtricks are worth one each',
      bids: [4, 2, 3, 4], tricks: [5, 2, 4, 4], t1: '72', t2: '60',
    },
    {
      name: 'being set costs ten a bid trick',
      bids: [5, 2, 3, 4], tricks: [2, 3, 2, 5], t1: '-80', t2: '62',
    },
    {
      name: 'a made nil is worth a hundred on top',
      bids: ['nil', 2, 5, 4], tricks: [0, 2, 6, 4], t1: '151', t2: '60',
    },
    {
      name: 'a failed nil costs a hundred but its tricks still count',
      bids: ['nil', 2, 5, 4], tricks: [1, 2, 5, 4], t1: '-49', t2: '60',
    },
    {
      name: 'blind nil doubles it',
      bids: ['blind', 2, 4, 4], tricks: [0, 2, 4, 4], t1: '240', t2: '60',
    },
  ];

  for (const c of cases) {
    test(c.name, async ({ page }) => {
      await setBids(page, c.bids);
      await setTricks(page, c.tricks);
      await page.locator('#score-round').click();
      await expect(total(page, 1)).toHaveText(c.t1);
      await expect(total(page, 2)).toHaveText(c.t2);
    });
  }

  test('a negative round is marked as a loss', async ({ page }) => {
    await setBids(page, [5, 2, 3, 4]);
    await setTricks(page, [2, 3, 2, 5]);
    await page.locator('#score-round').click();
    await expect(cell(page, 1, 'pts')).toHaveAttribute('data-sign', 'down');
    await expect(cell(page, 2, 'pts')).not.toHaveAttribute('data-sign', 'down');
  });
});

test.describe('the deal', () => {
  test('P1 deals first and it rotates a seat each round', async ({ page }) => {
    const dealer = () => page.evaluate(() =>
      [...document.querySelectorAll('.seat-name')]
        .findIndex(s => s.querySelector('.deal').textContent.trim() !== ''));

    expect(await dealer()).toBe(0);
    for (const expected of [1, 2, 3, 0]) {
      await setBids(page, [3, 3, 3, 3]);
      await setTricks(page, [3, 3, 3, 3]);
      await page.locator('#score-round').click();
      expect(await dealer()).toBe(expected);
    }
  });
});

test.describe('persistence', () => {
  test('rounds survive a reload', async ({ page }) => {
    await setBids(page, [4, 2, 3, 4]);
    await setTricks(page, [4, 2, 3, 4]);
    await page.locator('#score-round').click();
    await page.reload();
    await expect(page.locator('#rows tr')).toHaveCount(1);
    await expect(total(page, 1)).toHaveText('70');
  });

  test('only the rounds are stored', async ({ page }) => {
    await setBids(page, [4, 2, 3, 4]);
    await setTricks(page, [4, 2, 3, 4]);
    await page.locator('#score-round').click();
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('games.spades.v1')));
    expect(saved).toEqual({ rounds: [{ bids: [4, 2, 3, 4], tricks: [4, 2, 3, 4] }] });
  });

  test('corrupt saved state falls back to an empty sheet', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('games.spades.v1', 'not json'));
    await page.reload();
    await expect(page.locator('#rows tr')).toHaveCount(0);
    await expect(total(page, 1)).toHaveText('0');
  });
});

test.describe('presentation', () => {
  test('the scoring modal explains the rules', async ({ page }) => {
    await expect(page.locator('#rules')).toBeHidden();
    await page.locator('#rules-btn').click();
    await expect(page.locator('#rules')).toBeVisible();
    await expect(page.locator('#rules')).toContainText('Nil');
    await page.keyboard.press('Escape');
    await expect(page.locator('#rules')).toBeHidden();
  });

  test('no external requests and no raster images', async ({ page }) => {
    const external = trackExternalRequests(page);
    await page.goto(URL);
    await expect(page.locator('img')).toHaveCount(0);
    expect(external).toEqual([]);
  });

  test('nothing overflows sideways', async ({ page }) => {
    for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size);
      const over = await page.evaluate(() =>
        document.documentElement.scrollWidth - window.innerWidth);
      expect(over, `${size.width}x${size.height}`).toBeLessThanOrEqual(0);
    }
  });
});
